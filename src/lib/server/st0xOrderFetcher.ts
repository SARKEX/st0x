import type { OrdersByTokenFetcher } from '$lib/api/orders';
import type { ApiOrdersListResponse } from '$lib/api/st0xApi';

export class St0xOrdersRateLimitError extends Error {
	constructor(message = 'ST0x orders API rate limit reached') {
		super(message);
		this.name = 'St0xOrdersRateLimitError';
	}
}

interface ServerOrderFetcherOptions {
	apiBase: string;
	authHeader: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
}

/**
 * Create a REST order fetcher with a per-run rate-limit circuit breaker.
 *
 * A public-price refresh fans out across every configured stock token. Once one
 * request receives 429, the shared API-key budget is exhausted, so sending the
 * rest of that fanout only prolongs the incident. The breaker stops subsequent
 * workers in the same refresh and lets the pricing resolver use last-known data.
 */
export function createServerOrderFetcher({
	apiBase,
	authHeader,
	fetchFn = fetch,
	timeoutMs = 10_000
}: ServerOrderFetcherOptions): OrdersByTokenFetcher {
	let rateLimited = false;

	return async (tokenAddress, options) => {
		if (rateLimited) {
			throw new St0xOrdersRateLimitError();
		}

		const params = new URLSearchParams();
		if (options?.page !== undefined) params.set('page', String(options.page));
		if (options?.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
		if (options?.side) params.set('side', options.side);
		if (options?.state) params.set('state', options.state);
		const qs = params.toString();
		const url = `${apiBase}/v1/orders/token/${tokenAddress}${qs ? `?${qs}` : ''}`;
		const response = await fetchFn(url, {
			headers: { Authorization: authHeader, Accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs)
		});

		if (response.status === 429) {
			rateLimited = true;
			throw new St0xOrdersRateLimitError();
		}
		if (!response.ok) {
			throw new Error(`Orders fetch failed (${response.status}) for ${tokenAddress}`);
		}
		return (await response.json()) as ApiOrdersListResponse;
	};
}
