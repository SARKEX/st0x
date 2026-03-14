type FetchLike = typeof fetch;

export interface FetchJsonOptions extends RequestInit {
	retries?: number;
	retryDelayMs?: number;
	fetchFn?: FetchLike;
}

const defaultRetryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

async function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Internal fetch with exponential backoff for transient failures.
 * Shared by fetchJson and fetchText.
 */
async function fetchWithRetry<T>(
	url: string,
	init: FetchJsonOptions | undefined,
	parseResponse: (response: Response) => Promise<T>
): Promise<T> {
	const { retries = 2, retryDelayMs = 500, fetchFn = fetch, ...requestInit } = init ?? {};

	let attempt = 0;
	let lastError: unknown;

	while (attempt <= retries) {
		try {
			const response = await fetchFn(url, requestInit);
			const text = await response.text();
			if (!response.ok) {
				// Only retry on selected status codes
				if (defaultRetryableStatuses.has(response.status) && attempt < retries) {
					attempt += 1;
					const retryAfter = response.headers.get('Retry-After');
					const parsed = retryAfter ? Number(retryAfter) * 1000 : NaN;
					const retryDelay =
						retryAfter && !isNaN(parsed)
							? Math.min(parsed, 30_000)
							: retryDelayMs * Math.pow(2, attempt - 1);
					await delay(retryDelay);
					continue;
				}
				const message = text || `${response.status} ${response.statusText}`;
				throw new Error(`HTTP ${response.status}: ${message}`);
			}

			// Create a synthetic Response with the already-read text for the parser
			return await parseResponse(
				new Response(text, { status: response.status, headers: response.headers })
			);
		} catch (error) {
			lastError = error;
			if (attempt >= retries) {
				break;
			}
			attempt += 1;
			await delay(retryDelayMs * Math.pow(2, attempt - 1));
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

/**
 * Fetch JSON with exponential backoff for transient failures.
 */
export async function fetchJson<T>(url: string, init?: FetchJsonOptions): Promise<T> {
	return fetchWithRetry(url, init, async (response) => {
		const text = await response.text();
		if (!text) return null as T;
		return JSON.parse(text) as T;
	});
}

/**
 * Fetch text (for YAML, plain text, etc.) with exponential backoff
 */
export async function fetchText(url: string, init?: FetchJsonOptions): Promise<string> {
	return fetchWithRetry(url, init, (response) => response.text());
}
