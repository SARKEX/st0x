// Aerodrome Slipstream (V3/CL) LP holdings tracker
// Uses NFT positions with IncreaseLiquidity/DecreaseLiquidity events
//
// Tracks net deposits of tStocks in Aerodrome pools based on:
// 1. IncreaseLiquidity: Adds deposit credit to position owner
// 2. DecreaseLiquidity: Proportionally reduces deposit credit
// 3. NFT Transfer: Entire position (and deposit credit) moves to new owner

import type { Transfer } from './types';
import { AERODROME_POSITION_MANAGER } from '$lib/config/snapshots';
import { networks } from '$lib/config/networks';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Event signatures for Aerodrome Slipstream (V3)
const EVENT_SIGNATURES = {
	// IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
	IncreaseLiquidity: '0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f',
	// DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
	DecreaseLiquidity: '0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4',
	// Transfer(address indexed from, address indexed to, uint256 indexed tokenId) - ERC721
	Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
};

export interface AerodromeHolding {
	owner: string;
	tokenAddress: string;
	poolAddress: string;
	depositBalance: string; // Net deposit amount (as string for BigInt)
}

interface IncreaseLiquidityEvent {
	type: 'increase';
	tokenId: string;
	liquidity: bigint;
	amount0: bigint;
	amount1: bigint;
	blockNumber: number;
	logIndex: number;
}

interface DecreaseLiquidityEvent {
	type: 'decrease';
	tokenId: string;
	liquidity: bigint;
	amount0: bigint;
	amount1: bigint;
	blockNumber: number;
	logIndex: number;
}

interface NFTTransferEvent {
	type: 'transfer';
	from: string;
	to: string;
	tokenId: string;
	blockNumber: number;
	logIndex: number;
}

type PositionEvent = IncreaseLiquidityEvent | DecreaseLiquidityEvent | NFTTransferEvent;

interface PositionState {
	owner: string;
	liquidity: bigint;
	depositBalance: bigint; // Amount of tStock deposited (for the token we care about)
	token0: string;
	token1: string;
}

/**
 * Fetch position events from RPC using eth_getLogs
 * Queries IncreaseLiquidity, DecreaseLiquidity, and Transfer events from the position manager
 */
async function fetchPositionEvents(
	positionManagerAddress: string,
	untilBlock: number,
	startBlock: number = 0
): Promise<PositionEvent[]> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	const allEvents: PositionEvent[] = [];
	let fromBlock = startBlock;

	for (const rpcUrl of rpcUrls) {
		try {
			// Fetch in batches to avoid RPC limits
			while (fromBlock <= untilBlock) {
				const toBlock = Math.min(fromBlock + 10000, untilBlock);

				// Fetch all three event types in parallel
				const [increaseLogs, decreaseLogs, transferLogs] = await Promise.all([
					fetchLogs(rpcUrl, positionManagerAddress, EVENT_SIGNATURES.IncreaseLiquidity, fromBlock, toBlock),
					fetchLogs(rpcUrl, positionManagerAddress, EVENT_SIGNATURES.DecreaseLiquidity, fromBlock, toBlock),
					fetchLogs(rpcUrl, positionManagerAddress, EVENT_SIGNATURES.Transfer, fromBlock, toBlock)
				]);

				// Parse IncreaseLiquidity events
				for (const log of increaseLogs) {
					const tokenId = BigInt(log.topics[1]).toString();
					// Decode: (uint128 liquidity, uint256 amount0, uint256 amount1)
					const data = log.data.slice(2); // Remove '0x'
					const liquidity = BigInt('0x' + data.slice(0, 64));
					const amount0 = BigInt('0x' + data.slice(64, 128));
					const amount1 = BigInt('0x' + data.slice(128, 192));

					allEvents.push({
						type: 'increase',
						tokenId,
						liquidity,
						amount0,
						amount1,
						blockNumber: parseInt(log.blockNumber, 16),
						logIndex: parseInt(log.logIndex, 16)
					});
				}

				// Parse DecreaseLiquidity events
				for (const log of decreaseLogs) {
					const tokenId = BigInt(log.topics[1]).toString();
					const data = log.data.slice(2);
					const liquidity = BigInt('0x' + data.slice(0, 64));
					const amount0 = BigInt('0x' + data.slice(64, 128));
					const amount1 = BigInt('0x' + data.slice(128, 192));

					allEvents.push({
						type: 'decrease',
						tokenId,
						liquidity,
						amount0,
						amount1,
						blockNumber: parseInt(log.blockNumber, 16),
						logIndex: parseInt(log.logIndex, 16)
					});
				}

				// Parse Transfer events (ERC721)
				for (const log of transferLogs) {
					const from = '0x' + log.topics[1].slice(26).toLowerCase();
					const to = '0x' + log.topics[2].slice(26).toLowerCase();
					const tokenId = BigInt(log.topics[3]).toString();

					allEvents.push({
						type: 'transfer',
						from,
						to,
						tokenId,
						blockNumber: parseInt(log.blockNumber, 16),
						logIndex: parseInt(log.logIndex, 16)
					});
				}

				fromBlock = toBlock + 1;
			}

			// Successfully fetched from this RPC
			break;
		} catch (error) {
			console.error(`[Aerodrome] Failed to fetch events from ${rpcUrl}:`, error);
			continue;
		}
	}

	// Sort by block number and log index
	return allEvents.sort((a, b) => {
		if (a.blockNumber !== b.blockNumber) {
			return a.blockNumber - b.blockNumber;
		}
		return a.logIndex - b.logIndex;
	});
}

async function fetchLogs(
	rpcUrl: string,
	address: string,
	topic0: string,
	fromBlock: number,
	toBlock: number
): Promise<Array<{ topics: string[]; data: string; blockNumber: string; logIndex: string }>> {
	const response = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'eth_getLogs',
			params: [
				{
					address,
					topics: [topic0],
					fromBlock: `0x${fromBlock.toString(16)}`,
					toBlock: `0x${toBlock.toString(16)}`
				}
			],
			id: 1
		})
	});

	if (!response.ok) {
		throw new Error(`RPC request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.error) {
		throw new Error(`RPC error: ${data.error.message}`);
	}

	return data.result || [];
}

/**
 * Get pool info for a position (token0 and token1 addresses)
 * This requires an RPC call to the position manager
 */
async function getPositionPoolInfo(
	positionManagerAddress: string,
	tokenId: string
): Promise<{ token0: string; token1: string } | null> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	// positions(uint256 tokenId) returns multiple values, we need token0 and token1
	// Function selector for positions(uint256): 0x99fbab88
	const data = '0x99fbab88' + tokenId.padStart(64, '0');

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_call',
					params: [{ to: positionManagerAddress, data }, 'latest'],
					id: 1
				})
			});

			if (!response.ok) continue;

			const result = await response.json();
			if (result.error || !result.result || result.result === '0x') continue;

			// Parse the response - positions() returns a tuple with many fields
			// The exact layout depends on Aerodrome's contract, but typically:
			// token0 is at offset 2 (index 2), token1 is at offset 3 (index 3)
			const resultData = result.result.slice(2); // Remove '0x'
			// Each field is 32 bytes (64 hex chars)
			const token0 = '0x' + resultData.slice(2 * 64 + 24, 3 * 64).toLowerCase();
			const token1 = '0x' + resultData.slice(3 * 64 + 24, 4 * 64).toLowerCase();

			return { token0, token1 };
		} catch {
			continue;
		}
	}

	return null;
}

/**
 * Calculate Aerodrome V3 holdings from position events
 *
 * Logic:
 * 1. Track each position's state (owner, liquidity, depositBalance)
 * 2. IncreaseLiquidity: Add to position's deposit balance
 * 3. DecreaseLiquidity: Proportionally reduce deposit balance
 * 4. NFT Transfer: Move entire position to new owner
 */
export async function calculateAerodromeHoldings(
	events: PositionEvent[],
	tokenAddress: string,
	positionManagerAddress: string,
	targetBlock: number
): Promise<Map<string, bigint>> {
	const normalizedToken = tokenAddress.toLowerCase();

	// Track state per position (tokenId -> PositionState)
	const positions = new Map<string, PositionState>();

	// Cache for position pool info
	const poolInfoCache = new Map<string, { token0: string; token1: string } | null>();

	// Filter events up to target block
	const relevantEvents = events.filter(e => e.blockNumber <= targetBlock);

	// Process events in order
	for (const event of relevantEvents) {
		if (event.type === 'transfer') {
			const { from, to, tokenId } = event;

			if (from === ZERO_ADDRESS) {
				// MINT: New position created
				// Get pool info for this position
				let poolInfo = poolInfoCache.get(tokenId);
				if (poolInfo === undefined) {
					poolInfo = await getPositionPoolInfo(positionManagerAddress, tokenId);
					poolInfoCache.set(tokenId, poolInfo);
				}

				if (poolInfo) {
					positions.set(tokenId, {
						owner: to,
						liquidity: 0n,
						depositBalance: 0n,
						token0: poolInfo.token0,
						token1: poolInfo.token1
					});
				}
			} else if (to === ZERO_ADDRESS) {
				// BURN: Position destroyed
				positions.delete(tokenId);
			} else {
				// TRANSFER: Position ownership changed
				const position = positions.get(tokenId);
				if (position) {
					position.owner = to;
				}
			}
		} else if (event.type === 'increase') {
			const { tokenId, liquidity, amount0, amount1 } = event;
			const position = positions.get(tokenId);

			if (position) {
				// Determine which amount corresponds to our token
				let depositAmount = 0n;
				if (position.token0 === normalizedToken) {
					depositAmount = amount0;
				} else if (position.token1 === normalizedToken) {
					depositAmount = amount1;
				}

				position.liquidity += liquidity;
				position.depositBalance += depositAmount;
			}
		} else if (event.type === 'decrease') {
			const { tokenId, liquidity, amount0, amount1 } = event;
			const position = positions.get(tokenId);

			if (position && position.liquidity > 0n) {
				// Calculate proportional deposit reduction
				// ratio = liquidity_removed / total_liquidity
				// depositReduction = depositBalance * ratio
				const ratio = (liquidity * 10n ** 18n) / position.liquidity;
				const depositReduction = (position.depositBalance * ratio) / 10n ** 18n;

				position.liquidity -= liquidity;
				position.depositBalance -= depositReduction;

				// Ensure we don't go negative due to rounding
				if (position.depositBalance < 0n) {
					position.depositBalance = 0n;
				}
			}
		}
	}

	// Aggregate deposit balances by owner
	const ownerBalances = new Map<string, bigint>();

	for (const position of positions.values()) {
		// Only count positions that contain our token
		if (position.token0 !== normalizedToken && position.token1 !== normalizedToken) {
			continue;
		}

		if (position.depositBalance > 0n) {
			const currentBalance = ownerBalances.get(position.owner) || 0n;
			ownerBalances.set(position.owner, currentBalance + position.depositBalance);
		}
	}

	return ownerBalances;
}

/**
 * Fetch all Aerodrome holdings for all configured tokens
 * Automatically finds positions containing any of the provided token addresses
 * Returns holdings that can be merged into wallet balances
 */
export async function fetchAllAerodromeHoldings(
	_tStockTransfers: Transfer[], // Not used in V3 approach
	targetBlock: number,
	tokenAddresses: string[]
): Promise<AerodromeHolding[]> {
	const allHoldings: AerodromeHolding[] = [];

	// Skip if no position manager configured
	if (!AERODROME_POSITION_MANAGER) {
		console.log('[Aerodrome] No position manager configured, skipping');
		return allHoldings;
	}

	console.log(`[Aerodrome] Fetching position events from ${AERODROME_POSITION_MANAGER}`);
	console.log(`[Aerodrome] Tracking ${tokenAddresses.length} tokens`);

	try {
		// Fetch all position events once
		const events = await fetchPositionEvents(AERODROME_POSITION_MANAGER, targetBlock);
		console.log(`[Aerodrome] Fetched ${events.length} position events`);

		// Calculate holdings for each token
		for (const tokenAddress of tokenAddresses) {
			const normalizedToken = tokenAddress.toLowerCase();

			const holdings = await calculateAerodromeHoldings(
				events,
				normalizedToken,
				AERODROME_POSITION_MANAGER,
				targetBlock
			);

			// Convert to AerodromeHolding format
			for (const [owner, depositBalance] of holdings) {
				allHoldings.push({
					owner,
					tokenAddress: normalizedToken,
					poolAddress: AERODROME_POSITION_MANAGER.toLowerCase(), // Use position manager as reference
					depositBalance: depositBalance.toString()
				});
			}

			if (holdings.size > 0) {
				console.log(`[Aerodrome] Found ${holdings.size} wallets with holdings for ${normalizedToken}`);
			}
		}
	} catch (error) {
		console.error(`[Aerodrome] Failed to fetch holdings:`, error);
	}

	console.log(`[Aerodrome] Total holdings fetched: ${allHoldings.length}`);
	return allHoldings;
}

/**
 * Merge Aerodrome holdings into wallet balances
 * Similar to mergeVaultHoldings but for Aerodrome LP positions
 */
export function mergeAerodromeHoldings(
	balances: Map<string, bigint>,
	aerodromeHoldings: AerodromeHolding[],
	tokenAddress: string
): Map<string, bigint> {
	const normalizedToken = tokenAddress.toLowerCase();

	// Filter holdings for this token
	const tokenHoldings = aerodromeHoldings.filter(h => h.tokenAddress === normalizedToken);

	console.log(
		`[MergeAerodrome] Token ${normalizedToken}: found ${tokenHoldings.length} holdings`
	);

	// Add Aerodrome holdings to wallet balances
	for (const holding of tokenHoldings) {
		const owner = holding.owner.toLowerCase();
		const depositBalance = BigInt(holding.depositBalance);

		const currentBalance = balances.get(owner) || 0n;
		balances.set(owner, currentBalance + depositBalance);
	}

	return balances;
}
