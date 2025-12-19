/**
 * Unified wallet service that routes to Privy or wagmi based on auth method
 */
import { get } from 'svelte/store';
import { wagmiConfig, signerAddress } from 'svelte-wagmi';
import {
	sendTransaction as wagmiSendTransaction,
	signMessage as wagmiSignMessage,
	waitForTransactionReceipt as wagmiWaitForTransactionReceipt
} from '@wagmi/core';
import type { Hash, Hex } from 'viem';
import { authMethod } from '$lib/stores/authStore';
import { privyWalletAddress } from '$lib/stores/privyStore';

// Store for Privy wallet provider (set by React component)
let privyWalletProvider: {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
} | null = null;

/**
 * Set the Privy wallet provider (called from React)
 */
export function setPrivyWalletProvider(
	provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
): void {
	privyWalletProvider = provider;
}

/**
 * Get the current Privy wallet provider
 */
export function getPrivyWalletProvider(): typeof privyWalletProvider {
	return privyWalletProvider;
}

// Retry wrapper for RPC calls
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			const errorMessage = String(error);
			if (
				errorMessage.includes('header not found') ||
				errorMessage.includes('block not found') ||
				(error as { code?: number })?.code === -32000
			) {
				if (attempt < maxRetries - 1) {
					await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
					continue;
				}
			}
			throw error;
		}
	}
	throw lastError;
}

/**
 * Send a transaction using the appropriate wallet
 */
export async function sendTransaction(params: {
	to: `0x${string}`;
	data?: Hex;
	value?: bigint;
}): Promise<Hash> {
	const method = get(authMethod);

	if (method === 'privy') {
		// Use Privy's embedded wallet
		if (!privyWalletProvider) {
			throw new Error('Privy wallet provider not available');
		}

		const walletAddress = get(privyWalletAddress);
		if (!walletAddress) {
			throw new Error('Privy wallet address not available');
		}

		// Ensure we're on Base network (chain ID 8453)
		try {
			await privyWalletProvider!.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: '0x2105' }] // 8453 in hex
			});
		} catch {
			// Chain might already be correct, or not supported - continue anyway
		}

		// Build transaction params - let Privy handle gas estimation
		const txParams: Record<string, string> = {
			from: walletAddress,
			to: params.to
		};

		// Only add data if provided and not empty
		if (params.data && params.data !== '0x') {
			txParams.data = params.data;
		}

		// Only add value if provided and non-zero
		if (params.value && params.value > 0n) {
			txParams.value = `0x${params.value.toString(16)}`;
		}

		const txHash = await withRetry(async () => {
			const result = await privyWalletProvider!.request({
				method: 'eth_sendTransaction',
				params: [txParams]
			});
			return result as Hash;
		});

		return txHash;
	} else if (method === 'wallet') {
		// Use wagmi
		const config = get(wagmiConfig);
		if (!config) {
			throw new Error('Wagmi config not available');
		}

		const hash = await withRetry(() =>
			wagmiSendTransaction(config, {
				to: params.to,
				data: params.data,
				value: params.value
			})
		);

		return hash;
	} else {
		throw new Error('No wallet connected');
	}
}

/**
 * Wait for a transaction receipt
 */
export async function waitForTransaction(hash: Hash): Promise<void> {
	const config = get(wagmiConfig);
	if (!config) {
		throw new Error('Wagmi config not available');
	}

	// Use wagmi for receipt - works for both Privy and wagmi transactions
	await withRetry(() => wagmiWaitForTransactionReceipt(config, { hash }));
}

/**
 * Sign a message using the appropriate wallet
 */
export async function signMessage(message: string): Promise<`0x${string}`> {
	const method = get(authMethod);

	if (method === 'privy') {
		// Use Privy's embedded wallet
		if (!privyWalletProvider) {
			throw new Error('Privy wallet provider not available');
		}

		const walletAddress = get(privyWalletAddress);
		if (!walletAddress) {
			throw new Error('Privy wallet address not available');
		}

		const signature = await privyWalletProvider.request({
			method: 'personal_sign',
			params: [message, walletAddress]
		});

		return signature as `0x${string}`;
	} else if (method === 'wallet') {
		// Use wagmi
		const config = get(wagmiConfig);
		if (!config) {
			throw new Error('Wagmi config not available');
		}

		const signature = await wagmiSignMessage(config, { message });
		return signature;
	} else {
		throw new Error('No wallet connected');
	}
}

/**
 * Get the current signer address (unified)
 */
export function getSignerAddress(): string | null {
	const method = get(authMethod);

	if (method === 'privy') {
		return get(privyWalletAddress);
	} else if (method === 'wallet') {
		return get(signerAddress) ?? null;
	}

	return null;
}

/**
 * Send a transaction with optional ERC20 gas payment via Rhinestone
 *
 * When payInStablecoin is true, uses Rhinestone's omnichain transaction
 * to pay gas with USDC instead of ETH. Requires Rhinestone API key.
 *
 * @param params - Transaction parameters
 * @param payInStablecoin - If true, pay gas with USDC via Rhinestone
 */
export async function sendTransactionWithGasOption(
	params: {
		to: `0x${string}`;
		data?: Hex;
		value?: bigint;
	},
	payInStablecoin: boolean
): Promise<Hash> {
	// If not paying in stablecoin, use regular transaction
	if (!payInStablecoin) {
		return sendTransaction(params);
	}

	// For stablecoin gas payment, we need to use Rhinestone
	const method = get(authMethod);

	if (method !== 'privy') {
		// Rhinestone ERC20 gas payment currently only works with Privy embedded wallets
		// Fall back to regular transaction for external wallets
		console.warn('ERC20 gas payment only available for Privy wallets, falling back to ETH gas');
		return sendTransaction(params);
	}

	// Dynamic import to avoid circular dependencies
	const { getRhinestoneClient, isRhinestoneConfigured } = await import(
		'./account-abstraction/rhinestone/client'
	);
	const { getPrivyAccountForRhinestone } = await import('./account-abstraction/wallets/privy-7702');
	const { SUPPORTED_NETWORKS } = await import('./account-abstraction/types');

	if (!isRhinestoneConfigured()) {
		console.warn('Rhinestone not configured, falling back to ETH gas');
		return sendTransaction(params);
	}

	const walletAccount = getPrivyAccountForRhinestone();
	if (!walletAccount) {
		console.warn('Could not get wallet account for Rhinestone, falling back to ETH gas');
		return sendTransaction(params);
	}

	try {
		const rhinestoneClient = getRhinestoneClient();

		console.log('[Rhinestone] Executing same-chain transaction with USDC gas payment', {
			to: params.to,
			value: params.value?.toString(),
			dataLength: params.data?.length,
			walletAddress: walletAccount.address
		});

		// Execute same-chain transaction with USDC gas payment
		// For same-chain, use executeSameChainTransaction with 'chain' parameter
		const result = await rhinestoneClient.executeSameChainTransaction(
			{
				chainId: SUPPORTED_NETWORKS.BASE,
				calls: [
					{
						to: params.to,
						value: params.value || 0n,
						data: params.data || '0x'
					}
				]
			},
			walletAccount,
			'USDC' // Pay gas in USDC
		);

		console.log('[Rhinestone] Transaction successful:', result);
		return result.txHash;
	} catch (error) {
		console.error('[Rhinestone] ERC20 gas payment failed:', error);
		console.error('[Rhinestone] Error details:', {
			name: (error as Error)?.name,
			message: (error as Error)?.message,
			stack: (error as Error)?.stack,
			cause: (error as unknown as { cause?: unknown })?.cause
		});

		// Extract meaningful error message
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// Check for common error cases and provide user-friendly messages
		if (errorMessage.toLowerCase().includes('insufficient balance')) {
			throw new Error(
				'Insufficient USDC balance to pay gas fees. Please add USDC to your wallet or disable "Pay fees in stablecoin" option.'
			);
		}

		if (errorMessage.toLowerCase().includes('api key')) {
			throw new Error(
				'Rhinestone API key not configured. Please contact support or disable "Pay fees in stablecoin" option.'
			);
		}

		// Re-throw with clear message
		throw new Error(`Failed to pay gas with USDC: ${errorMessage}`);
	}
}
