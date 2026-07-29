import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	computePublicTradeActivity,
	type PublicTradeActivityResponse,
	type PublicTradeActivitySnapshot,
	tradeActivityWindow
} from '$lib/server/publicTradeActivity';
import {
	getCachedPublicTradeActivity,
	publicTradeActivityCacheControl
} from '$lib/server/publicTradeActivityCache';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { createServerTradesQueryFetcher } from '$lib/server/st0xTradesFetcher';

export type {
	NetworkTradeStats,
	PublicTradeActivityResponse,
	TokenTradingRow
} from '$lib/server/publicTradeActivity';

function getApiConfig(): { apiBase: string; authHeader: string } {
	const url = env.ST0X_API_URL;
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!url || !key || !secret) {
		throw new Error('REST API not configured');
	}
	return {
		apiBase: url.replace(/\/+$/, ''),
		authHeader: 'Basic ' + btoa(`${key}:${secret}`)
	};
}

async function computeTradeActivity(): Promise<PublicTradeActivitySnapshot> {
	const fetchTrades = createServerTradesQueryFetcher(getApiConfig());
	return computePublicTradeActivity(fetchTrades);
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
