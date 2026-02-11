/**
 * Balance Checker for Cross-Chain Swaps
 *
 * Validates user has sufficient token balance before initiating swaps.
 * Supports both native ETH and ERC20 tokens.
 */

import { createPublicClient, erc20Abi, type Address, type PublicClient } from 'viem';
import { CHAIN_CONFIG, type SupportedNetworkId, type PaymentToken } from '../types';
import { createRpcTransport } from '$lib/utils/rpc';

// Cache duration for balance checks (10 seconds)
const BALANCE_CACHE_DURATION_MS = 10000;

// =============================================================================
// Types
// =============================================================================

export interface BalanceCheckResult {
	hasEnough: boolean;
	balance: bigint;
	required: bigint;
	shortfall: bigint;
	token: PaymentToken;
}

interface CachedBalance {
	balance: bigint;
	timestamp: number;
}

// =============================================================================
// Balance Checker Class
// =============================================================================

export class BalanceChecker {
	private clients: Map<SupportedNetworkId, PublicClient> = new Map();
	private cache: Map<string, CachedBalance> = new Map();

	/**
	 * Get or create a public client for a chain
	 */
	private getClient(chainId: SupportedNetworkId): PublicClient {
		if (!this.clients.has(chainId)) {
			const client = createPublicClient({
				chain: CHAIN_CONFIG[chainId],
				transport: createRpcTransport(chainId)
			}) as PublicClient;
			this.clients.set(chainId, client);
		}
		return this.clients.get(chainId)!;
	}

	/**
	 * Get cache key for a balance query
	 */
	private getCacheKey(address: Address, token: PaymentToken): string {
		return `${token.chainId}:${token.address}:${address}`;
	}

	/**
	 * Check if cached balance is still valid
	 */
	private isCacheValid(key: string): boolean {
		const cached = this.cache.get(key);
		if (!cached) return false;
		return Date.now() - cached.timestamp < BALANCE_CACHE_DURATION_MS;
	}

	/**
	 * Get native ETH balance
	 */
	async getNativeBalance(chainId: SupportedNetworkId, address: Address): Promise<bigint> {
		const client = this.getClient(chainId);
		return client.getBalance({ address });
	}

	/**
	 * Get ERC20 token balance
	 */
	async getTokenBalance(token: PaymentToken, address: Address): Promise<bigint> {
		const cacheKey = this.getCacheKey(address, token);

		// Check cache first
		if (this.isCacheValid(cacheKey)) {
			return this.cache.get(cacheKey)!.balance;
		}

		const client = this.getClient(token.chainId);

		try {
			// Handle native tokens (ETH)
			if (token.isNative) {
				const balance = await client.getBalance({ address });
				this.cache.set(cacheKey, { balance, timestamp: Date.now() });
				return balance;
			}

			// ERC20 token
			const balance = await client.readContract({
				address: token.address,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [address]
			});

			this.cache.set(cacheKey, { balance, timestamp: Date.now() });
			return balance;
		} catch (error) {
			console.error(
				`Failed to get balance for ${token.symbol} on chain ${token.chainId}:`,
				error instanceof Error ? error.message : 'Unknown error'
			);
			return 0n;
		}
	}

	/**
	 * Check if user has sufficient balance for a swap
	 */
	async checkSufficientBalance(
		token: PaymentToken,
		address: Address,
		requiredAmount: bigint
	): Promise<BalanceCheckResult> {
		const balance = await this.getTokenBalance(token, address);
		const hasEnough = balance >= requiredAmount;
		const shortfall = hasEnough ? 0n : requiredAmount - balance;

		return {
			hasEnough,
			balance,
			required: requiredAmount,
			shortfall,
			token
		};
	}

	/**
	 * Check ERC20 allowance for a spender
	 */
	async checkAllowance(token: PaymentToken, owner: Address, spender: Address): Promise<bigint> {
		if (token.isNative) {
			return 2n ** 256n - 1n; // Max uint256 — native tokens don't need approval
		}

		const client = this.getClient(token.chainId);

		try {
			const allowance = await client.readContract({
				address: token.address,
				abi: erc20Abi,
				functionName: 'allowance',
				args: [owner, spender]
			});

			return allowance;
		} catch (error) {
			console.error(
				`Failed to check allowance for ${token.symbol}:`,
				error instanceof Error ? error.message : 'Unknown error'
			);
			return 0n;
		}
	}

	/**
	 * Check if approval is needed for a swap
	 */
	async needsApproval(
		token: PaymentToken,
		owner: Address,
		spender: Address,
		amount: bigint
	): Promise<{
		needsApproval: boolean;
		currentAllowance: bigint;
		requiredAmount: bigint;
	}> {
		const currentAllowance = await this.checkAllowance(token, owner, spender);
		const needsApproval = currentAllowance < amount;

		return {
			needsApproval,
			currentAllowance,
			requiredAmount: amount
		};
	}

	/**
	 * Clear the balance cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Invalidate cache for a specific token/address
	 */
	invalidateCache(address: Address, token: PaymentToken): void {
		const key = this.getCacheKey(address, token);
		this.cache.delete(key);
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let balanceCheckerInstance: BalanceChecker | null = null;

/**
 * Get the balance checker singleton
 */
export function getBalanceChecker(): BalanceChecker {
	if (!balanceCheckerInstance) {
		balanceCheckerInstance = new BalanceChecker();
	}
	return balanceCheckerInstance;
}

/**
 * Format balance shortfall for display
 */
export function formatBalanceShortfall(result: BalanceCheckResult): string {
	const shortfallFormatted = Number(result.shortfall) / 10 ** result.token.decimals;
	return `Insufficient ${result.token.symbol} balance. Need ${shortfallFormatted.toFixed(4)} more.`;
}
