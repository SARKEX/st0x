import type { ApiTradesByAddressResponse, ApiTradesTokensQueryRequest } from '$lib/api/st0xApi';

export type ServerTradesQueryFetcher = (
	request: ApiTradesTokensQueryRequest
) => Promise<ApiTradesByAddressResponse>;

interface ServerTradesFetcherOptions {
	apiBase: string;
	authHeader: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
}

export function createServerTradesQueryFetcher({
	apiBase,
	authHeader,
	fetchFn = fetch,
	timeoutMs = 15_000
}: ServerTradesFetcherOptions): ServerTradesQueryFetcher {
	return async (request) => {
		const response = await fetchFn(`${apiBase}/v1/trades/query`, {
			method: 'POST',
			headers: {
				Authorization: authHeader,
				Accept: 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) {
			throw new Error(`Batch trades fetch failed (${response.status})`);
		}
		return (await response.json()) as ApiTradesByAddressResponse;
	};
}
