/**
 * Dynamic Wallet Integration for Rhinestone
 *
 * Integrates Dynamic embedded wallets with Rhinestone smart accounts.
 * Follows the pattern from: https://docs.rhinestone.dev/smart-wallet/core/signers/dynamic
 *
 * Key flow:
 * 1. Get wallet client from Dynamic via the provider
 * 2. Use walletClientToAccount() to create a viem Account
 * 3. Pass this account to Rhinestone SDK as an ECDSA owner
 *
 * For EIP-7702 mode:
 * - Set accountType: '7702' when creating the Rhinestone account
 * - This upgrades the user's EOA to act as a smart account
 * - Preserves their existing address while adding smart account features
 */

import type { Address, Hex, WalletClient, Account } from 'viem';
import {
	createPublicClient,
	createWalletClient,
	custom,
	http,
	type Chain
} from 'viem';
import { toAccount } from 'viem/accounts';
import { base, arbitrum, optimism, mainnet, baseSepolia, arbitrumSepolia } from 'viem/chains';
import { get } from 'svelte/store';
import {
	type SupportedNetworkId,
	SUPPORTED_NETWORKS,
	AAError,
	AAErrorCode
} from '../types';
import { dynamicSession } from '$lib/stores/dynamicStore';
import { getDynamicWalletProvider } from '$lib/services/walletService';

// Chain configurations
const CHAIN_CONFIGS: Record<SupportedNetworkId, Chain> = {
	[SUPPORTED_NETWORKS.BASE]: base,
	[SUPPORTED_NETWORKS.ARBITRUM]: arbitrum,
	[SUPPORTED_NETWORKS.OPTIMISM]: optimism,
	[SUPPORTED_NETWORKS.ETHEREUM]: mainnet,
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: baseSepolia,
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: arbitrumSepolia
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if Dynamic wallet is available and ready
 */
export function isDynamicWalletReady(): boolean {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();
	return session !== null && provider !== null;
}

/**
 * Get the wallet address from Dynamic session
 */
export function getDynamicWalletAddress(): Address | null {
	const session = get(dynamicSession);
	return (session?.walletAddress as Address) ?? null;
}

/**
 * Check if using Dynamic embedded wallet (supports EIP-7702)
 */
export function isDynamicEmbeddedWallet(): boolean {
	const session = get(dynamicSession);
	return session?.walletType === 'embedded';
}

/**
 * Create a viem WalletClient from the Dynamic provider
 *
 * @param chainId - The network to create the client for
 * @returns WalletClient or null if Dynamic is not available
 */
export async function createDynamicWalletClient(
	chainId: SupportedNetworkId
): Promise<WalletClient | null> {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();

	if (!provider || !session?.walletAddress) {
		return null;
	}

	return createWalletClient({
		account: session.walletAddress as Address,
		chain: CHAIN_CONFIGS[chainId],
		transport: custom(provider)
	});
}

/**
 * Create a viem Account from the Dynamic wallet for use with Rhinestone SDK
 *
 * This follows the Rhinestone + Dynamic integration pattern:
 * 1. Get the wallet provider from Dynamic
 * 2. Create a LocalAccount with signing methods
 * 3. Pass this account to Rhinestone SDK
 *
 * @param chainId - Optional chain ID (defaults to Base)
 * @returns Account object ready for Rhinestone SDK
 *
 * @example
 * ```ts
 * const account = await getDynamicAccountForRhinestone();
 * const rhinestoneAccount = await sdk.createAccount({
 *   owners: { type: 'ecdsa', accounts: [account] },
 *   accountType: '7702' // For EIP-7702 mode
 * });
 * ```
 */
export async function getDynamicAccountForRhinestone(
	chainId: SupportedNetworkId = SUPPORTED_NETWORKS.BASE
): Promise<Account | null> {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();

	if (!session?.walletAddress || !provider) {
		throw new AAError('Dynamic wallet not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	try {
		const address = session.walletAddress as Address;

		// Create a LocalAccount using toAccount with custom signing functions
		// This wraps the Dynamic provider and makes it compatible with Rhinestone SDK
		const account = toAccount({
			address,
			async signMessage({ message }) {
				// Sign a message using Dynamic's provider
				const msgToSign = typeof message === 'string' ? message : message.raw;
				const signature = await provider.request({
					method: 'personal_sign',
					params: [msgToSign, address]
				});
				return signature as Hex;
			},
			async signTransaction(transaction) {
				// Sign a transaction using Dynamic's provider
				const signature = await provider.request({
					method: 'eth_signTransaction',
					params: [transaction]
				});
				return signature as Hex;
			},
			async signTypedData(typedData) {
				// Sign typed data (EIP-712) using Dynamic's provider
				// Use a custom replacer to handle BigInt values which JSON.stringify can't serialize
				const jsonString = JSON.stringify(typedData, (key, value) =>
					typeof value === 'bigint' ? value.toString() : value
				);
				const signature = await provider.request({
					method: 'eth_signTypedData_v4',
					params: [address, jsonString]
				});
				return signature as Hex;
			}
		});

		console.log('[Dynamic Wallet] Created account for Rhinestone:', {
			address: account.address,
			chainId,
			type: account.type
		});

		return account;
	} catch (error) {
		console.error('[Dynamic Wallet] Failed to create account:', error);
		throw new AAError(
			`Failed to create Dynamic account: ${error instanceof Error ? error.message : 'Unknown error'}`,
			AAErrorCode.WALLET_NOT_CONNECTED,
			{ originalError: error }
		);
	}
}

/**
 * Create a public client for reading blockchain data
 */
export function createDynamicPublicClient(chainId: SupportedNetworkId) {
	// Use createRpcTransport for automatic fallbacks and load balancing
	const { createRpcTransport } = require('$lib/utils/rpc');
	return createPublicClient({
		chain: CHAIN_CONFIGS[chainId],
		transport: createRpcTransport(chainId)
	});
}

/**
 * Check if EIP-7702 is supported for the current wallet
 *
 * EIP-7702 is available for:
 * - Dynamic embedded wallets (type: 'embedded')
 * - On networks that support EIP-7702 (post-Pectra upgrade)
 */
export function supportsEIP7702(): boolean {
	return isDynamicEmbeddedWallet();
}

/**
 * Sign a message with the Dynamic wallet
 */
export async function signMessage(message: string): Promise<Hex> {
	const provider = getDynamicWalletProvider();
	const session = get(dynamicSession);

	if (!provider || !session?.walletAddress) {
		throw new AAError('Dynamic wallet not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	try {
		const signature = await provider.request({
			method: 'personal_sign',
			params: [message, session.walletAddress]
		});

		return signature as Hex;
	} catch (error) {
		throw new AAError(
			`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`,
			AAErrorCode.WALLET_NOT_CONNECTED,
			{ originalError: error }
		);
	}
}
