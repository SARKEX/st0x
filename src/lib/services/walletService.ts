/**
 * Unified wallet service that routes to Dynamic or wagmi based on auth method
 */
import { get } from 'svelte/store';
import { wagmiConfig, signerAddress } from 'svelte-wagmi';
import {
	sendTransaction as wagmiSendTransaction,
	signMessage as wagmiSignMessage,
	waitForTransactionReceipt as wagmiWaitForTransactionReceipt,
	estimateGas as wagmiEstimateGas
} from '@wagmi/core';
import type { Hash, Hex } from 'viem';
import { authMethod } from '$lib/stores/authStore';
import { dynamicWalletAddress } from '$lib/stores/dynamicStore';

// Gas buffer multiplier (20% extra gas for safety)
const GAS_BUFFER_MULTIPLIER = 1.2;

// Store for Dynamic wallet provider (set by React component)
let dynamicWalletProvider: {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
} | null = null;

/**
 * Set the Dynamic wallet provider (called from React)
 */
export function setDynamicWalletProvider(
	provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
): void {
	dynamicWalletProvider = provider;
}

/**
 * Get the current Dynamic wallet provider
 */
export function getDynamicWalletProvider(): typeof dynamicWalletProvider {
	return dynamicWalletProvider;
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
	const config = get(wagmiConfig);

	// Estimate gas with buffer using wagmi (works for both wallet types)
	let gasWithBuffer: bigint | undefined;
	if (config) {
		try {
			const estimatedGas = await wagmiEstimateGas(config, {
				to: params.to,
				data: params.data,
				value: params.value
			});
			gasWithBuffer = BigInt(Math.ceil(Number(estimatedGas) * GAS_BUFFER_MULTIPLIER));
			console.log('[walletService] Gas estimated:', estimatedGas.toString(), '-> with buffer:', gasWithBuffer.toString());
		} catch (gasError) {
			console.warn('[walletService] Gas estimation failed, letting wallet handle it:', gasError);
		}
	}

	if (method === 'dynamic') {
		// Use Dynamic's embedded wallet
		if (!dynamicWalletProvider) {
			throw new Error('Dynamic wallet provider not available');
		}

		const walletAddress = get(dynamicWalletAddress);
		if (!walletAddress) {
			throw new Error('Dynamic wallet address not available');
		}

		// Ensure we're on Base network (chain ID 8453)
		try {
			await dynamicWalletProvider!.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: '0x2105' }] // 8453 in hex
			});
		} catch {
			// Chain might already be correct, or not supported - continue anyway
		}

		// Build transaction params with gas buffer
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

		// Add gas with buffer if we estimated it
		if (gasWithBuffer) {
			txParams.gas = `0x${gasWithBuffer.toString(16)}`;
		}

		try {
			const txHash = await withRetry(async () => {
				const result = await dynamicWalletProvider!.request({
					method: 'eth_sendTransaction',
					params: [txParams]
				});
				return result as Hash;
			});

			return txHash;
		} catch (error) {
			console.error('[walletService] Dynamic transaction error:', error);
			// Re-throw with better error message if available
			const errorMessage = (error as Error)?.message || 'Transaction failed';
			throw new Error(errorMessage);
		}
	} else if (method === 'wallet') {
		// Use wagmi with gas buffer
		if (!config) {
			throw new Error('Wagmi config not available');
		}

		const hash = await withRetry(() =>
			wagmiSendTransaction(config, {
				to: params.to,
				data: params.data,
				value: params.value,
				gas: gasWithBuffer
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

	// Use wagmi for receipt - works for both Dynamic and wagmi transactions
	await withRetry(() => wagmiWaitForTransactionReceipt(config, { hash }));
}

/**
 * Sign a message using the appropriate wallet
 */
export async function signMessage(message: string): Promise<`0x${string}`> {
	const method = get(authMethod);

	if (method === 'dynamic') {
		// Use Dynamic's embedded wallet
		if (!dynamicWalletProvider) {
			throw new Error('Dynamic wallet provider not available');
		}

		const walletAddress = get(dynamicWalletAddress);
		if (!walletAddress) {
			throw new Error('Dynamic wallet address not available');
		}

		const signature = await dynamicWalletProvider.request({
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

	if (method === 'dynamic') {
		return get(dynamicWalletAddress);
	} else if (method === 'wallet') {
		return get(signerAddress) ?? null;
	}

	return null;
}
