// Processor for calculating balances from transfers
// Modeled after albion.rewards/src/processor.ts

import type { Transfer, BlockSnapshot, TokenBalances, SnapshotPrice } from './types';
import type { TokenPrice } from './pyth';
import type { VaultHolding } from './vaults';
import { TOKENS } from '$lib/config/tokens';
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
 * Calculate balances at a specific block by replaying transfers
 * Does NOT filter excluded addresses - that happens in generateSnapshot
 */
export function calculateBalancesAtBlock(
	transfers: Transfer[],
	targetBlock: number,
	tokenAddress: string
): { balances: Map<string, bigint>; totalSupply: bigint } {
	const balances = new Map<string, bigint>();
	let totalSupply = 0n;

	// Filter transfers for this token up to the target block
	const relevantTransfers = transfers.filter(
		(t) => t.tokenAddress === tokenAddress && t.blockNumber <= targetBlock
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

	// Remove zero balances only (not excluded addresses - done later)
	for (const [address, balance] of balances) {
		if (balance === 0n) {
			balances.delete(address);
		}
	}

	return { balances, totalSupply };
}

/**
 * Merge vault holdings into balances, attributing to vault owners
 * Removes the orderbook contract balance and adds vault balances to owners
 */
export function mergeVaultHoldings(
	balances: Map<string, bigint>,
	vaultHoldings: VaultHolding[],
	tokenAddress: string
): Map<string, bigint> {
	const orderbookAddr = ORDERBOOK_ADDRESS.toLowerCase();
	const normalizedToken = tokenAddress.toLowerCase();

	// Remove orderbook contract balance (will be replaced by vault owner attributions)
	balances.delete(orderbookAddr);

	// Filter vault holdings for this token
	const tokenVaults = vaultHoldings.filter((v) => v.tokenAddress === normalizedToken);

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
 * Generate a snapshot for a specific token at a specific block
 * @param vaultHoldings - Optional vault holdings to attribute to owners instead of orderbook
 * @param dynamicExcluded - Optional list of wallet addresses from KV store to mark as excluded
 */
export function generateSnapshot(
	transfers: Transfer[],
	blockNumber: number,
	timestamp: number,
	tokenAddress: string,
	tokenPrice?: TokenPrice,
	vaultHoldings?: VaultHolding[],
	dynamicExcluded?: string[]
): BlockSnapshot {
	const token = TOKENS.find((t) => t.address.toLowerCase() === tokenAddress);
	const result = calculateBalancesAtBlock(transfers, blockNumber, tokenAddress);
	const totalSupply = result.totalSupply;
	let balances = result.balances;

	// Merge vault holdings if provided (replaces orderbook balance with vault owner attributions)
	if (vaultHoldings && vaultHoldings.length > 0) {
		balances = mergeVaultHoldings(balances, vaultHoldings, tokenAddress);
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
		price: toSnapshotPrice(tokenPrice)
	};
}

/**
 * Generate snapshots for all tokens at a specific block
 * @param prices - Map of token address -> TokenPrice from Pyth
 * @param vaultHoldings - Vault holdings to attribute to owners instead of orderbook
 * @param dynamicExcluded - Optional list of wallet addresses from KV store to mark as excluded
 */
export function generateAllTokenSnapshots(
	transfers: Transfer[],
	blockNumber: number,
	timestamp: number,
	tokenAddresses: string[],
	prices?: Map<string, TokenPrice>,
	vaultHoldings?: VaultHolding[],
	dynamicExcluded?: string[]
): BlockSnapshot[] {
	return tokenAddresses.map((tokenAddress) =>
		generateSnapshot(
			transfers,
			blockNumber,
			timestamp,
			tokenAddress,
			prices?.get(tokenAddress.toLowerCase()),
			vaultHoldings,
			dynamicExcluded
		)
	);
}
