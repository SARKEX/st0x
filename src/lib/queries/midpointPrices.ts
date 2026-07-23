import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import { getTokenByAnyAddress } from '$lib/config/network';
import { PUBLIC_PRICES_REFRESH_INTERVAL_MS } from '$lib/config/publicPrices';
import type { MidpointPrice } from '$lib/utils/midpointPrice';

export type { MidpointPrice };

/** Shape returned by GET /api/public/prices (kept in sync with the endpoint). */
interface PublicPricesResponse {
	success: boolean;
	prices: Record<string, Record<string, MidpointPrice>>;
}

export async function fetchMidpointPrices(
	networkId: number,
	fetchFn: typeof fetch = fetch
): Promise<Record<string, MidpointPrice>> {
	const response = await fetchFn('/api/public/prices');
	if (!response.ok) {
		throw new Error(`Public prices request failed (${response.status})`);
	}
	const data: PublicPricesResponse = await response.json();
	return data.prices?.[String(networkId)] ?? {};
}

/**
 * Query for displayable token prices (bid/ask midpoints) from the public prices endpoint.
 * Returns a map of lowercased canonical token address -> price for the current network.
 * Shared across the sidebar, homepage table and strategy price tables via its query key.
 */
export function createMidpointPricesQuery(network: Network | null) {
	return createQuery<Record<string, MidpointPrice>>({
		queryKey: ['midpointPrices', network?.id],
		enabled: Boolean(browser && network),
		staleTime: PUBLIC_PRICES_REFRESH_INTERVAL_MS,
		refetchInterval: PUBLIC_PRICES_REFRESH_INTERVAL_MS,
		refetchOnWindowFocus: false,
		refetchIntervalInBackground: false,
		retry: false,
		queryFn: async () => {
			if (!network) return {};
			return fetchMidpointPrices(network.id);
		}
	});
}

/**
 * Resolve a token's midpoint price, matching wrapped/unwrapped/legacy address variants.
 * The endpoint keys prices by the canonical (wrapped) address, so callers can pass any
 * variant (e.g. an SFT's unwrapped address) and still get a hit.
 */
export function getMidpointPrice(
	map: Record<string, MidpointPrice> | undefined,
	tokenAddress: string | null | undefined
): MidpointPrice | undefined {
	if (!map || !tokenAddress) return undefined;
	const direct = map[tokenAddress.toLowerCase()];
	if (direct) return direct;
	const token = getTokenByAnyAddress(tokenAddress);
	if (token?.address) {
		const byCanonical = map[token.address.toLowerCase()];
		if (byCanonical) return byCanonical;
	}
	if (token?.legacyAddress) {
		const byLegacy = map[token.legacyAddress.toLowerCase()];
		if (byLegacy) return byLegacy;
	}
	return undefined;
}
