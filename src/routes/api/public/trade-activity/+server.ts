import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	computePublicTradeActivity,
	PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS,
	type PublicTradeActivityResponse,
	type PublicTradeActivitySnapshot,
	tradeActivityWindow
} from '$lib/server/publicTradeActivity';
import {
	getCachedPublicTradeActivity,
	publicTradeActivityCacheControl
} from '$lib/server/publicTradeActivityCache';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import {
	createServerTradesQueryFetcher,
	St0xTradesRateLimitError
} from '$lib/server/st0xTradesFetcher';
import { getSt0xActivityApiConfig } from '$lib/server/st0xApiConfig';

export type {
	NetworkTradeStats,
	PublicTradeActivityResponse,
	TokenTradingRow
} from '$lib/server/publicTradeActivity';

async function computeTradeActivity(): Promise<PublicTradeActivitySnapshot> {
	const config = getSt0xActivityApiConfig(env);
	if (!config) {
		throw new Error('ST0x public-activity API credentials are not configured');
	}
	const controller = new AbortController();
	const fetchTrades = createServerTradesQueryFetcher({ ...config, signal: controller.signal });
	let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const refresh = computePublicTradeActivity(fetchTrades);
		const deadline = new Promise<never>((_, reject) => {
			refreshTimeout = setTimeout(() => {
				controller.abort();
				reject(new Error('Public trade activity refresh exceeded its overall deadline'));
			}, PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS);
		});
		return await Promise.race([refresh, deadline]);
	} catch (error) {
		controller.abort();
		throw error;
	} finally {
		if (refreshTimeout) clearTimeout(refreshTimeout);
	}
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
		const data = await getCachedPublicTradeActivity(computeTradeActivity);
		return json(data, {
			headers: {
				'Cache-Control': publicTradeActivityCacheControl(data)
			}
		});
	} catch (error) {
		if (error instanceof St0xTradesRateLimitError) {
			const retryAfterSeconds = Math.max(1, Math.ceil((error.retryAfterMs ?? 60_000) / 1_000));
			const now = Math.floor(Date.now() / 1_000);
			return json(
				{
					success: false,
					range: tradeActivityWindow(now),
					totals: { tradingVolume: 0, totalTrades: 0 },
					networks: []
				} satisfies PublicTradeActivityResponse,
				{
					status: 429,
					headers: {
						'Retry-After': String(retryAfterSeconds),
						'Cache-Control': 'no-store'
					}
				}
			);
		}
		console.error('[Public TradeActivity] Error:', error);
		const now = Math.floor(Date.now() / 1000);
		const range = tradeActivityWindow(now);
		return json(
			{
				success: false,
				range,
				totals: { tradingVolume: 0, totalTrades: 0 },
				networks: []
			} satisfies PublicTradeActivityResponse,
			{ status: 500 }
		);
	}
};
