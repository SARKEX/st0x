// LP Attribution Module
// Attributes pool balances to LP holders using deposit-based tracking
// Queries the st0x-rewards-base Goldsky subgraph for deposited token amounts

import { kvGet, kvSet, KV_KEYS, type KnownPoolsCache } from '$lib/server/kv';
import { env } from '$env/dynamic/private';

// Get LP Attribution Subgraph URL from environment
function getLPSubgraphUrl(): string | null {
	return env.LP_SUBGRAPH_URL || null;
}

// Subgraph response type
interface LPTokenAttribution {
	user: string;
	depositedBalance: string;
}

// Pool type: 'v2' or 'v3' (or null if not a pool)
export type PoolType = null | 'v2' | 'v3';

// In-memory cache for known pools (loaded from KV)
let knownV2Pools = new Set<string>();
let knownV3Pools = new Set<string>();
let poolCacheLoaded = false;

/**
 * Load known pools from KV cache
 * Called once at start of processing
 */
export async function loadKnownPoolsFromCache(): Promise<void> {
	if (poolCacheLoaded) return;

	try {
		const cached = await kvGet<KnownPoolsCache>(KV_KEYS.knownPools());
		if (cached) {
			knownV2Pools = new Set(cached.v2.map((a) => a.toLowerCase()));
			knownV3Pools = new Set(cached.v3.map((a) => a.toLowerCase()));
			console.log(
				`[LP Attribution] Loaded ${knownV2Pools.size} V2 + ${knownV3Pools.size} V3 pools from cache`
			);
		}
		poolCacheLoaded = true;
	} catch (err) {
		console.warn('[LP Attribution] Failed to load pool cache from KV:', err);
	}
}

/**
 * Save discovered pools to KV cache
 * Called by the daily cron job
 */
export async function saveKnownPoolsToCache(v2Pools: string[], v3Pools: string[]): Promise<void> {
	try {
		const cache: KnownPoolsCache = {
			v2: v2Pools.map((a) => a.toLowerCase()),
			v3: v3Pools.map((a) => a.toLowerCase()),
			updatedAt: new Date().toISOString()
		};
		await kvSet(KV_KEYS.knownPools(), cache);
		console.log(`[LP Attribution] Saved ${v2Pools.length} V2 + ${v3Pools.length} V3 pools to cache`);

		// Update in-memory cache too
		knownV2Pools = new Set(cache.v2);
		knownV3Pools = new Set(cache.v3);
	} catch (err) {
		console.warn('[LP Attribution] Failed to save pool cache to KV:', err);
	}
}

/**
 * Get current known pools from memory
 */
export function getKnownPools(): { v2: string[]; v3: string[] } {
	return {
		v2: Array.from(knownV2Pools),
		v3: Array.from(knownV3Pools)
	};
}

/**
 * Query LP token attributions from the Goldsky subgraph
 * Returns deposited token amounts per user for a specific pool+token
 */
async function queryLPAttributionsFromSubgraph(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<Map<string, bigint> | null> {
	const subgraphUrl = getLPSubgraphUrl();
	if (!subgraphUrl) {
		console.warn('[LP Attribution] LP_SUBGRAPH_URL not configured');
		return null;
	}

	// Note: Entity name is 'lptokenAttributions' (lowercase 't')
	const query = `
		query getLPAttributions($pool: Bytes!, $token: Bytes!, $blockNumber: Int!) {
			lptokenAttributions(
				block: { number: $blockNumber }
				where: { pool: $pool, token: $token, depositedBalance_gt: "0" }
				first: 1000
			) {
				user
				depositedBalance
			}
		}
	`;

	try {
		const response = await fetch(subgraphUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				variables: {
					pool: poolAddress.toLowerCase(),
					token: tokenAddress.toLowerCase(),
					blockNumber: Number(blockNumber)
				}
			})
		});

		if (!response.ok) {
			console.warn(`[LP Attribution] Subgraph request failed: ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (data.errors) {
			console.warn('[LP Attribution] Subgraph query errors:', data.errors);
			return null;
		}

		const attributions = data.data?.lptokenAttributions as LPTokenAttribution[] | undefined;
		if (!attributions || attributions.length === 0) {
			console.log(
				`[LP Attribution] No attributions found for pool ${poolAddress.slice(0, 10)}... token ${tokenAddress.slice(0, 10)}...`
			);
			return new Map();
		}

		const result = new Map<string, bigint>();
		for (const attr of attributions) {
			const balance = BigInt(attr.depositedBalance);
			if (balance > 0n) {
				result.set(attr.user.toLowerCase(), balance);
			}
		}

		console.log(
			`[LP Attribution] Subgraph: found ${result.size} LPs for pool ${poolAddress.slice(0, 10)}...`
		);
		return result;
	} catch (err) {
		console.warn('[LP Attribution] Subgraph fetch error:', err);
		return null;
	}
}

/**
 * Attribute pool balance to LP holders using deposit-based tracking
 * Queries the subgraph for actual deposited amounts per user
 */
export async function attributePoolBalanceToLPs(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<Map<string, bigint> | null> {
	return queryLPAttributionsFromSubgraph(poolAddress, tokenAddress, blockNumber);
}

/**
 * Process snapshot balances to attribute pool balances to LP depositors
 * - Pools in the known pools cache are identified
 * - Their balances are replaced with depositor balances from the subgraph
 * - Pool addresses themselves are excluded (don't receive rewards)
 */
export async function processBalancesWithLPAttribution(
	balances: Record<string, string>,
	tokenAddress: string,
	blockNumber: number
): Promise<{
	modifiedBalances: Record<string, string>;
	poolsProcessed: string[];
	lpAttributions: Record<string, { poolAddress: string; poolType: PoolType; originalBalance: string }[]>;
}> {
	const modifiedBalances: Record<string, string> = {};
	const poolsProcessed: string[] = [];
	const lpAttributions: Record<
		string,
		{ poolAddress: string; poolType: PoolType; originalBalance: string }[]
	> = {};

	const blockNumberBigInt = BigInt(blockNumber);

	// Load known pools from KV cache (if not already loaded)
	await loadKnownPoolsFromCache();

	// Identify pools from the known pools cache (maintained by daily cron)
	const addresses = Object.keys(balances);
	const poolTypes = new Map<string, PoolType>();

	const hasCachedPools = knownV2Pools.size > 0 || knownV3Pools.size > 0;
	if (!hasCachedPools) {
		console.warn('[LP Attribution] No pool cache available - run /api/admin/pools/update-cache');
	}

	for (const address of addresses) {
		const addressLower = address.toLowerCase();
		if (knownV2Pools.has(addressLower)) {
			poolTypes.set(addressLower, 'v2');
		} else if (knownV3Pools.has(addressLower)) {
			poolTypes.set(addressLower, 'v3');
		} else {
			poolTypes.set(addressLower, null); // Not a known pool
		}
	}

	// Count pools found
	const v2PoolAddrs: string[] = [];
	const v3PoolAddrs: string[] = [];
	for (const [addr, type] of poolTypes) {
		if (type === 'v2') v2PoolAddrs.push(addr);
		if (type === 'v3') v3PoolAddrs.push(addr);
	}

	console.log(
		`[LP Attribution] Found ${v2PoolAddrs.length} V2 + ${v3PoolAddrs.length} V3 pools in ${addresses.length} addresses`
	);

	// Process each balance
	for (const [address, balanceStr] of Object.entries(balances)) {
		const addressLower = address.toLowerCase();
		const poolType = poolTypes.get(addressLower);

		if (poolType === 'v2' || poolType === 'v3') {
			// This is a pool - attribute its balance to LP depositors
			const attrStart = Date.now();
			const lpBalances = await attributePoolBalanceToLPs(
				addressLower,
				tokenAddress,
				blockNumberBigInt
			);
			console.log(
				`[LP Attribution] ${poolType.toUpperCase()} pool ${addressLower.slice(0, 10)}...: ${lpBalances?.size ?? 0} LPs (${Date.now() - attrStart}ms)`
			);

			if (lpBalances && lpBalances.size > 0) {
				poolsProcessed.push(addressLower);

				// Add LP depositor balances
				for (const [lpAddress, lpBalance] of lpBalances) {
					const existing = modifiedBalances[lpAddress]
						? BigInt(modifiedBalances[lpAddress])
						: 0n;
					modifiedBalances[lpAddress] = (existing + lpBalance).toString();

					// Track attribution
					if (!lpAttributions[lpAddress]) {
						lpAttributions[lpAddress] = [];
					}
					lpAttributions[lpAddress].push({
						poolAddress: addressLower,
						poolType,
						originalBalance: lpBalance.toString()
					});
				}
			} else {
				// No LP data available - exclude pool balance entirely (like orderbook)
				// Pool rewards are attributed to depositors via subgraph, not to the pool itself
				console.log(
					`[LP Attribution] Pool ${addressLower.slice(0, 10)}... excluded (no LP attribution data)`
				);
				poolsProcessed.push(addressLower);
				// Don't add pool balance to modifiedBalances - it's excluded
			}
		} else {
			// Not a pool - keep original balance
			const existing = modifiedBalances[addressLower]
				? BigInt(modifiedBalances[addressLower])
				: 0n;
			modifiedBalances[addressLower] = (existing + BigInt(balanceStr)).toString();
		}
	}

	return {
		modifiedBalances,
		poolsProcessed,
		lpAttributions
	};
}
