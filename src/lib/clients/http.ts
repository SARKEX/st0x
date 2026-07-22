type FetchLike = typeof fetch;

export interface FetchJsonOptions extends RequestInit {
	retries?: number;
	retryDelayMs?: number;
	fetchFn?: FetchLike;
}

// NOTE: 429 (Too Many Requests) and 503 (Service Unavailable) are deliberately
// EXCLUDED. When the upstream is overloaded and shedding load, retrying these is a
// retry storm that amplifies the very problem — every retry adds load precisely when
// the backend can least handle it. These calls fan out per-token across many users, so
// an immediate retry on an explicit "back off" signal is always wrong. Callers that
// need to react to a rate limit should surface it (see isRateLimitError) and let the
// caller's own backoff/poll cadence handle the next attempt.
const defaultRetryableStatuses = new Set([408, 500, 502, 504]);

/** True when an error thrown by fetchJson/fetchText represents an upstream 429. */
export function isRateLimitError(error: unknown): boolean {
	return error instanceof Error && /^HTTP 429\b/.test(error.message);
}

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
					await delay(retryDelayMs * Math.pow(2, attempt - 1));
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
		if (!text) throw new Error(`Empty response body from ${url}`);
		return JSON.parse(text) as T;
	});
}

/**
 * Fetch text (for YAML, plain text, etc.) with exponential backoff
 */
export async function fetchText(url: string, init?: FetchJsonOptions): Promise<string> {
	return fetchWithRetry(url, init, (response) => response.text());
}
