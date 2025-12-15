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

// Pending request map for async operations
const pendingRequests = new Map<
	string,
	{
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
	}
>();

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

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Resolve a pending request (called from React)
 */
export function resolveRequest(requestId: string, result: unknown): void {
	const pending = pendingRequests.get(requestId);
	if (pending) {
		pending.resolve(result);
		pendingRequests.delete(requestId);
	}
}

/**
 * Reject a pending request (called from React)
 */
export function rejectRequest(requestId: string, error: Error): void {
	const pending = pendingRequests.get(requestId);
	if (pending) {
		pending.reject(error);
		pendingRequests.delete(requestId);
	}
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

		const txHash = await withRetry(async () => {
			const result = await privyWalletProvider!.request({
				method: 'eth_sendTransaction',
				params: [
					{
						from: walletAddress,
						to: params.to,
						data: params.data || '0x',
						value: params.value ? `0x${params.value.toString(16)}` : '0x0'
					}
				]
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
