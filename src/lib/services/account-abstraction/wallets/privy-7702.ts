/**
 * Privy EIP-7702 Smart EOA Integration
 *
 * Extends Privy embedded wallets with EIP-7702 capabilities.
 * This allows Privy EOAs to:
 * - Execute batch transactions
 * - Pay gas via Rhinestone's paymaster
 * - Use session keys for delegated signing
 *
 * Connects to the existing Privy store from $lib/stores/privyStore.
 */

import type { Address, Hex, Hash } from 'viem';
import { createPublicClient, http, encodeFunctionData, parseAbi, type Chain } from 'viem';
import { base, arbitrum, mainnet, baseSepolia, arbitrumSepolia } from 'viem/chains';
import { get } from 'svelte/store';
import {
	type EIP7702Authorization,
	type SignedAuthorization,
	type SupportedNetworkId,
	SUPPORTED_NETWORKS,
	AAError,
	AAErrorCode
} from '../types';
import { privySession, privyReady, type PrivySession } from '$lib/stores/privyStore';

// =============================================================================
// Constants
// =============================================================================

// Simple7702Account contract addresses (deployed by Alchemy/Rhinestone)
// TODO: These need to be deployed or verified for each network
const SIMPLE_7702_ACCOUNT_ADDRESSES: Record<number, Address> = {
	[SUPPORTED_NETWORKS.BASE]: '0x0000000000000000000000000000000000000000',
	[SUPPORTED_NETWORKS.ARBITRUM]: '0x0000000000000000000000000000000000000000',
	[SUPPORTED_NETWORKS.ETHEREUM]: '0x0000000000000000000000000000000000000000',
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: '0x0000000000000000000000000000000000000000',
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: '0x0000000000000000000000000000000000000000'
};

// Chain configurations
const CHAIN_CONFIGS: Record<SupportedNetworkId, Chain> = {
	[SUPPORTED_NETWORKS.BASE]: base,
	[SUPPORTED_NETWORKS.ARBITRUM]: arbitrum,
	[SUPPORTED_NETWORKS.ETHEREUM]: mainnet,
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: baseSepolia,
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: arbitrumSepolia
};

// =============================================================================
// Types
// =============================================================================

export interface EIP7702WalletCapabilities {
	supportsEIP7702: boolean;
	isDelegated: boolean;
	delegateContract?: Address;
	supportsBatching: boolean;
	supportsGasSponsorship: boolean;
}

// =============================================================================
// EIP-7702 Helper Functions
// =============================================================================

/**
 * Check if the current Privy session supports EIP-7702
 *
 * EIP-7702 is available for:
 * - Privy embedded wallets (type: 'embedded')
 * - On networks that support EIP-7702 (post-Pectra upgrade)
 */
export function supportsEIP7702(): boolean {
	const session = get(privySession);
	if (!session) return false;

	// Only embedded wallets can use EIP-7702 signing
	return session.walletType === 'embedded';
}

/**
 * Check if the wallet has been delegated to a smart account
 */
export async function checkDelegationStatus(
	chainId: SupportedNetworkId
): Promise<{
	isDelegated: boolean;
	delegateContract?: Address;
}> {
	const session = get(privySession);
	if (!session?.walletAddress) {
		return { isDelegated: false };
	}

	const client = createPublicClient({
		chain: CHAIN_CONFIGS[chainId],
		transport: http()
	});

	// Check if the EOA has code (indicating EIP-7702 delegation)
	const code = await client.getCode({
		address: session.walletAddress as Address
	});

	if (!code || code === '0x') {
		return { isDelegated: false };
	}

	// EOA has code - it's delegated
	return {
		isDelegated: true,
		delegateContract: SIMPLE_7702_ACCOUNT_ADDRESSES[chainId]
	};
}

/**
 * Get the wallet capabilities for the current Privy session
 */
export async function getWalletCapabilities(
	chainId: SupportedNetworkId
): Promise<EIP7702WalletCapabilities> {
	const hasEIP7702Support = supportsEIP7702();

	if (!hasEIP7702Support) {
		return {
			supportsEIP7702: false,
			isDelegated: false,
			supportsBatching: false,
			supportsGasSponsorship: false
		};
	}

	const { isDelegated, delegateContract } = await checkDelegationStatus(chainId);

	return {
		supportsEIP7702: true,
		isDelegated,
		delegateContract,
		supportsBatching: isDelegated,
		supportsGasSponsorship: isDelegated
	};
}

/**
 * Get the wallet address from the Privy session
 */
export function getPrivyWalletAddress(): Address | null {
	const session = get(privySession);
	return (session?.walletAddress as Address) ?? null;
}

/**
 * Check if Privy is ready and authenticated
 */
export function isPrivyWalletReady(): boolean {
	return get(privyReady) && get(privySession) !== null;
}

/**
 * Encode a batch call for the smart account
 */
export function encodeBatchCall(
	calls: Array<{ to: Address; data: Hex; value?: bigint }>
): Hex {
	// Simple7702Account uses executeBatch(Call[] calldata calls)
	const abi = parseAbi([
		'function executeBatch((address target, uint256 value, bytes data)[] calls)'
	]);

	const formattedCalls = calls.map((call) => ({
		target: call.to,
		value: call.value ?? 0n,
		data: call.data
	}));

	return encodeFunctionData({
		abi,
		functionName: 'executeBatch',
		args: [formattedCalls]
	});
}

/**
 * Encode a single execute call
 */
export function encodeExecute(call: { to: Address; data: Hex; value?: bigint }): Hex {
	const abi = parseAbi([
		'function execute(address target, uint256 value, bytes calldata data)'
	]);

	return encodeFunctionData({
		abi,
		functionName: 'execute',
		args: [call.to, call.value ?? 0n, call.data]
	});
}

// =============================================================================
// EOA Delegate Stubs (for MetaMask/Rabby)
// =============================================================================

/**
 * TODO: EOA Delegate Contract Integration
 *
 * For external EOA wallets (MetaMask, Rabby, etc.) that don't support EIP-7702,
 * we need a delegate contract pattern:
 *
 * 1. User deposits funds into their personal delegate contract
 * 2. Delegate contract executes trades on behalf of user
 * 3. User can withdraw remaining funds at any time
 *
 * This requires:
 * - DelegateFactory contract deployment
 * - DelegateAccount contract deployment
 * - Security audit
 */

export interface EOADelegateStatus {
	hasDelegateContract: boolean;
	delegateAddress?: Address;
	isSupported: boolean;
	message: string;
}

/**
 * Check EOA delegate status (stub)
 */
export async function checkEOADelegateStatus(
	walletAddress: Address,
	chainId: SupportedNetworkId
): Promise<EOADelegateStatus> {
	// TODO: Implement when delegate contracts are deployed
	return {
		hasDelegateContract: false,
		isSupported: false,
		message: 'EOA delegate contracts are not yet deployed. Feature coming soon.'
	};
}
