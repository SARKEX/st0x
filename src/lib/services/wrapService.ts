/**
 * Token Wrap/Unwrap Service (ERC4626)
 *
 * Handles wrapping and unwrapping of tokens using ERC4626 vault contracts.
 * - Wrap: Deposit underlying tokens into vault, receive vault shares
 * - Unwrap: Redeem vault shares, receive underlying tokens
 */
import { get } from 'svelte/store';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { wagmiConfig } from 'svelte-wagmi';
import {
	getWrappingMappingByUnwrappedAddress,
	getWrappingMappingByWrappedAddress
} from '$lib/config/tokenWrapping';
import { sendTransaction } from '$lib/services/walletService';
import { currentNetwork } from '$lib/stores';

function selectedChainId(): number {
	const chainId = get(currentNetwork)?.chainId;
	if (!chainId) throw new Error('No network selected');
	return chainId;
}

// ERC4626 Vault ABI (standard interface)
const ERC4626_ABI = [
	{
		name: 'deposit',
		type: 'function',
		inputs: [
			{ name: 'assets', type: 'uint256' },
			{ name: 'receiver', type: 'address' }
		],
		outputs: [{ name: 'shares', type: 'uint256' }],
		stateMutability: 'nonpayable'
	},
	{
		name: 'redeem',
		type: 'function',
		inputs: [
			{ name: 'shares', type: 'uint256' },
			{ name: 'receiver', type: 'address' },
			{ name: 'owner', type: 'address' }
		],
		outputs: [{ name: 'assets', type: 'uint256' }],
		stateMutability: 'nonpayable'
	},
	{
		name: 'convertToShares',
		type: 'function',
		inputs: [{ name: 'assets', type: 'uint256' }],
		outputs: [{ name: 'shares', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		name: 'convertToAssets',
		type: 'function',
		inputs: [{ name: 'shares', type: 'uint256' }],
		outputs: [{ name: 'assets', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		name: 'previewDeposit',
		type: 'function',
		inputs: [{ name: 'assets', type: 'uint256' }],
		outputs: [{ name: 'shares', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		name: 'previewRedeem',
		type: 'function',
		inputs: [{ name: 'shares', type: 'uint256' }],
		outputs: [{ name: 'assets', type: 'uint256' }],
		stateMutability: 'view'
	}
] as const;

/**
 * Check if an address has sufficient allowance for the vault
 */
async function checkAllowance(
	tokenAddress: Address,
	ownerAddress: Address,
	spenderAddress: Address,
	amount: bigint
): Promise<boolean> {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	const chainId = selectedChainId();

	const allowance = await readContract(config, {
		address: tokenAddress,
		abi: erc20Abi,
		functionName: 'allowance',
		args: [ownerAddress, spenderAddress],
		chainId
	});

	return allowance >= amount;
}

/**
 * Request approval for the vault to spend tokens
 */
async function requestApproval(
	tokenAddress: Address,
	spenderAddress: Address,
	amount: bigint
): Promise<`0x${string}`> {
	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: 'approve',
		args: [spenderAddress, amount]
	});

	const hash = await sendTransaction({
		to: tokenAddress,
		data
	});

	// Wait for approval transaction to be confirmed
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	await waitForTransactionReceipt(config, { hash, chainId: selectedChainId() });

	return hash;
}

/**
 * Get the expected shares for a given asset amount (for wrapping)
 */
export async function previewWrap(
	unwrappedTokenAddress: Address,
	assetAmount: bigint
): Promise<bigint> {
	const mapping = getWrappingMappingByUnwrappedAddress(unwrappedTokenAddress, selectedChainId());
	if (!mapping) throw new Error('No wrapping mapping found for token');

	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	const chainId = selectedChainId();

	return readContract(config, {
		address: mapping.wrappedToken.address as Address,
		abi: ERC4626_ABI,
		functionName: 'previewDeposit',
		args: [assetAmount],
		chainId
	});
}

/**
 * Get the expected assets for a given share amount (for unwrapping)
 */
export async function previewUnwrap(
	wrappedTokenAddress: Address,
	shareAmount: bigint
): Promise<bigint> {
	const mapping = getWrappingMappingByWrappedAddress(wrappedTokenAddress, selectedChainId());
	if (!mapping) throw new Error('No wrapping mapping found for token');

	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	const chainId = selectedChainId();

	return readContract(config, {
		address: wrappedTokenAddress,
		abi: ERC4626_ABI,
		functionName: 'previewRedeem',
		args: [shareAmount],
		chainId
	});
}

/**
 * Wrap underlying tokens into ERC4626 vault shares
 *
 * @param unwrappedTokenAddress - The underlying asset token address
 * @param amount - Amount of underlying tokens to deposit
 * @param receiver - Address to receive the vault shares
 * @returns Transaction hash
 */
export async function wrapToken(
	unwrappedTokenAddress: Address,
	amount: bigint,
	receiver: Address
): Promise<`0x${string}`> {
	const mapping = getWrappingMappingByUnwrappedAddress(unwrappedTokenAddress, selectedChainId());
	if (!mapping) throw new Error('No wrapping mapping found for token');

	const vaultAddress = mapping.wrappedToken.address as Address;

	// 1. Check if approval is needed
	const hasAllowance = await checkAllowance(unwrappedTokenAddress, receiver, vaultAddress, amount);

	// 2. Request approval if needed
	if (!hasAllowance) {
		await requestApproval(unwrappedTokenAddress, vaultAddress, amount);
	}

	// 3. Call deposit on the ERC4626 vault
	const data = encodeFunctionData({
		abi: ERC4626_ABI,
		functionName: 'deposit',
		args: [amount, receiver]
	});

	return sendTransaction({
		to: vaultAddress,
		data
	});
}

/**
 * Unwrap ERC4626 vault shares back to underlying tokens
 *
 * @param wrappedTokenAddress - The vault token address (same as vault contract)
 * @param shares - Amount of vault shares to redeem
 * @param receiver - Address to receive the underlying tokens
 * @param owner - Owner of the shares (usually same as receiver)
 * @returns Transaction hash
 */
export async function unwrapToken(
	wrappedTokenAddress: Address,
	shares: bigint,
	receiver: Address,
	owner: Address
): Promise<`0x${string}`> {
	const mapping = getWrappingMappingByWrappedAddress(wrappedTokenAddress, selectedChainId());
	if (!mapping) throw new Error('No wrapping mapping found for token');

	// No approval needed when redeeming own shares (receiver === owner)
	// The ERC4626 standard allows owners to redeem their own shares without approval

	const data = encodeFunctionData({
		abi: ERC4626_ABI,
		functionName: 'redeem',
		args: [shares, receiver, owner]
	});

	return sendTransaction({
		to: wrappedTokenAddress,
		data
	});
}

/**
 * Convert asset amount to share amount for a given vault
 */
export async function convertToShares(vaultAddress: Address, assetAmount: bigint): Promise<bigint> {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	const chainId = selectedChainId();

	return readContract(config, {
		address: vaultAddress,
		abi: ERC4626_ABI,
		functionName: 'convertToShares',
		args: [assetAmount],
		chainId
	});
}

/**
 * Convert share amount to asset amount for a given vault
 */
export async function convertToAssets(vaultAddress: Address, shareAmount: bigint): Promise<bigint> {
	const config = get(wagmiConfig);
	if (!config) throw new Error('Wagmi config not available');
	const chainId = selectedChainId();

	return readContract(config, {
		address: vaultAddress,
		abi: ERC4626_ABI,
		functionName: 'convertToAssets',
		args: [shareAmount],
		chainId
	});
}
