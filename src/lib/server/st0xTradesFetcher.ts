import type { ApiTradesByAddressResponse, ApiTradesTokensQueryRequest } from '$lib/api/st0xApi';
import { parseRetryAfterMs } from '$lib/clients/http';
import { logSt0xRequestBudget } from '$lib/server/st0xBudgetTelemetry';
import type { St0xCredentialLabel } from '$lib/types/st0x';

export type ServerTradesQueryFetcher = (
	request: ApiTradesTokensQueryRequest
) => Promise<ApiTradesByAddressResponse>;

interface ServerTradesFetcherOptions {
	apiBase: string;
	authHeader: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
	credentialLabel?: St0xCredentialLabel;
	signal?: AbortSignal;
}

export class St0xTradesRateLimitError extends Error {
	readonly retryAfterMs: number | null;

	constructor(retryAfterMs: number | null = null, message = 'ST0x trades API rate limit reached') {
		super(message);
		this.name = 'St0xTradesRateLimitError';
		this.retryAfterMs = retryAfterMs;
	}
}

export function createServerTradesQueryFetcher({
	apiBase,
	authHeader,
	fetchFn = fetch,
	timeoutMs = 15_000,
	credentialLabel = 'general',
	signal
}: ServerTradesFetcherOptions): ServerTradesQueryFetcher {
	let rateLimitError: St0xTradesRateLimitError | null = null;

	return async (request) => {
		if (rateLimitError) throw rateLimitError;

		const requestController = new AbortController();
		const forwardAbort = () => requestController.abort(signal?.reason);
		if (signal?.aborted) {
			forwardAbort();
		} else {
			signal?.addEventListener('abort', forwardAbort, { once: true });
		}
		const timeout = setTimeout(() => requestController.abort(), timeoutMs);

		try {
			const response = await fetchFn(`${apiBase}/v1/trades/query`, {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(request),
				signal: requestController.signal
			});
			logSt0xRequestBudget('v1/trades/query', credentialLabel, response);
			if (response.status === 429) {
				rateLimitError = new St0xTradesRateLimitError(
					parseRetryAfterMs(response.headers.get('Retry-After'))
				);
				throw rateLimitError;
			}
			if (!response.ok) {
				throw new Error(`Batch trades fetch failed (${response.status})`);
			}
			return (await response.json()) as ApiTradesByAddressResponse;
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener('abort', forwardAbort);
		}
	};
}
