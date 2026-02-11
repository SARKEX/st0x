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
 * Fetch JSON with exponential backoff for transient failures.
 */
export async function fetchJson<T>(url: string, init?: FetchJsonOptions): Promise<T> {
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

			if (!text) return null as T;
			return JSON.parse(text) as T;
		} catch (error) {
			lastError = error;
			if (attempt >= retries) {
				break;
			}
			attempt += 1;
			await delay(retryDelayMs * Math.pow(2, attempt - 1));
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Unknown fetchJson error');
}

/**
 * Fetch text (for YAML, plain text, etc.) with exponential backoff
 */
export async function fetchText(url: string, init?: FetchJsonOptions): Promise<string> {
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

			return text;
		} catch (error) {
			lastError = error;
			if (attempt >= retries) {
				break;
			}
			attempt += 1;
			await delay(retryDelayMs * Math.pow(2, attempt - 1));
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Unknown fetchText error');
}
