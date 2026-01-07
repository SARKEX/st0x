// LP Attribution Module
// Attributes pool balances to LP holders for V2 and V3 AMM pools
// Uses deposit-based attribution (tracks actual tokens deposited, not share of pool)
// Based on approach from cyclofinance/cyclo.subgraph PR #10

import { createPublicClient, http, fallback, parseAbiItem, type Address } from 'viem';
import { base } from 'viem/chains';
import { kvGet, kvSet, KV_KEYS, type KnownPoolsCache } from '$lib/server/kv';
import { env } from '$env/dynamic/private';

// Base RPC URLs with fallbacks for reliability
const BASE_RPC_URLS = [
	'https://mainnet.base.org',
	'https://base-rpc.publicnode.com',
	'https://base.llamarpc.com',
	'https://base.meowrpc.com',
	'https://base-mainnet.public.blastapi.io',
	'https://gateway.tenderly.co/public/base'
];

// Known AMM factory addresses on Base
const V2_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da'.toLowerCase();
const V3_FACTORY = '0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a'.toLowerCase();

// V3 NonfungiblePositionManager on Base (for querying positions)
const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

// Custom LP Attribution Subgraph (deposit-based tracking)
// Set LP_SUBGRAPH_URL in environment to enable
function getLPSubgraphUrl(): string | null {
	return env.LP_SUBGRAPH_URL || null;
}

// Subgraph response type for deposit-based attribution
interface LPTokenAttribution {
	user: string;
	depositedBalance: string;
}

// Legacy subgraph URLs for share-based fallback
const UNISWAP_V3_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_cl8ylkiw00krx0hvza0qw17vn/subgraphs/uniswap-v3-base/1.0.0/gn';

function getAerodromeSubgraphUrl(): string | null {
	const apiKey = env.THEGRAPH_API_KEY;
	if (!apiKey) return null;
	return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM`;
}

// In-memory cache for pool types (loaded from KV + discovered during runtime)
let knownV2Pools = new Set<string>();
let knownV3Pools = new Set<string>();
let poolCacheLoaded = false;

// Runtime cache for pool types discovered during current execution
const poolTypeCache = new Map<string, PoolType>();

/**
 * Load known pools from KV cache (call once at start of processing)
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
 * Get current known pools (from memory)
 */
export function getKnownPools(): { v2: string[]; v3: string[] } {
	return {
		v2: Array.from(knownV2Pools),
		v3: Array.from(knownV3Pools)
	};
}

// Contract type: null = EOA, 'v2' = V2 pool, 'v3' = V3 pool, 'unknown' = other contract
export type PoolType = null | 'v2' | 'v3' | 'unknown';

// LP share information
export interface LPShare {
	address: string; // LP holder address
	share: number; // Proportional share (0-1)
	lpBalance?: bigint; // For V2: LP token balance
	liquidity?: bigint; // For V3: position liquidity
	tokenId?: bigint; // For V3: NFT token ID
}

// Pool info with LP shares
export interface PoolLPInfo {
	poolAddress: string;
	poolType: PoolType;
	tokenAddress: string; // The token we're tracking (our token in the pool)
	totalLiquidity: bigint;
	lpShares: LPShare[];
}

// Subgraph response types
interface SubgraphPosition {
	id: string;
	owner: string;
	liquidity: string;
	pool: {
		id: string;
		token0: { id: string };
		token1: { id: string };
	};
}

/**
 * Query V3 positions from Uniswap subgraph by pool address at a specific block
 * Uses The Graph's time-travel feature to query historical state
 */
async function queryV3PositionsFromSubgraph(
	poolAddress: string,
	blockNumber: bigint
): Promise<SubgraphPosition[]> {
	// Use block parameter for historical queries
	const query = `
		query getPositions($poolId: String!, $blockNumber: Int!) {
			positions(
				block: { number: $blockNumber }
				where: { pool: $poolId, liquidity_gt: "0" }
				first: 1000
				orderBy: liquidity
				orderDirection: desc
			) {
				id
				owner
				liquidity
				pool {
					id
					token0 { id }
					token1 { id }
				}
			}
		}
	`;

	try {
		const response = await fetch(UNISWAP_V3_SUBGRAPH_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				variables: {
					poolId: poolAddress.toLowerCase(),
					blockNumber: Number(blockNumber)
				}
			})
		});

		if (!response.ok) {
			console.warn(`[LP Attribution] Subgraph request failed: ${response.status}`);
			return [];
		}

		const data = await response.json();
		if (data.errors) {
			console.warn(`[LP Attribution] Subgraph GraphQL error:`, data.errors);
			return [];
		}

		return data.data?.positions || [];
	} catch (err) {
		console.warn('[LP Attribution] Error querying V3 subgraph:', err);
		return [];
	}
}

// ABIs for contract calls
const factoryAbi = [
	{
		inputs: [],
		name: 'factory',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

const v2PoolAbi = [
	{
		inputs: [],
		name: 'totalSupply',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token0',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token1',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'getReserves',
		outputs: [
			{ type: 'uint112', name: 'reserve0' },
			{ type: 'uint112', name: 'reserve1' },
			{ type: 'uint32', name: 'blockTimestampLast' }
		],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [{ type: 'address', name: 'owner' }],
		name: 'balanceOf',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

const v3PositionManagerAbi = [
	{
		inputs: [{ type: 'uint256', name: 'tokenId' }],
		name: 'positions',
		outputs: [
			{ type: 'uint96', name: 'nonce' },
			{ type: 'address', name: 'operator' },
			{ type: 'address', name: 'token0' },
			{ type: 'address', name: 'token1' },
			{ type: 'uint24', name: 'fee' },
			{ type: 'int24', name: 'tickLower' },
			{ type: 'int24', name: 'tickUpper' },
			{ type: 'uint128', name: 'liquidity' },
			{ type: 'uint256', name: 'feeGrowthInside0LastX128' },
			{ type: 'uint256', name: 'feeGrowthInside1LastX128' },
			{ type: 'uint128', name: 'tokensOwed0' },
			{ type: 'uint128', name: 'tokensOwed1' }
		],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [{ type: 'uint256', name: 'tokenId' }],
		name: 'ownerOf',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'totalSupply',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [{ type: 'uint256', name: 'index' }],
		name: 'tokenByIndex',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

const v3PoolAbi = [
	{
		inputs: [],
		name: 'token0',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token1',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'fee',
		outputs: [{ type: 'uint24' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'liquidity',
		outputs: [{ type: 'uint128' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

// Create public client for Base with fallback RPCs
function getPublicClient() {
	return createPublicClient({
		chain: base,
		transport: fallback(
			BASE_RPC_URLS.map((url) => http(url)),
			{ rank: true }
		)
	});
}

type GetLogsParams = Parameters<ReturnType<typeof createPublicClient>['getLogs']>[0];
async function getLogsWithFallback(params: GetLogsParams) {
	let lastError: unknown;

	for (const url of BASE_RPC_URLS) {
		const client = createPublicClient({
			chain: base,
			transport: http(url)
		});

		try {
			return await client.getLogs(params);
		} catch (err) {
			lastError = err;
		}
	}

	throw lastError ?? new Error('All RPCs failed for getLogs');
}

/**
 * Check if an address is a V2 or V3 pool
 * Uses caching to avoid repeated RPC calls
 */
export async function getPoolType(
	address: string,
	blockNumber?: bigint
): Promise<PoolType> {
	const addressLower = address.toLowerCase();

	// Check KV-loaded known pools first (fastest)
	if (knownV2Pools.has(addressLower)) return 'v2';
	if (knownV3Pools.has(addressLower)) return 'v3';

	// Check runtime cache
	if (poolTypeCache.has(addressLower)) {
		return poolTypeCache.get(addressLower)!;
	}

	const client = getPublicClient();

	try {
		// Check if it has code
		const code = await client.getCode({
			address: address as Address,
			blockNumber
		});

		const hasCode = code !== undefined && code !== null && code !== '0x' && code.length > 2;
		const isEIP7702 = hasCode && code.toLowerCase().startsWith('0xef0100');

		if (!hasCode || isEIP7702) {
			poolTypeCache.set(addressLower, null);
			return null; // EOA
		}

		// Try to get factory address
		try {
			const factoryAddress = await client.readContract({
				address: address as Address,
				abi: factoryAbi,
				functionName: 'factory',
				blockNumber
			});

			const factoryLower = (factoryAddress as string).toLowerCase();
			if (factoryLower === V2_FACTORY) {
				poolTypeCache.set(addressLower, 'v2');
				return 'v2';
			} else if (factoryLower === V3_FACTORY) {
				poolTypeCache.set(addressLower, 'v3');
				return 'v3';
			}
		} catch {
			// No factory method
		}

		// Fallback: probe for V2/V3 pool interfaces to support other factories
		try {
			await Promise.all([
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'token0',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'token1',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'getReserves',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'totalSupply',
					blockNumber
				})
			]);
			poolTypeCache.set(addressLower, 'v2');
			return 'v2';
		} catch {
			// Not V2
		}

		try {
			await Promise.all([
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'token0',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'token1',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'fee',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'liquidity',
					blockNumber
				})
			]);
			poolTypeCache.set(addressLower, 'v3');
			return 'v3';
		} catch {
			// Not V3
		}

		poolTypeCache.set(addressLower, 'unknown');
		return 'unknown';
	} catch {
		poolTypeCache.set(addressLower, null);
		return null;
	}
}

// Helper to add delay between requests to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Aerodrome V2 subgraph response types
interface AerodromeV2Position {
	id: string;
	user: { id: string };
	liquidityTokenBalance: string;
}

/**
 * Query V2 LP positions from Aerodrome subgraph (fast, no RPC needed)
 */
async function queryV2PositionsFromSubgraph(
	poolAddress: string,
	blockNumber: bigint
): Promise<Map<string, bigint> | null> {
	const subgraphUrl = getAerodromeSubgraphUrl();
	if (!subgraphUrl) {
		console.log('[LP Attribution] No Graph API key, falling back to RPC for V2');
		return null;
	}

	// Query liquidityPositions for this pool at the specified block
	const query = `
		query getLiquidityPositions($poolId: String!, $blockNumber: Int!) {
			liquidityPositions(
				block: { number: $blockNumber }
				where: { pair: $poolId, liquidityTokenBalance_gt: "0" }
				first: 1000
			) {
				id
				user { id }
				liquidityTokenBalance
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
					poolId: poolAddress.toLowerCase(),
					blockNumber: Number(blockNumber)
				}
			})
		});

		if (!response.ok) {
			console.warn(`[LP Attribution] V2 subgraph error: ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (data.errors) {
			console.warn('[LP Attribution] V2 subgraph query errors:', data.errors);
			return null;
		}

		const positions = data.data?.liquidityPositions as AerodromeV2Position[] | undefined;
		if (!positions || positions.length === 0) {
			console.log(`[LP Attribution] V2 subgraph: no positions found for pool ${poolAddress.slice(0, 10)}...`);
			return new Map();
		}

		const holders = new Map<string, bigint>();
		for (const pos of positions) {
			const userAddress = pos.user.id.toLowerCase();
			// liquidityTokenBalance is in wei (18 decimals)
			const balance = BigInt(pos.liquidityTokenBalance.split('.')[0]); // Handle decimal strings
			if (balance > 0n) {
				holders.set(userAddress, balance);
			}
		}

		console.log(
			`[LP Attribution] V2 subgraph: found ${holders.size} LPs for pool ${poolAddress.slice(0, 10)}...`
		);
		return holders;
	} catch (err) {
		console.warn('[LP Attribution] V2 subgraph fetch error:', err);
		return null;
	}
}

/**
 * Get LP holders for a V2 pool
 * Tries subgraph first (fast), falls back to RPC log scanning
 */
async function getV2LPHolders(
	poolAddress: string,
	blockNumber: bigint
): Promise<Map<string, bigint>> {
	// Try subgraph first (much faster)
	const subgraphResult = await queryV2PositionsFromSubgraph(poolAddress, blockNumber);
	if (subgraphResult !== null) {
		return subgraphResult;
	}

	// Fallback to RPC log scanning
	console.log(`[LP Attribution] V2 pool ${poolAddress.slice(0, 10)}...: using RPC fallback`);
	const client = getPublicClient();
	const holders = new Map<string, bigint>();

	// ERC20 Transfer event signature
	const transferEventSignature = parseAbiItem(
		'event Transfer(address indexed from, address indexed to, uint256 value)'
	);

	try {
		// Get all Transfer events for the LP token (pool is also the LP token)
		// We need to scan from pool creation to target block
		// Use larger batch size (100k blocks) to reduce RPC calls
		const BLOCK_RANGE = 100000n;
		let fromBlock = 1n; // Start from beginning or pool creation block

		// Get a reasonable start block (30 days ago - balance to accuracy vs speed)
		// Most LP positions are relatively stable, 30 days captures most activity
		const currentBlock = await client.getBlockNumber();
		const blocksIn30Days = (30n * 24n * 60n * 60n) / 2n; // ~2 sec block time on Base
		fromBlock = blockNumber > blocksIn30Days ? blockNumber - blocksIn30Days : 1n;

		let batchCount = 0;
		const totalBatches = Math.ceil(Number(blockNumber - fromBlock) / Number(BLOCK_RANGE));
		console.log(
			`[LP Attribution] V2 pool ${poolAddress.slice(0, 10)}...: scanning ${totalBatches} batches of logs`
		);

		while (fromBlock <= blockNumber) {
			const toBlock = fromBlock + BLOCK_RANGE > blockNumber ? blockNumber : fromBlock + BLOCK_RANGE;

			try {
				const logs = await getLogsWithFallback({
					address: poolAddress as Address,
					event: transferEventSignature,
					fromBlock,
					toBlock
				});

				// Log progress every 10 batches
				if (batchCount > 0 && batchCount % 10 === 0) {
					console.log(
						`[LP Attribution] V2 pool ${poolAddress.slice(0, 10)}...: batch ${batchCount}/${totalBatches}, ${holders.size} holders so far`
					);
				}

				for (const log of logs) {
					// Type assertion for decoded Transfer event args
					const decodedLog = log as typeof log & {
						args: { from: Address; to: Address; value: bigint };
					};
					const from = decodedLog.args.from.toLowerCase();
					const to = decodedLog.args.to.toLowerCase();
					const value = decodedLog.args.value;

					// Process transfer
					if (from !== '0x0000000000000000000000000000000000000000') {
						const currentFrom = holders.get(from) || 0n;
						holders.set(from, currentFrom - value);
					}
					if (to !== '0x0000000000000000000000000000000000000000') {
						const currentTo = holders.get(to) || 0n;
						holders.set(to, currentTo + value);
					}
				}
			} catch (err) {
				console.warn(`[LP Attribution] Error fetching logs for blocks ${fromBlock}-${toBlock}:`, err);
				// On rate limit error, wait longer before continuing
				if (err instanceof Error && err.message.includes('rate limit')) {
					await delay(2000);
				}
			}

			fromBlock = toBlock + 1n;
			batchCount++;

			// Add small delay every few batches to avoid rate limiting
			if (batchCount % 5 === 0) {
				await delay(100);
			}
		}

		// Remove zero and negative balances
		for (const [address, balance] of holders) {
			if (balance <= 0n) {
				holders.delete(address);
			}
		}

		return holders;
	} catch (err) {
		console.error('[LP Attribution] Error getting V2 LP holders:', err);
		return new Map();
	}
}

/**
 * Get LP shares for a V2 pool
 */
export async function getV2PoolLPShares(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<PoolLPInfo | null> {
	const client = getPublicClient();

	try {
		// Get pool info
		const [totalSupply, token0, token1, reserves] = await Promise.all([
			client.readContract({
				address: poolAddress as Address,
				abi: v2PoolAbi,
				functionName: 'totalSupply',
				blockNumber
			}),
			client.readContract({
				address: poolAddress as Address,
				abi: v2PoolAbi,
				functionName: 'token0',
				blockNumber
			}),
			client.readContract({
				address: poolAddress as Address,
				abi: v2PoolAbi,
				functionName: 'token1',
				blockNumber
			}),
			client.readContract({
				address: poolAddress as Address,
				abi: v2PoolAbi,
				functionName: 'getReserves',
				blockNumber
			})
		]);

		// Check which token is ours
		const isToken0 = (token0 as string).toLowerCase() === tokenAddress.toLowerCase();
		const isToken1 = (token1 as string).toLowerCase() === tokenAddress.toLowerCase();

		if (!isToken0 && !isToken1) {
			console.warn(`[LP Attribution] Token ${tokenAddress} not found in pool ${poolAddress}`);
			return null;
		}

		// Get LP holders
		const lpHolders = await getV2LPHolders(poolAddress, blockNumber);

		if (lpHolders.size === 0) {
			console.warn(`[LP Attribution] No LP holders found for pool ${poolAddress}`);
			return null;
		}

		// Calculate shares
		const lpShares: LPShare[] = [];
		const totalSupplyBigInt = totalSupply as bigint;

		for (const [holderAddress, lpBalance] of lpHolders) {
			// Skip the pool itself (burned LP tokens)
			if (holderAddress === poolAddress.toLowerCase()) continue;
			// Skip zero address
			if (holderAddress === '0x0000000000000000000000000000000000000000') continue;

			const share = Number(lpBalance) / Number(totalSupplyBigInt);
			lpShares.push({
				address: holderAddress,
				share,
				lpBalance
			});
		}

		return {
			poolAddress: poolAddress.toLowerCase(),
			poolType: 'v2',
			tokenAddress: tokenAddress.toLowerCase(),
			totalLiquidity: totalSupplyBigInt,
			lpShares
		};
	} catch (err) {
		console.error('[LP Attribution] Error getting V2 pool LP shares:', err);
		return null;
	}
}

/**
 * Get LP shares for a V3 pool by querying Uniswap V3 subgraph
 * Much faster and more reliable than RPC-based log scanning
 */
export async function getV3PoolLPShares(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<PoolLPInfo | null> {
	try {
		// Query positions from subgraph at the specific block
		const positions = await queryV3PositionsFromSubgraph(poolAddress, blockNumber);

		if (positions.length === 0) {
			console.warn(`[LP Attribution] No V3 positions found in subgraph for pool ${poolAddress}`);
			return null;
		}

		// Get pool tokens from the first position (all positions have same pool)
		const poolInfo = positions[0].pool;
		const token0 = poolInfo.token0.id.toLowerCase();
		const token1 = poolInfo.token1.id.toLowerCase();

		// Check which token is ours
		const isToken0 = token0 === tokenAddress.toLowerCase();
		const isToken1 = token1 === tokenAddress.toLowerCase();

		if (!isToken0 && !isToken1) {
			console.warn(`[LP Attribution] Token ${tokenAddress} not found in V3 pool ${poolAddress}`);
			return null;
		}

		// Calculate LP shares from positions
		const lpShares: LPShare[] = [];
		let totalLiquidity = 0n;

		for (const position of positions) {
			const liquidity = BigInt(position.liquidity);
			if (liquidity > 0n) {
				totalLiquidity += liquidity;
				lpShares.push({
					address: position.owner.toLowerCase(),
					share: 0, // Will calculate after we have total
					liquidity
				});
			}
		}

		if (totalLiquidity === 0n) {
			console.warn(`[LP Attribution] No liquidity in V3 pool ${poolAddress}`);
			return null;
		}

		// Calculate shares
		for (const share of lpShares) {
			share.share = Number(share.liquidity!) / Number(totalLiquidity);
		}

		// Aggregate by owner (one owner may have multiple positions)
		const ownerShares = new Map<string, LPShare>();
		for (const share of lpShares) {
			const existing = ownerShares.get(share.address);
			if (existing) {
				existing.share += share.share;
				existing.liquidity = (existing.liquidity || 0n) + (share.liquidity || 0n);
			} else {
				ownerShares.set(share.address, { ...share });
			}
		}

		console.log(
			`[LP Attribution] V3 pool ${poolAddress}: found ${positions.length} positions, ${ownerShares.size} unique owners`
		);

		return {
			poolAddress: poolAddress.toLowerCase(),
			poolType: 'v3',
			tokenAddress: tokenAddress.toLowerCase(),
			totalLiquidity,
			lpShares: Array.from(ownerShares.values())
		};
	} catch (err) {
		console.error('[LP Attribution] Error getting V3 pool LP shares from subgraph:', err);
		return null;
	}
}

/**
 * Get LP shares for a pool (detects pool type automatically)
 */
export async function getPoolLPShares(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<PoolLPInfo | null> {
	const poolType = await getPoolType(poolAddress, blockNumber);

	if (poolType === 'v2') {
		return getV2PoolLPShares(poolAddress, tokenAddress, blockNumber);
	} else if (poolType === 'v3') {
		return getV3PoolLPShares(poolAddress, tokenAddress, blockNumber);
	}

	return null;
}

/**
 * Query LP token attributions from custom subgraph (deposit-based)
 * Returns actual deposited token amounts per LP, not shares
 */
async function queryLPAttributionsFromSubgraph(
	poolAddress: string,
	tokenAddress: string,
	blockNumber: bigint
): Promise<Map<string, bigint> | null> {
	const subgraphUrl = getLPSubgraphUrl();
	if (!subgraphUrl) {
		return null; // Subgraph not configured
	}

	const query = `
		query getLPAttributions($pool: Bytes!, $token: Bytes!, $blockNumber: Int!) {
			lpTokenAttributions(
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

		const attributions = data.data?.lpTokenAttributions as LPTokenAttribution[] | undefined;
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
 * Queries custom subgraph for actual deposited amounts (not shares)
 * Falls back to share-based attribution if subgraph not available
 */
export async function attributePoolBalanceToLPs(
	poolAddress: string,
	tokenAddress: string,
	poolBalance: bigint,
	blockNumber: bigint
): Promise<Map<string, bigint> | null> {
	// Try deposit-based attribution from custom subgraph first
	const depositBasedResult = await queryLPAttributionsFromSubgraph(
		poolAddress,
		tokenAddress,
		blockNumber
	);

	if (depositBasedResult !== null) {
		// Subgraph returned results (even if empty map)
		return depositBasedResult;
	}

	// Fallback to share-based attribution (legacy behavior)
	console.warn(
		`[LP Attribution] LP_SUBGRAPH_URL not configured, using share-based fallback for pool ${poolAddress.slice(0, 10)}...`
	);

	const lpInfo = await getPoolLPShares(poolAddress, tokenAddress, blockNumber);

	if (!lpInfo || lpInfo.lpShares.length === 0) {
		return null;
	}

	const attributedBalances = new Map<string, bigint>();

	for (const share of lpInfo.lpShares) {
		// Calculate proportional balance (share-based - less accurate)
		const attributedBalance = BigInt(Math.floor(Number(poolBalance) * share.share));
		if (attributedBalance > 0n) {
			const existing = attributedBalances.get(share.address) || 0n;
			attributedBalances.set(share.address, existing + attributedBalance);
		}
	}

	return attributedBalances;
}

/**
 * Process snapshot balances to attribute pool balances to LPs
 * Returns modified balances with pool addresses replaced by LP addresses
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

	// First, identify which addresses are pools
	const addresses = Object.keys(balances);
	const poolTypes = new Map<string, PoolType>();

	// If we have a cached pool list, use it directly (no RPC calls needed)
	// This is much faster and avoids rate limiting issues
	const hasCachedPools = knownV2Pools.size > 0 || knownV3Pools.size > 0;

	if (hasCachedPools) {
		// Use cached pools only - no RPC calls
		for (const address of addresses) {
			const addressLower = address.toLowerCase();
			if (knownV2Pools.has(addressLower)) {
				poolTypes.set(addressLower, 'v2');
			} else if (knownV3Pools.has(addressLower)) {
				poolTypes.set(addressLower, 'v3');
			} else {
				poolTypes.set(addressLower, null); // Assume EOA if not in cache
			}
		}
	} else {
		// No cache available - fall back to RPC-based detection
		console.log('[LP Attribution] No pool cache available, using RPC-based detection');
		const poolDetectStart = Date.now();
		await Promise.all(
			addresses.map(async (address) => {
				const poolType = await getPoolType(address, blockNumberBigInt);
				poolTypes.set(address.toLowerCase(), poolType);
			})
		);
		console.log(`[LP Attribution] RPC pool detection took ${Date.now() - poolDetectStart}ms`);
	}

	// Count pools found
	const v2PoolAddrs: string[] = [];
	const v3PoolAddrs: string[] = [];
	for (const [addr, type] of poolTypes) {
		if (type === 'v2') v2PoolAddrs.push(addr);
		if (type === 'v3') v3PoolAddrs.push(addr);
	}

	console.log(
		`[LP Attribution] Found ${v2PoolAddrs.length} V2 + ${v3PoolAddrs.length} V3 pools in ${addresses.length} addresses (cache: ${hasCachedPools ? 'yes' : 'no'})`
	);

	// Process each balance
	for (const [address, balanceStr] of Object.entries(balances)) {
		const addressLower = address.toLowerCase();
		const poolType = poolTypes.get(addressLower);

		if (poolType === 'v2' || poolType === 'v3') {
			// This is a pool - attribute its balance to LPs
			const balance = BigInt(balanceStr);
			const attrStart = Date.now();
			const lpBalances = await attributePoolBalanceToLPs(
				addressLower,
				tokenAddress,
				balance,
				blockNumberBigInt
			);
			console.log(
				`[LP Attribution] ${poolType.toUpperCase()} pool ${addressLower.slice(0, 10)}...: ${lpBalances?.size ?? 0} LPs (${Date.now() - attrStart}ms)`
			);

			if (lpBalances && lpBalances.size > 0) {
				poolsProcessed.push(addressLower);

				// Add LP balances
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
				// Failed to get LP shares - keep original balance (fallback)
				console.warn(`[LP Attribution] Failed to attribute pool ${addressLower}, keeping original`);
				modifiedBalances[addressLower] = balanceStr;
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
