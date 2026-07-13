// Public API endpoint to get aggregate TVL (no wallet-level data)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withConditionalCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { kvGet, KV_KEYS, type SnapshotBlockRecord } from '$lib/server/kv';
import { list } from '@vercel/blob';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { PREVIOUS_SYMBOLS_BY_TOKEN, TOKEN_SYMBOLS } from '$lib/config/tokens';
import { env } from '$env/dynamic/private';
import { ensureServerTokenCatalog } from '$lib/server/tokenCatalog';

const tokenSymbols = TOKEN_SYMBOLS;
const previousSymbolsByToken = PREVIOUS_SYMBOLS_BY_TOKEN;

interface PublicTvlResponse {
	success: boolean;
	latest: {
		totalTvl: number;
		tokenTvl: Record<string, number>;
	} | null;
}

async function fetchSnapshot(
	tokenSymbol: string,
	blockNumber: number
): Promise<BlockSnapshot | null> {
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return null;
	}

	const candidates = [tokenSymbol, ...(previousSymbolsByToken.get(tokenSymbol) ?? [])];

	for (const symbol of candidates) {
		try {
			const prefix = `snapshots/${symbol}/${blockNumber}.json`;
			const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });

			if (blobs.length === 0) continue;

			const response = await fetch(blobs[0].url);
			if (!response.ok) continue;

			return await response.json();
		} catch (error) {
			console.error(`[Public TVL] Error fetching snapshot ${symbol}/${blockNumber}:`, error);
		}
	}

	return null;
}

async function computeAggregateTvl(): Promise<PublicTvlResponse> {
	const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

	if (allBlocks.length === 0) {
		return { success: true, latest: null };
	}

	// Get the latest block
	const sorted = [...allBlocks].sort((a, b) => b.timestamp - a.timestamp);
	const latestBlock = sorted[0];

	// Fetch all token snapshots in parallel
	const snapshots = await Promise.all(
		tokenSymbols.map((symbol) => fetchSnapshot(symbol, latestBlock.blockNumber))
	);

	const tokenTvl: Record<string, number> = {};
	let totalTvl = 0;

	for (let i = 0; i < snapshots.length; i++) {
		const snapshot = snapshots[i];
		const symbol = tokenSymbols[i];

		if (!snapshot) {
			tokenTvl[symbol] = 0;
			continue;
		}

		const price = snapshot.price?.price ?? 0;
		let tokenTotal = 0;

		for (const balanceStr of Object.values(snapshot.balances)) {
			const balance = BigInt(balanceStr);
			if (balance <= 0n) continue;
			tokenTotal += (Number(balance) / 1e18) * price;
		}

		tokenTvl[symbol] = tokenTotal;
		totalTvl += tokenTotal;
	}

	return {
		success: true,
		latest: { totalTvl, tokenTvl }
	};
}

export const GET: RequestHandler = async ({ request }) => {
	await ensureServerTokenCatalog();
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
		const data = await withConditionalCache<PublicTvlResponse>(
			CACHE_KEYS.publicTvl(),
			computeAggregateTvl,
			(result) => result.success && result.latest !== null && result.latest.totalTvl > 0,
			CACHE_TTL.LONG
		);

		return json(data, {
			headers: {
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	} catch (error) {
		console.error('[Public TVL] Error:', error);
		return json({ success: false, latest: null } satisfies PublicTvlResponse, { status: 500 });
	}
};
