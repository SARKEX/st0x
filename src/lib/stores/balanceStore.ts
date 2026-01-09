/**
 * Centralized Balance Store
 *
 * Provides a single source of truth for all balance queries across the app.
 * Reduces RPC calls by:
 * - Sharing balance data across all components
 * - Caching token metadata permanently (decimals never change)
 * - Batching all multicall requests together
 * - Deduplicating queries from multiple components
 */

import { QueryClient } from '@tanstack/svelte-query';
import {
	type SupportedNetworkId,
	type PaymentToken,
	SUPPORTED_NETWORKS,
	getPaymentTokensForNetwork
} from '$lib/services/account-abstraction';
import { readContracts } from '@wagmi/core';
import { erc20Abi, formatUnits, type Address } from 'viem';
import type { Config } from '@wagmi/core';

// =============================================================================
// Token Metadata Cache (never changes, cache permanently)
// =============================================================================

interface TokenMetadata {
	decimals: number;
	symbol: string;
	name: string;
}

const tokenMetadataCache = new Map<string, TokenMetadata>();

function getTokenKey(address: string, chainId: number): string {
	return `${address.toLowerCase()}-${chainId}`;
}

export function getCachedTokenMetadata(
	address: string,
	chainId: number
): TokenMetadata | undefined {
	return tokenMetadataCache.get(getTokenKey(address, chainId));
}

export function setCachedTokenMetadata(
	address: string,
	chainId: number,
	metadata: TokenMetadata
): void {
	tokenMetadataCache.set(getTokenKey(address, chainId), metadata);
}

// =============================================================================
// Balance Query Key Generator
// =============================================================================

/**
 * Centralized query key for all balance queries
 * Ensures all components share the same cache
 */
export function getBalanceQueryKey(walletAddress: string | null) {
	return ['globalBalances', walletAddress];
}

// =============================================================================
// Optimized Balance Fetcher
// =============================================================================

export interface TokenBalance {
	token: PaymentToken;
	balance: bigint;
	balanceFormatted: number;
	balanceUSD: number; // Estimated USD value
}

/**
 * Fetch all token balances across all networks in a single optimized call
 * This is used by all components that need balance data
 */
export async function fetchAllTokenBalances(
	walletAddress: Address,
	wagmiConfig: Config
): Promise<TokenBalance[]> {
	const balanceResults: TokenBalance[] = [];

	// Prepare all contracts for a single multicall batch
	const allContracts: Array<{
		abi: typeof erc20Abi;
		address: Address;
		functionName: 'balanceOf';
		args: [Address];
		chainId: number;
		token: PaymentToken;
	}> = [];

	// Networks to fetch balances for
	const networks: SupportedNetworkId[] = [
		SUPPORTED_NETWORKS.BASE,
		SUPPORTED_NETWORKS.ARBITRUM,
		SUPPORTED_NETWORKS.OPTIMISM,
		SUPPORTED_NETWORKS.ETHEREUM
	];

	// Collect all tokens from all networks (skip native tokens)
	for (const chainId of networks) {
		const tokens = getPaymentTokensForNetwork(chainId);
		for (const token of tokens) {
			// Skip native tokens (can't call balanceOf on them)
			if (token.isNative) continue;

			allContracts.push({
				abi: erc20Abi,
				address: token.address as Address,
				functionName: 'balanceOf',
				args: [walletAddress],
				chainId,
				token
			});
		}
	}

	// Execute single batched multicall for all tokens across all chains
	try {
		const results = await readContracts(wagmiConfig, {
			contracts: allContracts
		});

		// Process results
		for (let i = 0; i < allContracts.length; i++) {
			const { token } = allContracts[i];
			const result = results[i];

			if (result.status === 'success' && result.result) {
				const balance = result.result as bigint;
				const balanceFormatted = parseFloat(formatUnits(balance, token.decimals));

				// Estimate USD value (stablecoins = $1, ignore others for now)
				let balanceUSD = 0;
				if (token.symbol === 'USDC' || token.symbol === 'USDT') {
					balanceUSD = balanceFormatted;
				}

				balanceResults.push({
					token,
					balance,
					balanceFormatted,
					balanceUSD
				});

				// Cache token metadata for future use
				setCachedTokenMetadata(token.address, token.chainId, {
					decimals: token.decimals,
					symbol: token.symbol,
					name: token.name
				});
			}
		}
	} catch (error) {
		console.error('[BalanceStore] Failed to fetch balances:', error);
		// Return partial results instead of failing completely
	}

	return balanceResults;
}

// =============================================================================
// Query Configuration
// =============================================================================

/**
 * Shared query options for all balance queries
 * Use these to ensure consistent caching behavior
 */
export const BALANCE_QUERY_OPTIONS = {
	staleTime: 30_000, // 30 seconds
	gcTime: 120_000, // 2 minutes
	refetchOnMount: 'always' as const,
	refetchOnWindowFocus: true,
	refetchInterval: 300_000 // 5 minutes
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get balances for a specific network
 */
export function getBalancesForNetwork(
	balances: TokenBalance[] | undefined,
	chainId: number
): TokenBalance[] {
	if (!balances) return [];
	return balances.filter((b) => b?.token?.chainId === chainId);
}

/**
 * Get total USD value for a network
 */
export function getNetworkTotalUSD(balances: TokenBalance[] | undefined, chainId: number): number {
	if (!balances) return 0;
	return getBalancesForNetwork(balances, chainId).reduce((sum, b) => sum + (b.balanceUSD || 0), 0);
}

/**
 * Get balance for a specific token
 */
export function getTokenBalance(
	balances: TokenBalance[] | undefined,
	tokenAddress: string,
	chainId: number
): TokenBalance | undefined {
	if (!balances) return undefined;
	return balances.find(
		(b) =>
			b?.token?.address?.toLowerCase() === tokenAddress.toLowerCase() &&
			b?.token?.chainId === chainId
	);
}

/**
 * Get all networks with non-zero balances
 */
export function getNetworksWithBalances(
	balances: TokenBalance[] | undefined,
	excludeChainId?: number
): Array<{ chainId: number; totalUSD: number }> {
	if (!balances) return [];

	const networkTotals = new Map<number, number>();

	for (const balance of balances) {
		if (balance?.balanceUSD > 0 && balance?.token?.chainId) {
			const current = networkTotals.get(balance.token.chainId) || 0;
			networkTotals.set(balance.token.chainId, current + balance.balanceUSD);
		}
	}

	return Array.from(networkTotals.entries())
		.filter(([chainId]) => chainId !== excludeChainId)
		.map(([chainId, totalUSD]) => ({ chainId, totalUSD }))
		.sort((a, b) => b.totalUSD - a.totalUSD);
}

/**
 * Filter balances to only those with non-zero amounts
 */
export function getNonZeroBalances(balances: TokenBalance[] | undefined): TokenBalance[] {
	if (!balances) return [];
	return balances.filter((b) => b?.balance > 0n);
}
