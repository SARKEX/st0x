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
import { createPublicClient, createWalletClient, custom, type Chain } from 'viem';
import { base, arbitrum, optimism, mainnet, baseSepolia, arbitrumSepolia } from 'viem/chains';
import { get } from 'svelte/store';
import { walletClientToAccount } from '@rhinestone/sdk';
import { type SupportedNetworkId, SUPPORTED_NETWORKS, AAError, AAErrorCode } from '../types';
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
 * Result type for getDynamicAccountForRhinestone
 * Returns both the account and wallet client for flexible usage
 */
export interface DynamicAccountResult {
	account: Account;
	walletClient: WalletClient;
}

/**
 * Create a viem Account from the Dynamic wallet for use with Rhinestone SDK
 *
 * This follows the Rhinestone + Dynamic integration pattern from:
 * https://docs.rhinestone.dev/smart-wallet/core/signers/dynamic
 *
 * Key flow:
 * 1. Create a wagmi wallet client from Dynamic provider
 * 2. Use walletClientToAccount() from Rhinestone SDK to create a viem Account
 * 3. Pass this account to Rhinestone SDK as an ECDSA owner
 *
 * For EIP-7702 authorization signing:
 * - The wallet client's signAuthorization method is used directly
 * - This works around viem's limitation with JSON-RPC accounts
 *
 * @param chainId - Optional chain ID (defaults to Base)
 * @param returnWalletClient - If true, returns both account and wallet client
 * @returns Account object (or DynamicAccountResult if returnWalletClient is true)
 *
 * @example
 * ```ts
 * const account = await getDynamicAccountForRhinestone();
 * const rhinestoneAccount = await sdk.createAccount({
 *   owners: { type: 'ecdsa', accounts: [account] },
 *   accountType: '7702' // For EIP-7702 mode
 * });
 * ```
 * 
 * @example
 * ```ts
 * // Get both account and wallet client for authorization signing
 * const { account, walletClient } = await getDynamicAccountForRhinestone(chainId, true);
 * const authorization = await walletClient.signAuthorization({
 *   account: account,
 *   contractAddress: delegateContractAddress
 * });
 * ```
 */
export async function getDynamicAccountForRhinestone(
	chainId: SupportedNetworkId = SUPPORTED_NETWORKS.BASE,
	returnWalletClient: boolean = false
): Promise<Account | DynamicAccountResult | null> {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();

	if (!session?.walletAddress || !provider) {
		throw new AAError('Dynamic wallet not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	try {
		// Step 1: Create a wagmi wallet client from Dynamic provider
		// This uses viem's createWalletClient with the Dynamic provider
		const walletClient = await createDynamicWalletClient(chainId);
		
		if (!walletClient) {
			throw new AAError(
				'Failed to create wallet client from Dynamic provider',
				AAErrorCode.WALLET_NOT_CONNECTED
			);
		}

		// Step 2: Use Rhinestone SDK's walletClientToAccount to convert wallet client to Account
		// This is the recommended approach per Rhinestone docs for Dynamic integration
		const account = walletClientToAccount(walletClient);

		// ✅ Patch missing `type` so viem doesn't throw AccountTypeNotSupportedError
		// Prefer whatever viem gave us, fallback to 'json-rpc'
		(account as any).type ??= (walletClient.account as any)?.type ?? 'json-rpc';

		// Test message signing to verify the account works
		if (account.signMessage) {
			try {
				const testMessage = 'Test message for Dynamic wallet signing';
				const messageSig = await account.signMessage({ message: testMessage });
				console.log('[Dynamic Wallet] signMessage test OK:', messageSig);
			} catch (e) {
				console.error('[Dynamic Wallet] signMessage test FAIL:', e);
			}
		}

		// Test typed data signing to verify EIP-712 works
		if (account.signTypedData) {
			try {
				const sig = await account.signTypedData({
					domain: {
						name: 'Test',
						version: '1',
						chainId: chainId,
						verifyingContract: '0x0000000000000000000000000000000000000000'
					},
					types: { Test: [{ name: 'value', type: 'uint256' }] },
					primaryType: 'Test',
					message: { value: 1n }
				} as any);
				console.log('[Dynamic Wallet] signTypedData test OK:', sig);
			} catch (e) {
				console.error('[Dynamic Wallet] signTypedData test FAIL:', e);
			}
		}

		console.log('[Dynamic Wallet] Created account for Rhinestone using walletClientToAccount:', {
			address: account.address,
			chainId,
			type: account.type,
			returnWalletClient
		});

		// Return both account and wallet client if requested
		if (returnWalletClient) {
			return { account, walletClient };
		}

		return account;
	} catch (error) {
		console.error('[Dynamic Wallet] Failed to create account:', error);
		throw new AAError(
			`Failed to create Dynamic account: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			AAErrorCode.WALLET_NOT_CONNECTED,
			{ originalError: error }
		);
	}
}

/**
 * Create a public client for reading blockchain data
 */
export async function createDynamicPublicClient(chainId: SupportedNetworkId) {
	// Use createRpcTransport for automatic fallbacks and load balancing
	const { createRpcTransport } = await import('$lib/utils/rpc');
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
