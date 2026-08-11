/**
 * Unified wallet service that routes to Dynamic or wagmi based on auth method
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
import { dynamicWalletAddress } from '$lib/stores/dynamicStore';
import { currentNetwork } from '$lib/stores';
import { withRetry } from '$lib/utils/retry';

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

/**
 * Send a transaction using the appropriate wallet.
 * Gas estimation is delegated to the wallet itself.
 */
export async function sendTransaction(params: {
	to: `0x${string}`;
	data?: Hex;
	value?: bigint;
}): Promise<Hash> {
	const method = get(authMethod);
	const config = get(wagmiConfig);

	if (method === 'dynamic') {
		// Use Dynamic's embedded wallet
		if (!dynamicWalletProvider) {
			throw new Error('Dynamic wallet provider not available');
		}

		const fromAddress = get(dynamicWalletAddress);
		if (!fromAddress) {
			throw new Error('Dynamic wallet address not available');
		}

		const network = get(currentNetwork);
		if (!network) throw new Error('No network selected');

		// Keep the embedded wallet on the registry-backed network selected in the UI.
		try {
			await dynamicWalletProvider!.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: `0x${network.chainId.toString(16)}` }]
			});
		} catch {
			// Chain might already be correct, or not supported - continue anyway
		}

		// Build transaction params - let wallet handle gas estimation
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
			const errorMessage = (error as Error)?.message || 'Transaction failed';
			throw new Error(errorMessage);
		}
	} else if (method === 'wallet') {
		// Use wagmi - let wallet handle gas estimation
		if (!config) {
			throw new Error('Wagmi config not available');
		}
		const network = get(currentNetwork);
		if (!network) throw new Error('No network selected');

		const hash = await withRetry(() =>
			wagmiSendTransaction(config, {
				to: params.to,
				data: params.data,
				value: params.value,
				chainId: network.chainId
			})
		);

		return hash;
	} else {
		throw new Error('No wallet connected');
	}
}

/** Extra confirmations after approvals so eth_call / simulation sees updated allowance on all RPCs. */
export const APPROVAL_TX_CONFIRMATIONS = 2;

/**
 * Wait for a transaction receipt
 * @param confirmations — block confirmations after inclusion (default 1). Use {@link APPROVAL_TX_CONFIRMATIONS} after ERC20 approvals.
 */
export async function waitForTransaction(
	hash: Hash,
	options?: { confirmations?: number }
): Promise<void> {
	const config = get(wagmiConfig);
	if (!config) {
		throw new Error('Wagmi config not available');
	}
	const network = get(currentNetwork);
	if (!network) throw new Error('No network selected');

	await withRetry(() =>
		wagmiWaitForTransactionReceipt(config, {
			hash,
			chainId: network.chainId,
			...(options?.confirmations != null ? { confirmations: options.confirmations } : {})
		})
	);
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
