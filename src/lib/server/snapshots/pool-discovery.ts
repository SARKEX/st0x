// Pool Discovery Module
// Used by the daily cron to discover V2/V3 pools via RPC
// This is separate from lp-attribution.ts which only uses the cached pool list

import { createPublicClient, http, fallback, type Address } from 'viem';
import { base } from 'viem/chains';

// Base RPC URLs with fallbacks
const BASE_RPC_URLS = [
	'https://mainnet.base.org',
	'https://base-rpc.publicnode.com',
	'https://base.llamarpc.com',
	'https://base.meowrpc.com',
	'https://base-mainnet.public.blastapi.io',
	'https://gateway.tenderly.co/public/base'
];

// Known AMM factory addresses on Base
const V2_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da'.toLowerCase();
const V3_FACTORY = '0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a'.toLowerCase();

// Pool type result
export type PoolType = null | 'v2' | 'v3' | 'unknown';

// ABIs for contract calls
const factoryAbi = [
	{
		inputs: [],
		name: 'factory',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

const v2PoolAbi = [
	{
		inputs: [],
		name: 'totalSupply',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token0',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token1',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'getReserves',
		outputs: [
			{ type: 'uint112', name: 'reserve0' },
			{ type: 'uint112', name: 'reserve1' },
			{ type: 'uint32', name: 'blockTimestampLast' }
		],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

const v3PoolAbi = [
	{
		inputs: [],
		name: 'token0',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'token1',
		outputs: [{ type: 'address' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'fee',
		outputs: [{ type: 'uint24' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'liquidity',
		outputs: [{ type: 'uint128' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

// Create public client for Base with fallback RPCs
function getPublicClient() {
	return createPublicClient({
		chain: base,
		transport: fallback(
			BASE_RPC_URLS.map((url) => http(url)),
			{ rank: true }
		)
	});
}

/**
 * Check if an address is a V2 or V3 pool via RPC
 * Used for pool discovery (not rewards calculation)
 */
export async function getPoolType(address: string, blockNumber?: bigint): Promise<PoolType> {
	const addressLower = address.toLowerCase();
	const client = getPublicClient();

	try {
		// Check if it has code
		const code = await client.getCode({
			address: address as Address,
			blockNumber
		});

		const hasCode = code !== undefined && code !== null && code !== '0x' && code.length > 2;
		const isEIP7702 = hasCode && code.toLowerCase().startsWith('0xef0100');

		if (!hasCode || isEIP7702) {
			return null; // EOA
		}

		// Try to get factory address
		try {
			const factoryAddress = await client.readContract({
				address: address as Address,
				abi: factoryAbi,
				functionName: 'factory',
				blockNumber
			});

			const factoryLower = (factoryAddress as string).toLowerCase();
			if (factoryLower === V2_FACTORY) {
				return 'v2';
			} else if (factoryLower === V3_FACTORY) {
				return 'v3';
			}
		} catch {
			// No factory method
		}

		// Fallback: probe for V2/V3 pool interfaces
		try {
			await Promise.all([
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'token0',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'token1',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'getReserves',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v2PoolAbi,
					functionName: 'totalSupply',
					blockNumber
				})
			]);
			return 'v2';
		} catch {
			// Not V2
		}

		try {
			await Promise.all([
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'token0',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'token1',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'fee',
					blockNumber
				}),
				client.readContract({
					address: address as Address,
					abi: v3PoolAbi,
					functionName: 'liquidity',
					blockNumber
				})
			]);
			return 'v3';
		} catch {
			// Not V3
		}

		return 'unknown';
	} catch {
		return null;
	}
}
