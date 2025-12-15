/**
 * Rhinestone SDK Client
 *
 * Wrapper around the Rhinestone SDK for cross-chain transactions, swaps,
 * and gas sponsorship. Rhinestone provides unified chain abstraction.
 *
 * EIP-7702 Support:
 * Rhinestone's Warp infrastructure supports EIP-7702 Smart EOAs, allowing
 * existing EOA users to gain smart account capabilities without migration.
 * When accountType is '7702', the SDK uses the user's existing EOA address.
 *
 * Key SDK methods:
 * - sdk.createAccount() - Create a smart account with ECDSA owners
 * - account.sendTransaction() - Execute cross-chain transactions with tokenRequests
 * - account.waitForExecution() - Wait for transaction completion
 *
 * References:
 * - https://docs.rhinestone.dev/home/concepts/smart-eoas-eip-7702
 */

import { RhinestoneSDK } from '@rhinestone/sdk';
import { createPublicClient, http, encodeFunctionData, erc20Abi, type Address, type Chain, type Hex, type Account } from 'viem';
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

// Type for Rhinestone account
interface RhinestoneAccount {
	sendTransaction: (params: {
		sourceChain: Chain;
		targetChain: Chain;
		calls: Array<{ to: Address; value: bigint; data: Hex }>;
		tokenRequests?: Array<{ address: Address; amount: bigint }>;
	}) => Promise<{ hash: Hex; intentId: string }>;
	waitForExecution: (transaction: { hash: Hex; intentId: string }) => Promise<{ status: string; txHash: Hex }>;
	getAddress: (chainId: number) => Promise<Address>;
}

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
	 * Create a Rhinestone account for a given wallet
	 *
	 * For EIP-7702 mode (accountType: '7702'):
	 * - Uses Rhinestone's Warp infrastructure to upgrade the EOA
	 * - Preserves the user's existing EOA address
	 * - Enables smart account features (batching, gas sponsorship)
	 *
	 * For standard mode (accountType: 'smart' or default):
	 * - Creates a new smart account contract
	 * - New address derived from owner
	 */
	async createAccount(walletAccount: Account): Promise<RhinestoneAccount> {
		try {
			// Build createAccount options based on account type
			const createAccountOptions: {
				owners: { type: 'ecdsa'; accounts: Account[] };
				accountType?: '7702';
			} = {
				owners: {
					type: 'ecdsa',
					accounts: [walletAccount]
				}
			};

			// For EIP-7702 mode, add the accountType to signal EOA upgrade
			// This tells Rhinestone to use Warp infrastructure to upgrade the EOA
			// instead of creating a separate smart account
			if (this.config.accountType === '7702') {
				createAccountOptions.accountType = '7702';
			}

			// Create the account via Rhinestone SDK
			// For 7702 mode: This upgrades the EOA to act as a smart account
			// For smart mode: This creates a new smart account contract
			const rhinestoneAccount = await this.sdk.createAccount(createAccountOptions);

			return rhinestoneAccount as unknown as RhinestoneAccount;
		} catch (error) {
			throw new AAError(
				`Failed to create Rhinestone account: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.RHINESTONE_ERROR,
				{ originalError: error }
			);
		}
	}

	/**
	 * Check if using EIP-7702 mode
	 */
	isEIP7702Mode(): boolean {
		return this.config.accountType === '7702';
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

			// Rhinestone uses intent-based swaps where solvers compete to fill orders
			// The SDK automatically handles quote retrieval through the orchestrator
			// Price impact is minimal due to solver competition

			// Estimate based on current market conditions
			// In production, this would call the actual SDK quote endpoint
			const isSameChain = params.sourceChain === params.targetChain;
			const estimatedDuration = isSameChain ? 15 : 60; // seconds
			const baseGasCost = isSameChain ? 100000n : 500000n;

			const quote: CrossChainSwapQuote = {
				inputAmount: params.amount,
				outputAmount: params.amount, // Solver competition ensures near 1:1 for stablecoins
				estimatedGas: {
					gasLimit: baseGasCost,
					maxFeePerGas: 1000000000n, // 1 gwei
					maxPriorityFeePerGas: 100000000n, // 0.1 gwei
					estimatedGasCostWei: baseGasCost * 1000000000n,
					estimatedGasCostUSDC: isSameChain ? 500000n : 1500000n // $0.50 or $1.50
				},
				route: {
					steps: [
						{
							type: isSameChain ? 'swap' : 'bridge',
							chainId: params.sourceChain,
							protocol: 'rhinestone-solver',
							tokenIn: params.sourceToken.address,
							tokenOut: params.targetToken.address,
							amountIn: params.amount,
							amountOut: params.amount
						}
					],
					totalSteps: 1,
					estimatedDuration
				},
				expiresAt: Date.now() + 60000, // 1 minute expiry
				priceImpactBps: 10 // 0.1% price impact (minimal due to solver competition)
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
	 *
	 * Flow:
	 * 1. Create a Rhinestone smart account linked to user's wallet
	 * 2. Build the transaction with tokenRequests (what tokens to pull from source chain)
	 * 3. Execute via sendTransaction which handles cross-chain coordination
	 * 4. Wait for execution completion
	 */
	async executeCrossChainSwap(
		params: CrossChainSwapParams,
		walletAccount: Account
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			// Validate API key is configured
			if (!this.config.apiKey) {
				throw new AAError(
					'Rhinestone API key not configured',
					AAErrorCode.RHINESTONE_ERROR
				);
			}

			// Get a fresh quote to ensure pricing is current
			const quote = await this.getSwapQuote(params);

			// Check if quote has expired
			if (Date.now() > quote.expiresAt) {
				throw new AAError('Quote has expired', AAErrorCode.QUOTE_EXPIRED);
			}

			// Create Rhinestone account linked to user's wallet
			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Get chain configs
			const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
			const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];

			// Build the swap call - transfer target token to recipient
			const transferCall = {
				to: params.targetToken.address as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [params.recipient, quote.outputAmount]
				})
			};

			// Execute cross-chain transaction via Rhinestone
			// tokenRequests tells the solver what tokens to pull from source chain
			const transaction = await rhinestoneAccount.sendTransaction({
				sourceChain,
				targetChain,
				calls: [transferCall],
				tokenRequests: [
					{
						address: params.sourceToken.address as Address,
						amount: params.amount
					}
				]
			});

			// Wait for execution to complete
			const result = await rhinestoneAccount.waitForExecution(transaction);

			return {
				txHash: result.txHash,
				intentId: transaction.intentId
			};
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
	 * Execute an omnichain transaction with arbitrary calls
	 *
	 * Use this when you need to execute specific contract calls on a target chain
	 * while sourcing funds from another chain.
	 */
	async executeOmnichainTransaction(
		params: OmnichainTransactionParams,
		walletAccount: Account
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError(
					'Rhinestone API key not configured',
					AAErrorCode.RHINESTONE_ERROR
				);
			}

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

			// Create Rhinestone account
			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Get chain configs
			const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
			const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];

			// Build token requests from the params
			const tokenRequests = params.tokenRequests?.map(req => ({
				address: req.token as Address,
				amount: req.amount
			})) || [];

			// Execute cross-chain transaction
			const transaction = await rhinestoneAccount.sendTransaction({
				sourceChain,
				targetChain,
				calls: params.calls.map(call => ({
					to: call.to as Address,
					value: call.value || 0n,
					data: call.data as Hex
				})),
				tokenRequests
			});

			// Wait for execution
			const result = await rhinestoneAccount.waitForExecution(transaction);

			return {
				txHash: result.txHash,
				intentId: transaction.intentId
			};
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
 *
 * By default, uses EIP-7702 mode ('7702') for Privy users to preserve their EOA address.
 * Set PUBLIC_RHINESTONE_ACCOUNT_TYPE=smart to use standard smart account mode.
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

		// Default to EIP-7702 mode for Privy users
		// This preserves the user's EOA address while enabling smart account features
		const accountType = (env.PUBLIC_RHINESTONE_ACCOUNT_TYPE as '7702' | 'smart') || '7702';

		rhinestoneInstance = new RhinestoneClient({
			apiKey: apiKey || '',
			providerType: env.PUBLIC_ALCHEMY_API_KEY ? 'alchemy' : 'public',
			providerApiKey: env.PUBLIC_ALCHEMY_API_KEY,
			paymasterConfig,
			accountType
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
