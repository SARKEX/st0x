// Processor for calculating balances from transfers
// Modeled after albion.rewards/src/processor.ts

import type { Transfer, BlockSnapshot, TokenBalances, SnapshotPrice } from './types';
import type { TokenPrice } from './pyth';
import type { VaultHolding } from './vaults';
import { getTokenByAnyAddress } from '$lib/config/tokens';
import {
	EXCLUDED_WALLETS,
	ORDERBOOK_ADDRESS,
	SYSTEM_EXCLUDED_ADDRESSES
} from '$lib/config/snapshots';

// Zero address for filtering
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Build excluded addresses set from config and optional dynamic list
function getExcludedAddresses(dynamicExcluded: string[] = []): Set<string> {
	return new Set([
		...SYSTEM_EXCLUDED_ADDRESSES.map((a) => a.toLowerCase()),
		...EXCLUDED_WALLETS.map((a) => a.toLowerCase()),
		...dynamicExcluded.map((a) => a.toLowerCase()),
		ORDERBOOK_ADDRESS.toLowerCase()
	]);
}

/**
 * Calculate balances at a specific block by replaying transfers.
 * Accepts a single address or multiple addresses (e.g. wrapped + unwrapped + legacy).
 * When multiple addresses are provided, balances from all variants are summed per wallet.
 * Does NOT filter excluded addresses - that happens in generateSnapshot.
 */
export function calculateBalancesAtBlock(
	transfers: Transfer[],
	targetBlock: number,
	tokenAddresses: string | string[]
): { balances: Map<string, bigint>; totalSupply: bigint } {
	const balances = new Map<string, bigint>();
	let totalSupply = 0n;

	const addressSet = new Set(Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses]);

	// Filter transfers for these token addresses up to the target block
	const relevantTransfers = transfers.filter(
		(t) => addressSet.has(t.tokenAddress) && t.blockNumber <= targetBlock
	);

	// Replay transfers to calculate balances
	for (const transfer of relevantTransfers) {
		const { from, to, value } = transfer;
		const valueBigInt = BigInt(value);

		// Initialize balances if needed
		if (!balances.has(from)) balances.set(from, 0n);
		if (!balances.has(to)) balances.set(to, 0n);

		if (from === ZERO_ADDRESS) {
			// Mint - only add to receiver
			balances.set(to, balances.get(to)! + valueBigInt);
			totalSupply += valueBigInt;
		} else {
			// Transfer - subtract from sender, add to receiver
			balances.set(from, balances.get(from)! - valueBigInt);
			balances.set(to, balances.get(to)! + valueBigInt);
		}
	}

	// Remove zero and negative balances (not excluded addresses - done later)
	// Negative balances can occur due to transfer replay ordering issues
	for (const [address, balance] of balances) {
		if (balance <= 0n) {
			balances.delete(address);
		}
	}

	return { balances, totalSupply };
}

/**
 * Merge vault holdings into balances, attributing to vault owners.
 * Accepts a single address or multiple addresses (e.g. wrapped + unwrapped + legacy).
 * Note: Orderbook contract balance should already be removed before calling this.
 */
export function mergeVaultHoldings(
	balances: Map<string, bigint>,
	vaultHoldings: VaultHolding[],
	tokenAddresses: string | string[]
): Map<string, bigint> {
	const addressSet = new Set(Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses]);

	// Filter vault holdings for these token addresses
	const tokenVaults = vaultHoldings.filter((v) => addressSet.has(v.tokenAddress));

	console.log(
		`[MergeVaults] Tokens ${[...addressSet].join(',')}: found ${tokenVaults.length} vaults from ${
			vaultHoldings.length
		} total`
	);
	if (tokenVaults.length > 0) {
		console.log(`[MergeVaults] Sample vault:`, JSON.stringify(tokenVaults[0], null, 2));
	}

	// Add vault balances to their owners
	for (const vault of tokenVaults) {
		const owner = vault.owner.toLowerCase();
		const vaultBalance = BigInt(vault.balance);

		const currentBalance = balances.get(owner) || 0n;
		balances.set(owner, currentBalance + vaultBalance);
	}

	return balances;
}

/**
 * Remove zero balances and identify excluded wallets
 * Returns the cleaned balances and list of excluded wallet addresses that have balances
 * @param dynamicExcluded - Optional list of wallet addresses from KV store to exclude
 */
export function processBalances(
	balances: Map<string, bigint>,
	dynamicExcluded: string[] = []
): {
	balances: Map<string, bigint>;
	excludedWallets: string[];
} {
	const excluded = getExcludedAddresses(dynamicExcluded);
	const excludedWithBalances: string[] = [];

	for (const [address, balance] of balances) {
		if (balance === 0n) {
			balances.delete(address);
		} else if (excluded.has(address.toLowerCase())) {
			excludedWithBalances.push(address.toLowerCase());
		}
	}

	return { balances, excludedWallets: excludedWithBalances };
}

/**
 * Convert TokenPrice to SnapshotPrice format
 */
function toSnapshotPrice(tokenPrice: TokenPrice | undefined): SnapshotPrice | null {
	if (!tokenPrice) return null;

	return {
		price: tokenPrice.price,
		confidence: tokenPrice.confidence,
		priceFeedId: tokenPrice.priceFeedId,
		pricePublishTime: tokenPrice.publishTime
	};
}

/**
 * Generate a snapshot for a specific token at a specific block.
 * @param tokenAddress - The primary (wrapped) token address used for identification
 * @param allTokenAddresses - All address variants (wrapped + unwrapped + legacy) to include in balance calculation.
 *   If not provided, only tokenAddress is used.
 * @param vaultHoldings - Optional vault holdings to attribute to owners instead of orderbook
 * @param dynamicExcluded - Optional list of wallet addresses from KV store to mark as excluded
 * @param priceTimestamp - Optional timestamp used for Pyth price fetch (may differ from block timestamp if outside market hours)
 */
export function generateSnapshot(
	transfers: Transfer[],
	blockNumber: number,
	timestamp: number,
	tokenAddress: string,
	tokenPrice?: TokenPrice,
	vaultHoldings?: VaultHolding[],
	dynamicExcluded?: string[],
	priceTimestamp?: number,
	allTokenAddresses?: string[]
): BlockSnapshot {
	const token = getTokenByAnyAddress(tokenAddress);
	const addresses = allTokenAddresses ?? [tokenAddress];
	const result = calculateBalancesAtBlock(transfers, blockNumber, addresses);
	const totalSupply = result.totalSupply;
	let balances = result.balances;

	// Always remove the orderbook contract balance - it's not a real holder
	// Tokens in the orderbook are held in vaults owned by users
	const orderbookAddr = ORDERBOOK_ADDRESS.toLowerCase();
	balances.delete(orderbookAddr);

	// Remove token contract addresses from balances.
	// When combining wrapped + unwrapped + legacy, the wrapped contract holds
	// the underlying unwrapped tokens as backing (ERC4626). Including it would
	// double-count — those tokens already belong to the wrapped token holders.
	for (const addr of addresses) {
		balances.delete(addr);
	}

	// Attribute vault holdings to their owners (if vault data was fetched successfully)
	if (vaultHoldings && vaultHoldings.length > 0) {
		balances = mergeVaultHoldings(balances, vaultHoldings, addresses);
	}

	// Process balances: remove zeros and identify excluded wallets
	const processed = processBalances(balances, dynamicExcluded);
	balances = processed.balances;

	// Convert balances to serializable format
	const tokenBalances: TokenBalances = {};
	for (const [address, balance] of balances) {
		tokenBalances[address] = balance.toString();
	}

	return {
		blockNumber,
		timestamp,
		generatedAt: new Date().toISOString(),
		tokenAddress,
		tokenSymbol: token?.symbol || 'UNKNOWN',
		balances: tokenBalances,
		excludedWallets: processed.excludedWallets,
		totalSupply: totalSupply.toString(),
		price: toSnapshotPrice(tokenPrice),
		priceTimestamp: priceTimestamp ?? null
	};
}

/**
 * Generate snapshots for all tokens at a specific block
 * @param prices - Map of token address -> TokenPrice from Pyth
 * @param vaultHoldings - Vault holdings to attribute to owners instead of orderbook
 * @param dynamicExcluded - Optional list of wallet addresses from KV store to mark as excluded
 * @param priceTimestamp - Optional timestamp used for Pyth price fetch (may differ from block timestamp if outside market hours)
 */
export function generateAllTokenSnapshots(
	transfers: Transfer[],
	blockNumber: number,
	timestamp: number,
	tokenAddresses: string[],
	prices?: Map<string, TokenPrice>,
	vaultHoldings?: VaultHolding[],
	dynamicExcluded?: string[],
	priceTimestamp?: number
): BlockSnapshot[] {
	return tokenAddresses.map((tokenAddress) =>
		generateSnapshot(
			transfers,
			blockNumber,
			timestamp,
			tokenAddress,
			prices?.get(tokenAddress.toLowerCase()),
			vaultHoldings,
			dynamicExcluded,
			priceTimestamp
		)
	);
}
