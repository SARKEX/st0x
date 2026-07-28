type FetchLike = typeof fetch;

export interface FetchJsonOptions extends RequestInit {
	retries?: number;
	retryDelayMs?: number;
	fetchFn?: FetchLike;
}

interface ErrorEnvelope {
	request_id?: unknown;
	error?: {
		code?: unknown;
		message?: unknown;
	};
}

export interface HttpErrorOptions {
	status: number;
	code: string;
	requestId: string | null;
	publicMessage: string;
	retryAfter: string | null;
}

/** Structured HTTP failure retained across the browser/API proxy boundary. */
export class HttpError extends Error {
	readonly status: number;
	readonly code: string;
	readonly requestId: string | null;
	readonly publicMessage: string;
	readonly retryAfter: string | null;

	constructor(options: HttpErrorOptions) {
		super(options.publicMessage);
		this.name = 'HttpError';
		this.status = options.status;
		this.code = options.code;
		this.requestId = options.requestId;
		this.publicMessage = options.publicMessage;
		this.retryAfter = options.retryAfter;
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
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
	return (
		(isHttpError(error) && error.status === 429) ||
		(error instanceof Error && /^HTTP 429\b/.test(error.message))
	);
}

async function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseErrorEnvelope(text: string): ErrorEnvelope | null {
	if (!text) return null;
	try {
		const value = JSON.parse(text) as unknown;
		return typeof value === 'object' && value !== null ? (value as ErrorEnvelope) : null;
	} catch {
		return null;
	}
}

function httpErrorFromResponse(response: Response, text: string): HttpError {
	const envelope = parseErrorEnvelope(text);
	const code =
		typeof envelope?.error?.code === 'string' ? envelope.error.code : `HTTP_${response.status}`;
	const publicMessage =
		typeof envelope?.error?.message === 'string'
			? envelope.error.message
			: response.statusText || 'Request failed';
	const requestId =
		typeof envelope?.request_id === 'string'
			? envelope.request_id
			: response.headers.get('x-request-id');

	return new HttpError({
		status: response.status,
		code,
		requestId,
		publicMessage,
		retryAfter: response.headers.get('retry-after')
	});
}

function retryDelayFor(error: HttpError, fallbackMs: number): number {
	if (!error.retryAfter) return fallbackMs;

	const seconds = Number(error.retryAfter);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

	const retryAt = Date.parse(error.retryAfter);
	return Number.isNaN(retryAt) ? fallbackMs : Math.max(0, retryAt - Date.now());
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
				const httpError = httpErrorFromResponse(response, text);
				// Only retry on selected status codes
				if (defaultRetryableStatuses.has(response.status) && attempt < retries) {
					attempt += 1;
					await delay(retryDelayFor(httpError, retryDelayMs * Math.pow(2, attempt - 1)));
					continue;
				}
				throw httpError;
			}

			// Create a synthetic Response with the already-read text for the parser
			return await parseResponse(
				new Response(text, { status: response.status, headers: response.headers })
			);
		} catch (error) {
			lastError = error;
			if (isHttpError(error)) {
				break;
			}
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
