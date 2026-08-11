// Public API endpoint for displayable token prices.
//
// The REST API owns order-book sampling, midpoint calculation, canonical
// address handling, and retained out-of-hours prices. This endpoint only
// exposes that authenticated service to unauthenticated website displays.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { PUBLIC_PRICES_FAILURE_RETRY_SECONDS } from '$lib/config/publicPrices';
import {
	getCachedPublicPrices,
	publicPricesCacheControl,
	type PublicPricesSnapshot
} from '$lib/server/publicPricesCache';
import { networks } from '$lib/config/network';
import {
	fetchMarketPrices,
	St0xMarketPricesRateLimitError,
	toWebsiteMarketPrices
} from '$lib/server/marketPrices';
import type { MidpointPrice } from '$lib/utils/midpointPrice';
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';
import { ensureServerApplicationCatalog } from '$lib/server/applicationCatalog';

export type PublicPricesResponse =
	| PublicPricesSnapshot
	| {
			success: false;
			prices: Record<string, Record<string, MidpointPrice>>;
	  };

async function computePrices(): Promise<PublicPricesSnapshot> {
	const entries = await Promise.all(
		networks.map(async (network) => {
			try {
				const rows = await fetchMarketPrices(network.chainId);
				const prices = toWebsiteMarketPrices(rows);
				return [String(network.id), prices] as const;
			} catch (error) {
				logQueryFailure({
					kind: 'public_endpoint_network_failed',
					endpoint: 'public-prices',
					network: network.name,
					error: errorMessage(error)
				});
				throw error;
			}
		})
	);
	return { success: true, prices: Object.fromEntries(entries) };
}

export const GET: RequestHandler = async ({ request }) => {
	await ensureServerApplicationCatalog();
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
		const cached = await getCachedPublicPrices(computePrices);

		return json(cached.value, {
			headers: {
				'Cache-Control': publicPricesCacheControl(cached)
			}
		});
	} catch (error) {
		if (error instanceof St0xMarketPricesRateLimitError) {
			const retryAfterSeconds = Math.max(
				1,
				Math.ceil((error.retryAfterMs ?? PUBLIC_PRICES_FAILURE_RETRY_SECONDS * 1_000) / 1_000)
			);
			return json({ success: false, prices: {} } satisfies PublicPricesResponse, {
				status: 429,
				headers: {
					'Retry-After': String(retryAfterSeconds),
					'Cache-Control': 'no-store'
				}
			});
		}
		console.error('[Public Prices] Error:', error);
		return json({ success: false, prices: {} } satisfies PublicPricesResponse, { status: 500 });
	}
};
