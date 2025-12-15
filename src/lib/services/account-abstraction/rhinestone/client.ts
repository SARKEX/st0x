/**
 * Rhinestone SDK Client
 *
 * Wrapper around the Rhinestone SDK for cross-chain transactions, swaps,
 * and gas sponsorship. Rhinestone provides unified chain abstraction.
 */

import { RhinestoneSDK } from '@rhinestone/sdk';
import { createPublicClient, http, type Address, type Chain } from 'viem';
import { base, arbitrum, mainnet, baseSepolia, arbitrumSepolia } from 'viem/chains';
import {
	type RhinestoneConfig,
	type CrossChainSwapParams,
	type CrossChainSwapQuote,
	type OmnichainTransactionParams,
	type SupportedNetworkId,
	type PaymasterConfig,
	SUPPORTED_NETWORKS,
	AAError,
	AAErrorCode
} from '../types';
import { env } from '$env/dynamic/public';

// Chain configurations
const CHAIN_CONFIG: Record<SupportedNetworkId, Chain> = {
	[SUPPORTED_NETWORKS.BASE]: base,
	[SUPPORTED_NETWORKS.ARBITRUM]: arbitrum,
	[SUPPORTED_NETWORKS.ETHEREUM]: mainnet,
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: baseSepolia,
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: arbitrumSepolia
};

// RPC URLs by network
const RPC_URLS: Record<SupportedNetworkId, string> = {
	[SUPPORTED_NETWORKS.BASE]: 'https://mainnet.base.org',
	[SUPPORTED_NETWORKS.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
	[SUPPORTED_NETWORKS.ETHEREUM]: 'https://eth.llamarpc.com',
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: 'https://sepolia.base.org',
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: 'https://sepolia-rollup.arbitrum.io/rpc'
};

let rhinestoneInstance: RhinestoneClient | null = null;

/**
 * Rhinestone Client Wrapper
 *
 * Provides methods for:
 * - Cross-chain swaps (any token to any token)
 * - Omnichain transactions
 * - Gas sponsorship via built-in paymaster
 * - Quote retrieval
 */
export class RhinestoneClient {
	private sdk: RhinestoneSDK;
	private config: RhinestoneConfig;

	constructor(config: RhinestoneConfig) {
		this.config = config;

		// Build SDK configuration based on what's provided
		if (config.paymasterConfig?.apiKey && (config.paymasterConfig.type === 'pimlico' || config.paymasterConfig.type === 'biconomy')) {
			// With paymaster
			if (config.providerType === 'alchemy' && config.providerApiKey) {
				this.sdk = new RhinestoneSDK({
					apiKey: config.apiKey,
					provider: { type: 'alchemy', apiKey: config.providerApiKey },
					paymaster: { type: config.paymasterConfig.type, apiKey: config.paymasterConfig.apiKey }
				});
			} else {
				this.sdk = new RhinestoneSDK({
					apiKey: config.apiKey,
					paymaster: { type: config.paymasterConfig.type, apiKey: config.paymasterConfig.apiKey }
				});
			}
		} else {
			// Without paymaster
			if (config.providerType === 'alchemy' && config.providerApiKey) {
				this.sdk = new RhinestoneSDK({
					apiKey: config.apiKey,
					provider: { type: 'alchemy', apiKey: config.providerApiKey }
				});
			} else {
				this.sdk = new RhinestoneSDK({
					apiKey: config.apiKey
				});
			}
		}
	}

	/**
	 * Get a quote for a cross-chain swap
	 */
	async getSwapQuote(params: CrossChainSwapParams): Promise<CrossChainSwapQuote> {
		try {
			// Validate networks are supported
			if (!this.isSupportedNetwork(params.sourceChain)) {
				throw new AAError(
					`Source chain ${params.sourceChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}
			if (!this.isSupportedNetwork(params.targetChain)) {
				throw new AAError(
					`Target chain ${params.targetChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}

			// TODO: Implement actual SDK quote retrieval
			// The Rhinestone SDK provides methods for getting quotes:
			// const quote = await this.sdk.getQuote({
			//   sourceChain: params.sourceChain,
			//   targetChain: params.targetChain,
			//   tokenIn: params.sourceToken.address,
			//   tokenOut: params.targetToken.address,
			//   amount: params.amount,
			// });

			// For now, return a mock quote structure
			const quote: CrossChainSwapQuote = {
				inputAmount: params.amount,
				outputAmount: params.amount, // Will be calculated by SDK
				estimatedGas: {
					gasLimit: 500000n,
					maxFeePerGas: 1000000000n, // 1 gwei
					maxPriorityFeePerGas: 100000000n, // 0.1 gwei
					estimatedGasCostWei: 500000000000000n, // 0.0005 ETH
					estimatedGasCostUSDC: 1500000n // ~$1.50 in USDC (6 decimals)
				},
				route: {
					steps: [
						{
							type: 'swap',
							chainId: params.sourceChain,
							protocol: 'rhinestone-solver',
							tokenIn: params.sourceToken.address,
							tokenOut: params.targetToken.address,
							amountIn: params.amount,
							amountOut: params.amount
						}
					],
					totalSteps: 1,
					estimatedDuration: 60 // 60 seconds for cross-chain
				},
				expiresAt: Date.now() + 60000, // 1 minute expiry
				priceImpactBps: 10 // 0.1% price impact
			};

			return quote;
		} catch (error) {
			if (error instanceof AAError) throw error;
			throw new AAError(
				`Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.RHINESTONE_ERROR,
				{ originalError: error }
			);
		}
	}

	/**
	 * Execute a cross-chain swap using Rhinestone's solver network
	 */
	async executeCrossChainSwap(
		params: CrossChainSwapParams,
		signer: {
			signMessage: (message: string) => Promise<string>;
			signTypedData: (data: unknown) => Promise<string>;
			sendTransaction: (tx: { to: Address; data: `0x${string}`; value?: bigint }) => Promise<`0x${string}`>;
		}
	): Promise<{ txHash: `0x${string}`; intentId: string }> {
		try {
			// Get a fresh quote
			const quote = await this.getSwapQuote(params);

			// Check if quote has expired
			if (Date.now() > quote.expiresAt) {
				throw new AAError('Quote has expired', AAErrorCode.QUOTE_EXPIRED);
			}

			// TODO: Implement actual SDK swap execution
			// Example from Rhinestone docs:
			// const rhinestoneAccount = await this.sdk.createAccount({
			//   owners: [{ type: 'ecdsa', address: walletAddress }]
			// });
			//
			// const result = await rhinestoneAccount.sendTransaction({
			//   sourceChain: params.sourceChain,
			//   targetChain: params.targetChain,
			//   calls: [...],
			//   tokenRequests: [{ token: params.sourceToken.address, amount: params.amount, chainId: params.sourceChain }]
			// });

			throw new AAError(
				'Cross-chain swap execution requires Rhinestone API key configuration',
				AAErrorCode.RHINESTONE_ERROR,
				{ params }
			);
		} catch (error) {
			if (error instanceof AAError) throw error;
			throw new AAError(
				`Cross-chain swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.SWAP_FAILED,
				{ originalError: error }
			);
		}
	}

	/**
	 * Execute an omnichain transaction
	 */
	async executeOmnichainTransaction(
		params: OmnichainTransactionParams,
		signer: {
			signMessage: (message: string) => Promise<string>;
			signTypedData: (data: unknown) => Promise<string>;
			sendTransaction: (tx: { to: Address; data: `0x${string}`; value?: bigint }) => Promise<`0x${string}`>;
		}
	): Promise<{ txHash: `0x${string}`; intentId: string }> {
		try {
			// Validate networks
			if (!this.isSupportedNetwork(params.sourceChain)) {
				throw new AAError(
					`Source chain ${params.sourceChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}
			if (!this.isSupportedNetwork(params.targetChain)) {
				throw new AAError(
					`Target chain ${params.targetChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}

			// TODO: Implement actual SDK transaction execution
			throw new AAError(
				'Omnichain transaction execution requires Rhinestone API key configuration',
				AAErrorCode.RHINESTONE_ERROR,
				{ params }
			);
		} catch (error) {
			if (error instanceof AAError) throw error;
			throw new AAError(
				`Omnichain transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.TRANSACTION_FAILED,
				{ originalError: error }
			);
		}
	}

	/**
	 * Check if a network is supported
	 */
	isSupportedNetwork(chainId: number): chainId is SupportedNetworkId {
		return Object.values(SUPPORTED_NETWORKS).includes(chainId as SupportedNetworkId);
	}

	/**
	 * Get chain configuration
	 */
	getChain(chainId: SupportedNetworkId): Chain {
		return CHAIN_CONFIG[chainId];
	}

	/**
	 * Create a public client for a specific chain
	 */
	createPublicClient(chainId: SupportedNetworkId) {
		return createPublicClient({
			chain: CHAIN_CONFIG[chainId],
			transport: http(RPC_URLS[chainId])
		});
	}

	/**
	 * Get the underlying SDK instance for advanced usage
	 */
	getSDK(): RhinestoneSDK {
		return this.sdk;
	}

	/**
	 * Check if paymaster/gas sponsorship is configured
	 */
	hasPaymasterConfig(): boolean {
		return Boolean(this.config.paymasterConfig);
	}

	/**
	 * Get paymaster configuration
	 */
	getPaymasterConfig(): PaymasterConfig | undefined {
		return this.config.paymasterConfig;
	}
}

/**
 * Get or create the Rhinestone client singleton
 */
export function getRhinestoneClient(): RhinestoneClient {
	if (!rhinestoneInstance) {
		const apiKey = env.PUBLIC_RHINESTONE_API_KEY;

		if (!apiKey) {
			console.warn('Rhinestone API key not configured. Cross-chain features will be limited.');
		}

		// Build paymaster config if Pimlico key is available
		let paymasterConfig: PaymasterConfig | undefined;
		if (env.PUBLIC_PIMLICO_API_KEY) {
			paymasterConfig = {
				type: 'pimlico',
				apiKey: env.PUBLIC_PIMLICO_API_KEY
			};
		}

		rhinestoneInstance = new RhinestoneClient({
			apiKey: apiKey || '',
			providerType: env.PUBLIC_ALCHEMY_API_KEY ? 'alchemy' : 'public',
			providerApiKey: env.PUBLIC_ALCHEMY_API_KEY,
			paymasterConfig
		});
	}

	return rhinestoneInstance;
}

/**
 * Check if Rhinestone is properly configured
 */
export function isRhinestoneConfigured(): boolean {
	return Boolean(env.PUBLIC_RHINESTONE_API_KEY);
}
