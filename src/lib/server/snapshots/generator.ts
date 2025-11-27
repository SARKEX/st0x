// High-level snapshot generator
// Single source of truth for generating snapshots - used by both preview and cron

import type { BlockSnapshot } from './types';
import { fetchAllTransfers, TOKEN_ADDRESSES } from './scraper';
import { generateSnapshot, generateAllTokenSnapshots } from './processor';
import { fetchPythPricesAtTimestamp } from './pyth';
import { fetchAllVaultHoldings } from './vaults';
import { kv, KV_KEYS } from '$lib/server/kv';
import { networks } from '$lib/config/networks';

/**
 * Get block timestamp from RPC
 */
export async function getBlockTimestamp(blockNumber: number): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBlockByNumber',
					params: [`0x${blockNumber.toString(16)}`, false],
					id: 1
				})
			});

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result?.timestamp) {
				return parseInt(data.result.timestamp, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get block timestamp from any RPC');
}

/**
 * Get current block number from RPC
 */
export async function getCurrentBlockNumber(): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_blockNumber',
					params: [],
					id: 1
				})
			});

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result) {
				return parseInt(data.result, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get current block number from any RPC');
}

/**
 * Get block number for a specific timestamp using binary search via RPC
 */
export async function getBlockNumberForTimestamp(targetTimestamp: number): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	// Get current block as upper bound
	const latestBlock = await getCurrentBlockNumber();

	// Binary search to find block closest to target timestamp
	let left = 0;
	let right = latestBlock;
	let closestBlock = latestBlock;
	let smallestDiff = Infinity;

	const getTimestampForBlock = async (blockNum: number): Promise<number | null> => {
		for (const rpcUrl of rpcUrls) {
			try {
				const response = await fetch(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBlockByNumber',
						params: [`0x${blockNum.toString(16)}`, false],
						id: 1
					})
				});
				if (response.ok) {
					const data = await response.json();
					if (data.result?.timestamp) {
						return parseInt(data.result.timestamp, 16);
					}
				}
			} catch {
				continue;
			}
		}
		return null;
	};

	// Perform binary search with limited iterations
	for (let i = 0; i < 30 && left <= right; i++) {
		const mid = Math.floor((left + right) / 2);
		const blockTimestamp = await getTimestampForBlock(mid);

		if (blockTimestamp === null) {
			right = mid - 1;
			continue;
		}

		const diff = Math.abs(blockTimestamp - targetTimestamp);
		if (diff < smallestDiff) {
			smallestDiff = diff;
			closestBlock = mid;
		}

		if (blockTimestamp < targetTimestamp) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return closestBlock;
}

/**
 * Generate a snapshot for a single token at a specific block
 * This is the core function - takes token address and block number, returns BlockSnapshot
 */
export async function generateTokenSnapshot(
	tokenAddress: string,
	blockNumber: number
): Promise<BlockSnapshot> {
	const normalizedToken = tokenAddress.toLowerCase();

	// Get block timestamp
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch transfers for this token up to target block
	const transfers = await fetchAllTransfers(blockNumber, [normalizedToken]);

	// Fetch Pyth price at block timestamp (may be adjusted for market hours)
	const { prices, priceTimestamp } = await fetchPythPricesAtTimestamp(timestamp, [normalizedToken]);
	const price = prices.get(normalizedToken);

	// Fetch vault holdings for this token
	const vaultHoldings = await fetchAllVaultHoldings([normalizedToken]);

	// Fetch excluded wallets from KV
	const excludedWallets = kv ? (await kv.get<string[]>(KV_KEYS.excludedWallets())) || [] : [];

	// Generate the snapshot
	return generateSnapshot(
		transfers,
		blockNumber,
		timestamp,
		normalizedToken,
		price,
		vaultHoldings,
		excludedWallets,
		priceTimestamp
	);
}

/**
 * Generate snapshots for all configured tokens at a specific block
 * More efficient than calling generateTokenSnapshot for each token
 * because it batches the transfer fetch and price fetch
 */
export async function generateAllTokenSnapshots_v2(blockNumber: number): Promise<BlockSnapshot[]> {
	// Get block timestamp
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch all transfers up to target block (for all tokens)
	const transfers = await fetchAllTransfers(blockNumber, TOKEN_ADDRESSES);

	// Fetch Pyth prices for all tokens at block timestamp (may be adjusted for market hours)
	const { prices, priceTimestamp } = await fetchPythPricesAtTimestamp(timestamp, TOKEN_ADDRESSES);

	// Fetch vault holdings for all tokens
	const vaultHoldings = await fetchAllVaultHoldings(TOKEN_ADDRESSES);

	// Fetch excluded wallets from KV
	const excludedWallets = kv ? (await kv.get<string[]>(KV_KEYS.excludedWallets())) || [] : [];

	// Generate snapshots for all tokens
	return generateAllTokenSnapshots(
		transfers,
		blockNumber,
		timestamp,
		TOKEN_ADDRESSES,
		prices,
		vaultHoldings,
		excludedWallets,
		priceTimestamp
	);
}
