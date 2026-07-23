// Public API endpoint for displayable token prices.
//
// The displayed price for the sidebar, homepage table and strategy price tables is the
// midpoint of the best bid and best ask, computed server-side from live orders using the
// same (trusted) quoting pipeline the trade UI uses. A midpoint is only ever derived from a
// two-sided book; when a side is missing/zero (market closed, thin book) we fall back to the
// last valid midpoint persisted in KV, and failing that we return null (the UI shows N/A).
// The hard rule "never show a one-sided midpoint" lives in resolveMidpoints().
//
// Fetches from the st0x REST API server-side (bypassing the browser-only proxy), mirroring
// /api/public/trade-activity.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { kvGet, kvSet, KV_KEYS } from '$lib/server/kv';
import { PUBLIC_PRICES_CACHE_CONTROL } from '$lib/config/publicPrices';
import { getCachedPublicPrices } from '$lib/server/publicPricesCache';
import { createServerOrderFetcher } from '$lib/server/st0xOrderFetcher';
import {
	networks,
	TOKENS,
	getDefaultPaymentTokenForNetwork,
	DEFAULT_PAYMENT_TOKENS,
	getTokenByAnyAddress
} from '$lib/config/network';
import type { Network } from '$lib/config/network';
import {
	fetchAndQuotePaymentTokenOrders,
	buildTokenPriceMap,
	type TokenPriceSummary
} from '$lib/api/orders';
import {
	pickBestBidAsk,
	resolveMidpoints,
	type LastKnownMidpoint,
	type MidpointPrice
} from '$lib/utils/midpointPrice';
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';

export interface PublicPricesResponse {
	success: boolean;
	/** networkId (stringified) -> lowercased canonical token address -> price. */
	prices: Record<string, Record<string, MidpointPrice>>;
}

// ============================================================================
// Server-side REST API fetch (bypasses the browser-only proxy)
// ============================================================================

function getApiConfig(): { apiBase: string; authHeader: string } | null {
	const url = env.ST0X_API_URL;
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!url || !key || !secret) return null;
	return {
		apiBase: url.replace(/\/+$/, ''),
		authHeader: 'Basic ' + btoa(`${key}:${secret}`)
	};
}

// ============================================================================
// Per-network midpoint computation
// ============================================================================

/** All lowercased addresses (wrapped + legacy) that represent a configured token. */
function tokenVariantAddresses(tokenAddress: string): string[] {
	const canonical = tokenAddress.toLowerCase();
	const variants = new Set<string>([canonical]);
	const resolved = getTokenByAnyAddress(tokenAddress);
	if (resolved?.address) variants.add(resolved.address.toLowerCase());
	if (resolved?.legacyAddress) variants.add(resolved.legacyAddress.toLowerCase());
	return [...variants];
}

async function computeNetworkPrices(
	network: Network,
	now: number
): Promise<Record<string, MidpointPrice>> {
	const paymentToken =
		getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
	const stockTokens = TOKENS.filter(
		(token) => token.chainId === network.chainId && token.category === 'ST0x'
	);

	// Live bid/ask summary (best-effort). On any failure the summary stays empty and every
	// token falls back to its cached last-known midpoint.
	const summary: Record<string, TokenPriceSummary> = {};
	const config = getApiConfig();
	if (config && paymentToken?.address) {
		try {
			const quotes = await fetchAndQuotePaymentTokenOrders(
				network.id,
				undefined,
				createServerOrderFetcher(config)
			);
			const map = buildTokenPriceMap(quotes, paymentToken.address);
			for (const [address, value] of map.entries()) {
				summary[address.toLowerCase()] = value;
			}
		} catch (error) {
			logQueryFailure({
				kind: 'public_endpoint_network_failed',
				endpoint: 'public-prices',
				network: network.name,
				error: errorMessage(error)
			});
		}
	}

	// Merge each configured token's bid/ask across its address variants → canonical key.
	const tokens = stockTokens.map((token) => {
		const { bid, ask } = pickBestBidAsk(
			tokenVariantAddresses(token.address).map((v) => summary[v])
		);
		return { address: token.address.toLowerCase(), bid, ask };
	});

	// Resolve with the hard rule against the persisted fallback, then persist — but only when
	// at least one token produced a fresh live price. Skipping the write when nothing is live
	// avoids clobbering history during a transient upstream/market-closed window.
	const lastKnown =
		(await kvGet<Record<string, LastKnownMidpoint>>(KV_KEYS.midpointLastKnown(network.id))) ?? {};
	const { prices, nextLastKnown, liveCount } = resolveMidpoints(tokens, lastKnown, now);
	if (liveCount > 0) {
		await kvSet(KV_KEYS.midpointLastKnown(network.id), nextLastKnown);
	}

	return prices;
}

async function computePrices(): Promise<PublicPricesResponse> {
	const now = Date.now();
	const entries = await Promise.all(
		networks.map(async (network) => {
			try {
				return [String(network.id), await computeNetworkPrices(network, now)] as const;
			} catch (error) {
				logQueryFailure({
					kind: 'public_endpoint_network_failed',
					endpoint: 'public-prices',
					network: network.name,
					error: errorMessage(error)
				});
				return [String(network.id), {} as Record<string, MidpointPrice>] as const;
			}
		})
	);
	return { success: true, prices: Object.fromEntries(entries) };
}

export const GET: RequestHandler = async ({ request }) => {
	const clientIp = getClientIp(request);
	const rateLimit = await rateLimiters.publicApi(`public-api:${clientIp}`);

	if (!rateLimit.allowed) {
		return json(
			{ success: false, error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
					'X-RateLimit-Remaining': String(rateLimit.remaining),
					'X-RateLimit-Reset': String(rateLimit.resetAt)
				}
			}
		);
	}

	try {
		const data = await getCachedPublicPrices<PublicPricesResponse>(
			computePrices,
			(result) => result.success
		);

		return json(data, {
			headers: {
				'Cache-Control': PUBLIC_PRICES_CACHE_CONTROL
			}
		});
	} catch (error) {
		console.error('[Public Prices] Error:', error);
		return json({ success: false, prices: {} } satisfies PublicPricesResponse, { status: 500 });
	}
};
