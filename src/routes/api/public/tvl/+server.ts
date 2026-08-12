// Public API endpoint to get aggregate TVL (no wallet-level data)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withConditionalCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { kvGet, KV_KEYS, type SnapshotBlockRecord } from '$lib/server/kv';
import { list } from '@vercel/blob';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { getTokensByNetwork, type CategorizedToken } from '$lib/config/tokens';
import { env } from '$env/dynamic/private';
import { getServerApplicationCatalog } from '$lib/server/applicationCatalog';
import type { Network } from '$lib/config/networks';

interface PublicTvlResponse {
	success: boolean;
	latest: {
		totalTvl: number;
		tokenTvl: Record<string, number>;
		networks: { chainId: number; blockNumber: number; totalTvl: number }[];
		/** @deprecated Use the matching entry in `networks`. Present only for one-network catalogs. */
		blockNumber?: number;
	} | null;
}

async function fetchSnapshot(
	chainId: number,
	token: CategorizedToken,
	blockNumber: number,
	allowLegacySnapshots: boolean
): Promise<BlockSnapshot | null> {
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return null;
	}

	const candidates = [token.symbol, ...(token.previousSymbols ?? [])];

	for (const symbol of candidates) {
		try {
			const prefixes = [`snapshots/${chainId}/${symbol}/${blockNumber}.json`];
			if (allowLegacySnapshots) prefixes.push(`snapshots/${symbol}/${blockNumber}.json`);
			for (const prefix of prefixes) {
				try {
					const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });
					if (blobs.length === 0) continue;
					const response = await fetch(blobs[0].url, { signal: AbortSignal.timeout(10_000) });
					if (response.ok) return await response.json();
				} catch (error) {
					console.error(`[Public TVL] Error fetching snapshot prefix ${prefix}:`, error);
				}
			}
		} catch (error) {
			console.error(
				`[Public TVL] Error fetching snapshot ${chainId}/${symbol}/${blockNumber}:`,
				error
			);
		}
	}

	return null;
}

async function computeNetworkTvl(
	network: Network,
	latestBlock: SnapshotBlockRecord,
	allowLegacySnapshots: boolean
): Promise<{
	totalTvl: number;
	tokenTvl: Record<string, number>;
	network: { chainId: number; blockNumber: number; totalTvl: number };
}> {
	const tokens = getTokensByNetwork(network.chainId);
	const snapshots = await Promise.all(
		tokens.map((token) =>
			fetchSnapshot(network.chainId, token, latestBlock.blockNumber, allowLegacySnapshots)
		)
	);
	const tokenTvl: Record<string, number> = {};
	let totalTvl = 0;
	for (let index = 0; index < snapshots.length; index++) {
		const snapshot = snapshots[index];
		const token = tokens[index];
		let value = 0;
		if (snapshot) {
			const price = snapshot.price?.price ?? 0;
			for (const balanceStr of Object.values(snapshot.balances)) {
				const balance = BigInt(balanceStr);
				if (balance > 0n) value += (Number(balance) / 10 ** token.decimals) * price;
			}
		}
		tokenTvl[`${network.chainId}:${token.symbol}`] = value;
		totalTvl += value;
	}
	return {
		totalTvl,
		tokenTvl,
		network: { chainId: network.chainId, blockNumber: latestBlock.blockNumber, totalTvl }
	};
}

async function computeAggregateTvl(networkCatalog: Network[]): Promise<PublicTvlResponse> {
	const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

	if (allBlocks.length === 0) {
		return { success: true, latest: null };
	}

	const allowLegacySnapshots = networkCatalog.length === 1;
	const latestByChain = new Map<number, SnapshotBlockRecord>();
	for (const network of networkCatalog) {
		const candidates = allBlocks.filter(
			(block) =>
				block.chainId === network.chainId || (allowLegacySnapshots && block.chainId === undefined)
		);
		const latest = candidates.sort((left, right) => right.timestamp - left.timestamp)[0];
		if (latest) latestByChain.set(network.chainId, latest);
	}
	const results = await Promise.all(
		networkCatalog.flatMap((network) => {
			const latest = latestByChain.get(network.chainId);
			return latest ? [computeNetworkTvl(network, latest, allowLegacySnapshots)] : [];
		})
	);
	if (results.length === 0) return { success: true, latest: null };
	const tokenTvl = Object.assign({}, ...results.map((result) => result.tokenTvl));
	const totalTvl = results.reduce((sum, result) => sum + result.totalTvl, 0);
	const singleNetwork = results.length === 1 ? results[0] : null;
	if (singleNetwork) {
		// Preserve the original public contract while the deployment has one network.
		// Qualified keys remain canonical and avoid collisions once more networks are configured.
		for (const [qualifiedKey, value] of Object.entries(singleNetwork.tokenTvl)) {
			const symbol = qualifiedKey.slice(qualifiedKey.indexOf(':') + 1);
			tokenTvl[symbol] = value;
		}
	}

	return {
		success: true,
		latest: {
			totalTvl,
			tokenTvl,
			networks: results.map((result) => result.network),
			...(singleNetwork ? { blockNumber: singleNetwork.network.blockNumber } : {})
		}
	};
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
		const { networkCatalog } = await getServerApplicationCatalog();
		const data = await withConditionalCache<PublicTvlResponse>(
			CACHE_KEYS.publicTvl(),
			() => computeAggregateTvl(networkCatalog),
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
