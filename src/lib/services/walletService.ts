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

// Gas buffer multiplier (100% extra gas for safety)
// Complex transactions like takeOrders often need more gas than estimated
const GAS_BUFFER_MULTIPLIER = 2.0;

// Fallback gas limit when estimation fails (2M gas - conservative for complex transactions)
// This is especially important for takeOrders which can consume 500k-1M+ gas
const FALLBACK_GAS_LIMIT = 2_000_000n;

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

	// Get the appropriate wallet address based on auth method
	const fromAddress =
		method === 'dynamic'
			? (get(dynamicWalletAddress) as `0x${string}` | undefined)
			: (get(signerAddress) as `0x${string}` | undefined);

	// Estimate gas with buffer using wagmi (works for both wallet types)
	let gasWithBuffer: bigint | undefined;
	if (config && fromAddress) {
		try {
			console.log('[walletService] Attempting gas estimation', {
				to: params.to,
				dataLength: params.data?.length,
				hasValue: !!params.value,
				fromAddress
			});
			const estimatedGas = await wagmiEstimateGas(config, {
				account: fromAddress,
				to: params.to,
				data: params.data,
				value: params.value
			});
			gasWithBuffer = BigInt(Math.ceil(Number(estimatedGas) * GAS_BUFFER_MULTIPLIER));
			console.log(
				'[walletService] Gas estimated:',
				estimatedGas.toString(),
				'-> with buffer:',
				gasWithBuffer.toString()
			);
		} catch (gasError) {
			// Log detailed error information
			const errorMessage = (gasError as Error)?.message || String(gasError);
			const errorCode = (gasError as { code?: number | string })?.code;
			const errorDetails = (gasError as { details?: string })?.details;
			const errorCause = (gasError as { cause?: unknown })?.cause;

			console.error('[walletService] Gas estimation failed:', {
				error: gasError,
				message: errorMessage,
				code: errorCode,
				details: errorDetails,
				cause: errorCause,
				to: params.to,
				dataLength: params.data?.length,
				fromAddress
			});

			// Check if it's a specific error type that suggests the transaction would revert
			const errorStr = errorMessage.toLowerCase();
			if (
				errorStr.includes('execution reverted') ||
				errorStr.includes('revert') ||
				errorStr.includes('invalid') ||
				errorStr.includes('out of gas')
			) {
				console.warn(
					'[walletService] Gas estimation failed due to transaction revert - this might indicate the transaction will fail. Using fallback gas limit anyway.'
				);
			}

			// Use fallback gas limit for complex transactions
			// This is especially important for takeOrders which can fail estimation but need significant gas
			gasWithBuffer = FALLBACK_GAS_LIMIT;
			console.warn(
				`[walletService] Using fallback gas limit: ${gasWithBuffer.toString()} (${FALLBACK_GAS_LIMIT.toString()} wei)`
			);
		}
	} else {
		// If we don't have config or address, use fallback
		if (!config) {
			console.warn('[walletService] No wagmi config, using fallback gas limit');
		}
		if (!fromAddress) {
			console.warn('[walletService] No from address, using fallback gas limit');
		}
		gasWithBuffer = FALLBACK_GAS_LIMIT;
	}

	if (method === 'dynamic') {
		// Use Dynamic's embedded wallet
		if (!dynamicWalletProvider) {
			throw new Error('Dynamic wallet provider not available');
		}

		if (!fromAddress) {
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
			from: fromAddress,
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

		// Always set gas (either from estimation or fallback)
		// This ensures we have control over gas limits for complex transactions
		if (gasWithBuffer) {
			txParams.gas = `0x${gasWithBuffer.toString(16)}`;
			console.log('[walletService] Dynamic transaction gas set:', {
				gasHex: txParams.gas,
				gasDecimal: gasWithBuffer.toString(),
				isFallback: gasWithBuffer === FALLBACK_GAS_LIMIT
			});
		} else {
			// This should never happen now, but add safety check
			console.error('[walletService] CRITICAL: No gas buffer set, using fallback');
			gasWithBuffer = FALLBACK_GAS_LIMIT;
			txParams.gas = `0x${gasWithBuffer.toString(16)}`;
		}

		try {
			const txHash = await withRetry(async () => {
				console.log('[walletService] Sending Dynamic transaction with params:', {
					to: txParams.to,
					gas: txParams.gas,
					dataLength: txParams.data?.length
				});
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
