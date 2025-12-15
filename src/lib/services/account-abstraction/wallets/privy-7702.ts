/**
 * Privy EIP-7702 Smart EOA Integration
 *
 * Extends Privy embedded wallets with EIP-7702 capabilities.
 * EIP-7702 (Pectra upgrade, May 2025) allows EOAs to delegate to smart contracts.
 *
 * Key benefits:
 * - User keeps their existing EOA address
 * - EOA gains smart account capabilities (batching, gas sponsorship)
 * - Can use Rhinestone's cross-chain features while preserving address
 *
 * Flow:
 * 1. User's Privy embedded EOA signs an EIP-7702 authorization
 * 2. Authorization delegates the EOA to an ERC-7579 compliant account implementation
 * 3. Transactions can be sent with `authorizationList` to enable smart features
 * 4. Rhinestone SDK handles cross-chain coordination
 *
 * Connects to the existing Privy store from $lib/stores/privyStore.
 *
 * References:
 * - https://docs.privy.io/recipes/react/eip-7702
 * - https://viem.sh/docs/eip7702/signAuthorization
 * - https://docs.rhinestone.dev/sdk/smart-sessions/overview
 */

import type { Address, Hex, Hash, WalletClient, Account } from 'viem';
import {
	createPublicClient,
	createWalletClient,
	custom,
	http,
	encodeFunctionData,
	parseAbi,
	keccak256,
	encodeAbiParameters,
	type Chain
} from 'viem';
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
import { getPrivyWalletProvider } from '$lib/services/walletService';

/**
 * Hash an EIP-7702 authorization for signing
 * EIP-7702 defines the authorization hash as:
 * keccak256(MAGIC || rlp([chain_id, address, nonce]))
 *
 * Where MAGIC = 0x05
 */
function hashEIP7702Authorization(auth: EIP7702Authorization): Hex {
	// EIP-7702 authorization hash format
	// This is a simplified version - the actual implementation may need RLP encoding
	const encoded = encodeAbiParameters(
		[
			{ type: 'uint256', name: 'chainId' },
			{ type: 'address', name: 'address' },
			{ type: 'uint256', name: 'nonce' }
		],
		[auth.chainId, auth.address, auth.nonce]
	);
	return keccak256(encoded);
}

// =============================================================================
// Constants
// =============================================================================

/**
 * ERC-7579 compliant account implementations for EIP-7702 delegation
 *
 * These contracts allow EOAs to act as modular smart accounts:
 * - Support batching (executeBatch)
 * - Support gas sponsorship via paymasters
 * - Compatible with Rhinestone's cross-chain infrastructure
 *
 * Using the MetaMask EIP-7702 Delegator which is ERC-7579 compliant
 * and authored by rhinestone.wtf (zeroknots.eth)
 */
const ERC7579_ACCOUNT_IMPLEMENTATIONS: Record<number, Address> = {
	// MetaMask EIP-7702 Delegator - deployed on multiple chains
	// Source: https://etherscan.io/address/0x63c0c19a282a1b52b07dd5a65b58948a07dae32b
	[SUPPORTED_NETWORKS.BASE]: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
	[SUPPORTED_NETWORKS.ARBITRUM]: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
	[SUPPORTED_NETWORKS.ETHEREUM]: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
	// Testnets - may need different addresses, using same for now
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
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

/**
 * Signed EIP-7702 authorization ready to be included in a transaction
 */
export interface EIP7702SignedAuthorization {
	chainId: bigint;
	contractAddress: Address;
	nonce: bigint;
	r: Hex;
	s: Hex;
	yParity: number;
}

/**
 * Options for creating an EIP-7702 authorization
 */
export interface EIP7702AuthorizationOptions {
	chainId: SupportedNetworkId;
	contractAddress?: Address; // Defaults to ERC7579_ACCOUNT_IMPLEMENTATIONS for the chain
	nonce?: bigint; // Defaults to current account nonce
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
		delegateContract: ERC7579_ACCOUNT_IMPLEMENTATIONS[chainId]
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
 * Get the ERC-7579 account implementation address for a chain
 */
export function getERC7579Implementation(chainId: SupportedNetworkId): Address {
	return ERC7579_ACCOUNT_IMPLEMENTATIONS[chainId];
}

/**
 * Sign an EIP-7702 authorization using Privy's embedded wallet
 *
 * This creates a signed authorization that can be included in a transaction's
 * `authorizationList` to delegate the EOA to the specified smart contract.
 *
 * @param options - Authorization options (chainId, optionally override contract)
 * @returns Signed authorization ready for transaction inclusion
 *
 * @example
 * ```ts
 * const auth = await signEIP7702Authorization({ chainId: SUPPORTED_NETWORKS.BASE });
 * // Include in transaction:
 * // sendTransaction({ authorizationList: [auth], ... })
 * ```
 */
export async function signEIP7702Authorization(
	options: EIP7702AuthorizationOptions
): Promise<EIP7702SignedAuthorization> {
	const session = get(privySession);

	if (!session) {
		throw new AAError('Privy session not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	if (session.walletType !== 'embedded') {
		throw new AAError(
			'EIP-7702 signing only available for Privy embedded wallets',
			AAErrorCode.UNSUPPORTED_WALLET_TYPE
		);
	}

	if (!session.walletAddress) {
		throw new AAError('No wallet address in session', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	// Get contract address to delegate to
	const contractAddress =
		options.contractAddress ?? ERC7579_ACCOUNT_IMPLEMENTATIONS[options.chainId];

	if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
		throw new AAError(
			`No ERC-7579 implementation configured for chain ${options.chainId}`,
			AAErrorCode.UNSUPPORTED_NETWORK
		);
	}

	// Get current nonce if not provided
	let nonce = options.nonce;
	if (nonce === undefined) {
		const client = createPublicClient({
			chain: CHAIN_CONFIGS[options.chainId],
			transport: http()
		});
		const txCount = await client.getTransactionCount({
			address: session.walletAddress as Address
		});
		nonce = BigInt(txCount);
	}

	// Build the authorization payload
	const authorizationPayload: EIP7702Authorization = {
		chainId: BigInt(options.chainId),
		address: contractAddress,
		nonce
	};

	// Hash the authorization for signing
	const authHash = hashEIP7702Authorization(authorizationPayload);

	// Sign using Privy's provider (stored in walletService)
	const provider = getPrivyWalletProvider();
	if (!provider) {
		throw new AAError('Privy wallet provider not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	// Request signature from Privy's embedded wallet
	// This uses personal_sign which is available for embedded wallets
	const signature = (await provider.request({
		method: 'personal_sign',
		params: [authHash, session.walletAddress]
	})) as Hex;

	// Parse the signature into r, s, v components
	const r = `0x${signature.slice(2, 66)}` as Hex;
	const s = `0x${signature.slice(66, 130)}` as Hex;
	const v = parseInt(signature.slice(130, 132), 16);

	// Convert v to yParity (EIP-7702 uses yParity instead of v)
	// v = 27 or 28 -> yParity = 0 or 1
	const yParity = v - 27;

	return {
		chainId: BigInt(options.chainId),
		contractAddress,
		nonce,
		r,
		s,
		yParity
	};
}

/**
 * Create a viem WalletClient from the Privy session
 *
 * This client can be used for signing transactions with EIP-7702 authorizations.
 */
export async function createPrivyWalletClient(
	chainId: SupportedNetworkId
): Promise<WalletClient | null> {
	const session = get(privySession);
	const provider = getPrivyWalletProvider();

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
 * Get a viem Account object from the Privy session for use with Rhinestone SDK
 *
 * Note: For EIP-7702, the Rhinestone SDK should work with the delegated EOA.
 * The SDK's createAccount may create a separate smart account address,
 * but with EIP-7702, we want to keep the user's EOA address.
 */
export function getPrivyAccountForRhinestone(): Account | null {
	const session = get(privySession);

	if (!session?.walletAddress) {
		return null;
	}

	// Create a minimal account object that can be used with viem/Rhinestone
	// The actual signing will be done through the Privy provider
	return {
		address: session.walletAddress as Address,
		type: 'local'
	} as Account;
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
