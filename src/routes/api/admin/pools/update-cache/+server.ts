// API endpoint to discover and cache pool addresses
// Run this periodically (e.g., daily cron) to keep pool cache fresh
// GET: Used by Vercel cron - runs pool discovery (or ?view=1 to just view cache)
// POST: Manual trigger from admin UI
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TOKENS } from '$lib/config/tokens';
import { fetchAllTransfers } from '$lib/server/snapshots/scraper';
import { getCurrentBlockNumber } from '$lib/server/snapshots/generator';
import { getPoolType } from '$lib/server/snapshots/pool-discovery';
import { saveKnownPoolsToCache, getKnownPools } from '$lib/server/snapshots/lp-attribution';

// Shared pool discovery logic
async function discoverAndCachePools() {
	console.log('[Pool Cache] Starting pool discovery...');
	const startTime = Date.now();

	// Get current block
	const blockNumber = await getCurrentBlockNumber();
	const blockNumberBigInt = BigInt(blockNumber);

	// Get all token addresses
	const tokenAddresses = TOKENS.map((t) => t.address.toLowerCase());

	// Fetch transfers to get all addresses that have held tokens
	console.log('[Pool Cache] Fetching transfers to find all holder addresses...');
	const transfers = await fetchAllTransfers(blockNumber, tokenAddresses);

	// Collect unique addresses from transfers
	const allAddresses = new Set<string>();
	for (const transfer of transfers) {
		allAddresses.add(transfer.from.toLowerCase());
		allAddresses.add(transfer.to.toLowerCase());
	}

	// Remove zero address
	allAddresses.delete('0x0000000000000000000000000000000000000000');

	console.log(`[Pool Cache] Checking ${allAddresses.size} addresses for pool contracts...`);

	// Check pool types in batches to avoid overwhelming RPC
	const addresses = Array.from(allAddresses);
	const v2Pools: string[] = [];
	const v3Pools: string[] = [];
	const BATCH_SIZE = 50;

	for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
		const batch = addresses.slice(i, i + BATCH_SIZE);

		const results = await Promise.all(
			batch.map(async (address) => {
				const poolType = await getPoolType(address, blockNumberBigInt);
				return { address, poolType };
			})
		);

		for (const { address, poolType } of results) {
			if (poolType === 'v2') v2Pools.push(address);
			if (poolType === 'v3') v3Pools.push(address);
		}

		// Progress log every 500 addresses
		if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= addresses.length) {
			console.log(
				`[Pool Cache] Progress: ${Math.min(i + BATCH_SIZE, addresses.length)}/${addresses.length} addresses checked`
			);
		}
	}

	// Save to KV cache
	await saveKnownPoolsToCache(v2Pools, v3Pools);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(
		`[Pool Cache] Complete! Found ${v2Pools.length} V2 + ${v3Pools.length} V3 pools in ${elapsed}s`
	);

	return {
		success: true,
		addressesChecked: addresses.length,
		v2Pools,
		v3Pools,
		elapsedSeconds: parseFloat(elapsed)
	};
}

function handleError(error: unknown) {
	console.error('[Pool Cache] Error:', error);
	return json(
		{
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		},
		{ status: 500 }
	);
}

// GET: Used by Vercel cron to run pool discovery
// Add ?view=1 query param to just view current cache without updating
export const GET: RequestHandler = async ({ url }) => {
	if (url.searchParams.get('view') === '1') {
		const pools = getKnownPools();
		return json({
			v2Pools: pools.v2,
			v3Pools: pools.v3,
			v2Count: pools.v2.length,
			v3Count: pools.v3.length
		});
	}

	try {
		const result = await discoverAndCachePools();
		return json(result);
	} catch (error) {
		return handleError(error);
	}
};

// POST: Manual trigger from admin UI
export const POST: RequestHandler = async () => {
	try {
		const result = await discoverAndCachePools();
		return json(result);
	} catch (error) {
		return handleError(error);
	}
};
