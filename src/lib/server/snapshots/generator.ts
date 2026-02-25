// High-level snapshot generator
// Single source of truth for generating snapshots - used by both preview and cron

import type { BlockSnapshot } from './types';
import { fetchAllTransfers, ALL_TOKEN_ADDRESSES } from './scraper';
import { generateSnapshot } from './processor';
import { fetchPythPricesAtTimestamp } from './pyth';
import { fetchAllVaultHoldings } from './vaults';
import { kvGet, KV_KEYS } from '$lib/server/kv';
import { networks } from '$lib/config/networks';
import { TOKENS, getTokenAddressVariants, getTokenByAnyAddress } from '$lib/config/tokens';

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
 * Generate a snapshot for a single token at a specific block.
 * Combines holdings across wrapped, unwrapped, and legacy addresses into one snapshot.
 */
export async function generateTokenSnapshot(
	tokenAddress: string,
	blockNumber: number
): Promise<BlockSnapshot> {
	const normalizedToken = tokenAddress.toLowerCase();

	// Find the parent token config to get all address variants
	const parentToken = getTokenByAnyAddress(normalizedToken);
	const allAddresses = parentToken ? getTokenAddressVariants(parentToken) : [normalizedToken];
	const wrappedAddress = parentToken?.address.toLowerCase() ?? normalizedToken;

	// Get block timestamp
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch transfers for all address variants up to target block
	const transfers = await fetchAllTransfers(blockNumber, allAddresses);

	// Fetch Pyth price at block timestamp (only need the wrapped address price)
	const { prices, priceTimestamp } = await fetchPythPricesAtTimestamp(timestamp, [wrappedAddress]);
	const price = prices.get(wrappedAddress);

	// Fetch vault holdings for all address variants at the specific block
	const vaultHoldings = await fetchAllVaultHoldings(allAddresses, blockNumber);

	// Fetch excluded wallets from KV
	const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];

	// Generate snapshot combining all address variants into one
	return generateSnapshot(
		transfers,
		blockNumber,
		timestamp,
		wrappedAddress,
		price,
		vaultHoldings,
		excludedWallets,
		priceTimestamp,
		allAddresses
	);
}

/**
 * Generate snapshots for all configured tokens at a specific block.
 * More efficient than calling generateTokenSnapshot for each token
 * because it batches the transfer fetch and price fetch.
 *
 * Each token produces ONE snapshot combining holdings across
 * wrapped, unwrapped, and legacy addresses.
 */
export async function generateAllTokenSnapshots_v2(blockNumber: number): Promise<BlockSnapshot[]> {
	// Get block timestamp first (needed for Pyth price lookup)
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch transfers, prices, vault holdings, and excluded wallets in parallel
	const [transfers, { prices, priceTimestamp }, vaultHoldings, excludedWallets] = await Promise.all(
		[
			fetchAllTransfers(blockNumber, ALL_TOKEN_ADDRESSES),
			fetchPythPricesAtTimestamp(timestamp, ALL_TOKEN_ADDRESSES),
			fetchAllVaultHoldings(ALL_TOKEN_ADDRESSES, blockNumber),
			kvGet<string[]>(KV_KEYS.excludedWallets()).then((w) => w || [])
		]
	);

	// Generate ONE snapshot per canonical token, combining all address variants
	return TOKENS.map((token) => {
		const wrappedAddr = token.address.toLowerCase();
		const allAddrs = getTokenAddressVariants(token);

		return generateSnapshot(
			transfers,
			blockNumber,
			timestamp,
			wrappedAddr,
			prices.get(wrappedAddr),
			vaultHoldings,
			excludedWallets,
			priceTimestamp,
			allAddrs
		);
	});
}
