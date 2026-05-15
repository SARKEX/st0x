import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export interface SpymPriceResponse {
	symbol: string;
	price: number | null;
	timestamp: number | null;
}

export const GET: RequestHandler = async () => {
	const baseUrl = env.LIQUIDITY_MONITOR_URL;
	if (!baseUrl) {
		return json({ symbol: 'SPYM', price: null, timestamp: null } satisfies SpymPriceResponse, {
			status: 503
		});
	}

	try {
		const url = `${baseUrl.replace(/\/$/, '')}/api/prices/spym`;
		const response = await fetch(url, {
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) {
			console.warn(`[SPYM] liquidity-monitor returned ${response.status}`);
			return json({ symbol: 'SPYM', price: null, timestamp: null } satisfies SpymPriceResponse, {
				status: 502
			});
		}

		const data: SpymPriceResponse = await response.json();
		return json(data, {
			headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
		});
	} catch (error) {
		console.warn('[SPYM] failed to fetch from liquidity-monitor:', error);
		return json({ symbol: 'SPYM', price: null, timestamp: null } satisfies SpymPriceResponse, {
			status: 502
		});
	}
};
