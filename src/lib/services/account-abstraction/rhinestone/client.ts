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
import type { IntentRoute, IntentCost } from '@rhinestone/sdk/dist/src/orchestrator';
import { getOrchestrator } from '@rhinestone/sdk/dist/src/orchestrator';
import {
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	parseSignature,
	recoverTypedDataAddress,
	type Address,
	type Chain,
	type Hex,
	type Account,
	type SignedAuthorizationList
} from 'viem';
import { base, arbitrum, optimism, mainnet, baseSepolia, arbitrumSepolia } from 'viem/chains';
import {
	type RhinestoneConfig,
	type CrossChainSwapParams,
	type CrossChainSwapQuote,
	type OmnichainTransactionParams,
	type SupportedNetworkId,
	type SponsorshipConfig,
	type PaymentToken,
	SUPPORTED_NETWORKS,
	AAError,
	AAErrorCode
} from '../types';
import { getGasOracle } from './gasOracle';
import { env } from '$env/dynamic/public';
import { isDynamicEmbeddedWallet } from '../wallets/dynamic';

// Chain configurations
const CHAIN_CONFIG: Record<SupportedNetworkId, Chain> = {
	[SUPPORTED_NETWORKS.BASE]: base,
	[SUPPORTED_NETWORKS.ARBITRUM]: arbitrum,
	[SUPPORTED_NETWORKS.OPTIMISM]: optimism,
	[SUPPORTED_NETWORKS.ETHEREUM]: mainnet,
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: baseSepolia,
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: arbitrumSepolia
};

// RPC URLs by network
// Import RPC utilities for fallbacks and load balancing
import { createRpcTransport } from '$lib/utils/rpc';

// Type for Rhinestone account transaction params
// Supports both same-chain (chain) and cross-chain (sourceChains/targetChain)
type RhinestoneTransactionParams =
	| {
			// Same-chain transaction format
			chain: Chain;
			calls: Array<{ to: Address; value: bigint; data: Hex }>;
			tokenRequests?: Array<{ address: Address; amount: bigint }>;
			feeAsset?: string;
			sourceAssets?: { [chainId: number]: string[] };
			eip7702InitSignature?: Hex;
	  }
	| {
			// Cross-chain transaction format
			sourceChain?: Chain;
			sourceChains?: Chain[];
			targetChain: Chain;
			calls: Array<{ to: Address; value: bigint; data: Hex }>;
			tokenRequests?: Array<{ address: Address; amount: bigint }>;
			feeAsset?: string;
			sourceAssets?: { [chainId: number]: string[] };
			eip7702InitSignature?: Hex;
	  };

// Type for Rhinestone account (matching SDK types)
interface TransactionResult {
	type: 'intent';
	id: bigint;
	sourceChains?: number[];
	targetChain: number;
}

interface TransactionStatus {
	fill: {
		hash: Hex | undefined;
		chainId: number;
	};
	claims: {
		hash: Hex | undefined;
		chainId: number;
	}[];
}

interface Portfolio {
	chains: Array<{
		chainId: number;
		tokens: Array<{
			address: string;
			symbol: string;
			balance: string;
			decimals: number;
		}>;
	}>;
}

// Prepared transaction type for the 3-step flow
interface PreparedTransaction {
	intentRoute: {
		intentOp: unknown;
	};
	transaction: RhinestoneTransactionParams;
}

// Signed transaction type
interface SignedTransaction {
	intentRoute: {
		intentOp: unknown;
	};
	originSignatures: Hex[];
	destinationSignature: Hex;
	transaction: RhinestoneTransactionParams;
}

interface RhinestoneAccount {
	sendTransaction: (params: RhinestoneTransactionParams) => Promise<TransactionResult>;
	// 3-step transaction flow that properly handles eip7702InitSignature
	prepareTransaction: (params: RhinestoneTransactionParams) => Promise<PreparedTransaction>;
	getTransactionMessages: (preparedTx: PreparedTransaction) => {
		origin: unknown[];
		destination: unknown;
	};
	signTransaction: (preparedTx: PreparedTransaction) => Promise<SignedTransaction>;
	signAuthorizations: (preparedTx: PreparedTransaction) => Promise<SignedAuthorizationList>;
	submitTransaction: (
		signedTx: SignedTransaction,
		authorizations?: SignedAuthorizationList,
		dryRun?: boolean
	) => Promise<TransactionResult>;
	waitForExecution: (
		result: TransactionResult,
		acceptsPreconfirmations?: boolean
	) => Promise<TransactionStatus>;
	getAddress: () => Address;
	getPortfolio: (onTestnets?: boolean) => Promise<Portfolio>;
	signEip7702InitData: () => Promise<Hex>;
	isDeployed: (chain: Chain) => Promise<boolean>;
}

let rhinestoneInstance: RhinestoneClient | null = null;

/**
 * Rhinestone Client Wrapper
 *
 * Provides methods for:
 * - Cross-chain swaps (any token to any token)
 * - Omnichain transactions
 * - Gas sponsorship (native, deposit USDC on Base)
 * - Quote retrieval
 */
export class RhinestoneClient {
	private sdk: RhinestoneSDK;
	private config: RhinestoneConfig;

	constructor(config: RhinestoneConfig) {
		this.config = config;

		// Build SDK configuration
		// Note: Rhinestone has native gas sponsorship - no external paymaster needed
		// Just set sponsored: true in transactions and deposit USDC to your sponsorship wallet
		const sdkConfig: { apiKey: string; provider?: { type: 'alchemy'; apiKey: string } } = {
			apiKey: config.apiKey
		};

		// Add Alchemy provider if configured (for better RPC performance)
		if (config.providerType === 'alchemy' && config.providerApiKey) {
			sdkConfig.provider = { type: 'alchemy', apiKey: config.providerApiKey };
		}

		this.sdk = new RhinestoneSDK(sdkConfig);
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
			console.log('[Rhinestone Client] createAccount called', {
				walletAddress: walletAccount.address,
				accountType: this.config.accountType
			});

			// Build createAccount options based on account type
			const createAccountOptions: {
				owners: { type: 'ecdsa'; accounts: Account[] };
				accountType?: '7702';
				eoa?: Account;
			} = {
				owners: {
					type: 'ecdsa',
					accounts: [walletAccount]
				}
			};

			// For EIP-7702 mode, add the accountType and eoa parameter
			// This tells Rhinestone to use EIP-7702 to upgrade the EOA
			// instead of creating a separate smart account
			if (this.config.accountType === '7702') {
				createAccountOptions.accountType = '7702';
				createAccountOptions.eoa = walletAccount;
			}

			console.log('[Rhinestone Client] Calling SDK createAccount with options:', {
				ownersType: createAccountOptions.owners.type,
				accountType: createAccountOptions.accountType
			});

			// Create the account via Rhinestone SDK
			// For 7702 mode: This upgrades the EOA to act as a smart account
			// For smart mode: This creates a new smart account contract
			const rhinestoneAccount = await this.sdk.createAccount(createAccountOptions);

			console.log('[Rhinestone Client] Account created successfully');
			return rhinestoneAccount as unknown as RhinestoneAccount;
		} catch (error) {
			console.error('[Rhinestone Client] createAccount failed:', error);
			throw new AAError(
				`Failed to create Rhinestone account: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
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
	 * Get a quote for a cross-chain swap using Rhinestone Orchestrator
	 *
	 * Uses the Orchestrator's getIntentRoute endpoint to get real-time quotes
	 * from the solver network. The response includes:
	 * - intentCost: actual costs including fees
	 * - gasPrices: current gas prices per chain
	 * - tokenPrices: current token prices for conversion
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

			const isSameChain = params.sourceChain === params.targetChain;

			// Get the orchestrator instance
			const orchestrator = getOrchestrator(this.config.apiKey);

			try {
				// Build the intent input for the orchestrator
				// We're requesting the target token amount on the destination chain
				const intentInput = {
					account: {
						address: params.recipient,
						accountType: 'EOA' as const,
						setupOps: []
					},
					destinationChainId: params.targetChain,
					destinationExecutions: [], // Empty for pure token transfer
					tokenRequests: [
						{
							tokenAddress: params.targetToken.address,
							amount: params.amount
						}
					],
					// Restrict source to specific chain/token if provided
					accountAccessList: {
						chainTokens: {
							[params.sourceChain]: [params.sourceToken.address]
						}
					},
					options: {
						topupCompact: false
						// Note: settlementLayers should only be specified for cross-chain operations
						// For same-chain swaps, omit this option entirely
					}
				};

				// Get the route from the orchestrator
				const route: IntentRoute = await orchestrator.getIntentRoute(intentInput);
				const intentCost: IntentCost = route.intentCost;

				// Extract cost information from the response
				// tokensReceived contains the actual costs per token
				const tokenReceived = intentCost.tokensReceived?.[0];
				const amountSpent = tokenReceived?.amountSpent
					? BigInt(tokenReceived.amountSpent)
					: params.amount;
				const destinationAmount = tokenReceived?.destinationAmount
					? BigInt(tokenReceived.destinationAmount)
					: params.amount;
				const _fee = tokenReceived?.fee ? BigInt(tokenReceived.fee) : 0n;

				// Extract gas prices from signedMetadata if available
				const gasPrices = route.intentOp?.signedMetadata?.gasPrices || {};
				const sourceChainGasPrice = gasPrices[params.sourceChain.toString()]
					? BigInt(gasPrices[params.sourceChain.toString()])
					: 1000000000n; // Default 1 gwei

				// Estimate gas based on operation complexity
				const baseGasLimit = isSameChain ? 150000n : 500000n;
				const estimatedGasCostWei = baseGasLimit * sourceChainGasPrice;

				// Get USDC price for gas cost conversion (from tokenPrices in metadata)
				const tokenPrices = route.intentOp?.signedMetadata?.tokenPrices || {};
				const ethPrice = tokenPrices['ETH'] || 2500; // Default ETH price
				const usdcDecimals = 6;

				// Convert gas cost from ETH to USDC
				// estimatedGasCostWei is in wei (18 decimals), convert to ETH then to USDC
				const gasCostInEth = Number(estimatedGasCostWei) / 1e18;
				const gasCostInUSDC = BigInt(Math.ceil(gasCostInEth * ethPrice * 10 ** usdcDecimals));

				// Calculate price impact in basis points
				// (inputAmount - outputAmount) / inputAmount * 10000
				const priceImpactBps =
					amountSpent > 0n
						? Number(((amountSpent - destinationAmount) * 10000n) / amountSpent)
						: 10;

				const quote: CrossChainSwapQuote = {
					inputAmount: amountSpent,
					outputAmount: destinationAmount,
					estimatedGas: {
						gasLimit: baseGasLimit,
						maxFeePerGas: sourceChainGasPrice,
						maxPriorityFeePerGas: sourceChainGasPrice / 10n, // 10% of base fee
						estimatedGasCostWei,
						estimatedGasCostUSDC: gasCostInUSDC
					},
					route: {
						steps: [
							{
								type: isSameChain ? 'swap' : 'bridge',
								chainId: params.sourceChain,
								protocol: 'rhinestone-solver',
								tokenIn: params.sourceToken.address,
								tokenOut: params.targetToken.address,
								amountIn: amountSpent,
								amountOut: destinationAmount
							}
						],
						totalSteps: 1,
						estimatedDuration: isSameChain ? 15 : 60
					},
					expiresAt: Date.now() + 60000, // 1 minute expiry
					priceImpactBps: Math.max(priceImpactBps, 0)
				};

				return quote;
			} catch (orchestratorError) {
				// If the orchestrator call fails (e.g., no API key, network issues),
				// fall back to gas oracle for gas prices but estimate swap amounts
				console.warn(
					'Orchestrator quote failed, using gas oracle fallback:',
					orchestratorError instanceof Error ? orchestratorError.message : 'Unknown error'
				);

				// Use gas oracle for real-time gas prices
				const gasOracle = getGasOracle();
				const operationType = isSameChain ? 'swap' : 'bridge';
				const gasLimit = gasOracle.getDefaultGasLimit(operationType);

				// Fetch current gas prices from the source chain
				const gasPrices = await gasOracle.getGasPrice(params.sourceChain);

				// Estimate gas cost
				const estimatedGasCostWei = gasLimit * gasPrices.maxFeePerGas;

				// Convert to USDC (using default ETH price of $2500 as fallback)
				const defaultEthPrice = 2500;
				const estimatedGasCostUSDC = gasOracle.convertToUSDC(estimatedGasCostWei, defaultEthPrice);

				const estimatedDuration = isSameChain ? 15 : 60;

				const quote: CrossChainSwapQuote = {
					inputAmount: params.amount,
					outputAmount: params.amount, // Assume 1:1 for stablecoins in fallback
					estimatedGas: {
						gasLimit,
						maxFeePerGas: gasPrices.maxFeePerGas,
						maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
						estimatedGasCostWei,
						estimatedGasCostUSDC
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
					expiresAt: Date.now() + 60000,
					priceImpactBps: 10 // 0.1% estimated
				};

				return quote;
			}
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
	 *
	 * @param params - Swap parameters
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeCrossChainSwap(
		params: CrossChainSwapParams,
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			// Validate API key is configured
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
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

			// Check if the account needs EIP-7702 initialization
			// The SDK requires this signature for EOA accounts, regardless of accountType
			let eip7702InitSignature: Hex | undefined;
			const rhinestoneAddress = rhinestoneAccount.getAddress();
			const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();

			if (isEOA || this.config.accountType === '7702') {
				// Check if the account is already deployed/initialized on the target chain
				const isDeployed = await rhinestoneAccount.isDeployed(targetChain);
				console.log('[Rhinestone Client] Account deployed status:', {
					isDeployed,
					isEOA,
					accountType: this.config.accountType,
					rhinestoneAddress,
					walletAddress: walletAccount.address
				});

				if (!isDeployed) {
					// Sign the EIP-7702 init data for the first transaction
					// This is REQUIRED for EOA accounts
					console.log(
						'[Rhinestone Client] Signing EIP-7702 init data for first cross-chain transaction...'
					);
					try {
						eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
						console.log('[Rhinestone Client] EIP-7702 init signature obtained');
					} catch (signError) {
						console.error('[Rhinestone Client] Failed to sign EIP-7702 init data:', signError);

						const actualError = signError instanceof Error ? signError.message : String(signError);
						const errorMessage =
							`Failed to sign EIP-7702 initialization: ${actualError}. ` + 'Please try again.';

						throw new AAError(errorMessage, AAErrorCode.AUTHORIZATION_REJECTED, {
							originalError: signError
						});
					}
				}
			}

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
			// feeAsset specifies which token to use for gas payment (e.g., 'USDC')
			const transactionParams: RhinestoneTransactionParams = {
				sourceChain,
				targetChain,
				calls: [transferCall],
				tokenRequests: [
					{
						address: params.sourceToken.address as Address,
						amount: params.amount
					}
				],
				feeAsset: feeAsset,
				eip7702InitSignature: eip7702InitSignature
			};

			console.log('[Rhinestone Client] Preparing cross-chain transaction...');

			// Use 3-step flow that properly handles eip7702InitSignature
			// (sendTransaction has a bug where it doesn't pass through the signature)
			const preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
			console.log('[Rhinestone Client] Transaction prepared, signing...');

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			console.log('[Rhinestone Client] Transaction signed, getting authorizations...');

			// Get EIP-7702 authorizations if needed
			// Note: For JSON-RPC accounts (like Dynamic), signAuthorizations may not be supported
			// The EIP-7702 init signature should be sufficient for the first transaction
			let authorizations: SignedAuthorizationList = [];
			if (this.config.accountType === '7702') {
				try {
					authorizations = await rhinestoneAccount.signAuthorizations(preparedTx);
					console.log('[Rhinestone Client] Authorizations signed:', authorizations.length);
				} catch (authError) {
					// If signAuthorizations fails (e.g., JSON-RPC account not supported),
					// we can proceed without authorizations as the EIP-7702 init signature
					// should be sufficient for the first transaction
					const errorMsg = authError instanceof Error ? authError.message : String(authError);
					if (errorMsg.includes('JSON-RPC') || errorMsg.includes('Account type') || errorMsg.includes('undefined')) {
						console.warn(
							'[Rhinestone Client] signAuthorizations not supported for this account type. ' +
							'Proceeding without authorizations - EIP-7702 init signature should be sufficient.'
						);
						authorizations = [];
					} else {
						// Re-throw other errors
						throw authError;
					}
				}
			}

			console.log('[Rhinestone Client] Submitting transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			// Wait for execution to complete
			const status = await rhinestoneAccount.waitForExecution(transactionResult);

			// Extract tx hash from the fill result
			const txHash = status.fill.hash;
			if (!txHash) {
				throw new AAError(
					'Transaction completed but no hash returned',
					AAErrorCode.TRANSACTION_FAILED
				);
			}

			return {
				txHash,
				intentId: transactionResult.id.toString()
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
	 *
	 * @param params - Transaction parameters
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeOmnichainTransaction(
		params: OmnichainTransactionParams,
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			console.log('[Rhinestone Client] executeOmnichainTransaction called', {
				sourceChain: params.sourceChain,
				targetChain: params.targetChain,
				callsCount: params.calls.length,
				feeAsset,
				walletAddress: walletAccount.address
			});

			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
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
			console.log('[Rhinestone Client] Creating Rhinestone account...');
			const rhinestoneAccount = await this.createAccount(walletAccount);
			console.log('[Rhinestone Client] Account created successfully');

			// Get chain configs
			const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
			const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];

			// Check if the account needs EIP-7702 initialization
			// The SDK requires this signature for EOA accounts, regardless of accountType
			let eip7702InitSignature: Hex | undefined;
			const rhinestoneAddress = rhinestoneAccount.getAddress();
			const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();

			if (isEOA || this.config.accountType === '7702') {
				// Check if the account is already deployed/initialized on the target chain
				const isDeployed = await rhinestoneAccount.isDeployed(targetChain);
				console.log('[Rhinestone Client] Account deployed status:', {
					isDeployed,
					isEOA,
					accountType: this.config.accountType,
					rhinestoneAddress,
					walletAddress: walletAccount.address
				});

				if (!isDeployed) {
					// Sign the EIP-7702 init data for the first transaction
					// This is REQUIRED for EOA accounts
					console.log(
						'[Rhinestone Client] Signing EIP-7702 init data for first omnichain transaction...'
					);
					try {
						eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
						console.log('[Rhinestone Client] EIP-7702 init signature obtained');
					} catch (signError) {
						console.error('[Rhinestone Client] Failed to sign EIP-7702 init data:', signError);

						const actualError = signError instanceof Error ? signError.message : String(signError);
						const errorMessage =
							`Failed to sign EIP-7702 initialization: ${actualError}. ` + 'Please try again.';

						throw new AAError(errorMessage, AAErrorCode.AUTHORIZATION_REJECTED, {
							originalError: signError
						});
					}
				}
			}

			// Build token requests from the params
			const tokenRequests =
				params.tokenRequests?.map((req) => ({
					address: req.token as Address,
					amount: req.amount
				})) || [];

			// Execute cross-chain transaction
			// feeAsset specifies which token to use for gas payment (e.g., 'USDC')
			console.log('[Rhinestone Client] Preparing omnichain transaction...', {
				sourceChainId: sourceChain.id,
				targetChainId: targetChain.id,
				callsCount: params.calls.length,
				tokenRequestsCount: tokenRequests.length,
				feeAsset,
				hasEip7702Init: Boolean(eip7702InitSignature)
			});

			const transactionParams: RhinestoneTransactionParams = {
				sourceChain,
				targetChain,
				calls: params.calls.map((call) => ({
					to: call.to as Address,
					value: call.value || 0n,
					data: call.data as Hex
				})),
				tokenRequests,
				feeAsset: feeAsset,
				eip7702InitSignature: eip7702InitSignature
			};

			// Use 3-step flow that properly handles eip7702InitSignature
			const preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
			console.log('[Rhinestone Client] Transaction prepared, signing...');

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			console.log('[Rhinestone Client] Transaction signed, getting authorizations...');

			// Get EIP-7702 authorizations if needed
			// Note: For JSON-RPC accounts (like Dynamic), signAuthorizations may not be supported
			// The EIP-7702 init signature should be sufficient for the first transaction
			let authorizations: SignedAuthorizationList = [];
			if (this.config.accountType === '7702') {
				try {
					authorizations = await rhinestoneAccount.signAuthorizations(preparedTx);
					console.log('[Rhinestone Client] Authorizations signed:', authorizations.length);
				} catch (authError) {
					// If signAuthorizations fails (e.g., JSON-RPC account not supported),
					// we can proceed without authorizations as the EIP-7702 init signature
					// should be sufficient for the first transaction
					const errorMsg = authError instanceof Error ? authError.message : String(authError);
					if (errorMsg.includes('JSON-RPC') || errorMsg.includes('Account type') || errorMsg.includes('undefined')) {
						console.warn(
							'[Rhinestone Client] signAuthorizations not supported for this account type. ' +
							'Proceeding without authorizations - EIP-7702 init signature should be sufficient.'
						);
						authorizations = [];
					} else {
						// Re-throw other errors
						throw authError;
					}
				}
			}

			console.log('[Rhinestone Client] Submitting transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			console.log('[Rhinestone Client] Transaction submitted, waiting for execution...', {
				intentId: transactionResult.id.toString(),
				targetChain: transactionResult.targetChain
			});

			// Wait for execution
			const status = await rhinestoneAccount.waitForExecution(transactionResult);
			console.log('[Rhinestone Client] Execution complete:', status);

			// Extract tx hash from the fill result
			const txHash = status.fill.hash;
			if (!txHash) {
				throw new AAError(
					'Transaction completed but no hash returned',
					AAErrorCode.TRANSACTION_FAILED
				);
			}

			return {
				txHash,
				intentId: transactionResult.id.toString()
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
	 * Execute a same-chain token swap using Rhinestone's solver network
	 *
	 * This is for swapping tokens on the same chain (e.g., WETH → USDC on Base).
	 * Uses the 'chain' parameter format and tokenRequests to coordinate the swap.
	 *
	 * @param params - Swap parameters including source/target tokens
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeSameChainSwap(
		params: {
			chainId: SupportedNetworkId;
			sourceToken: PaymentToken;
			targetToken: PaymentToken;
			amount: bigint;
			recipient: Address;
			slippageBps?: number;
		},
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			console.log('[Rhinestone Client] executeSameChainSwap called', {
				chainId: params.chainId,
				sourceToken: params.sourceToken.symbol,
				targetToken: params.targetToken.symbol,
				amount: params.amount.toString(),
				feeAsset,
				walletAddress: walletAccount.address
			});

			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			// Validate network
			if (!this.isSupportedNetwork(params.chainId)) {
				throw new AAError(`Chain ${params.chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
			}

			// Create Rhinestone account
			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Get chain config
			const chain = CHAIN_CONFIG[params.chainId];

			// Check if the account needs EIP-7702 initialization
			// The SDK requires this signature for EOA accounts, regardless of accountType
			let eip7702InitSignature: Hex | undefined;
			const rhinestoneAddress = rhinestoneAccount.getAddress();
			const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();

			if (isEOA || this.config.accountType === '7702') {
				const isDeployed = await rhinestoneAccount.isDeployed(chain);
				console.log('[Rhinestone Client] Account deployed status:', {
					isDeployed,
					isEOA,
					accountType: this.config.accountType,
					rhinestoneAddress,
					walletAddress: walletAccount.address
				});

				if (!isDeployed) {
					console.log('[Rhinestone Client] Signing EIP-7702 init data for same-chain swap...');
					try {
						eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
						console.log('[Rhinestone Client] EIP-7702 init signature obtained');
					} catch (signError) {
						console.error('[Rhinestone Client] Failed to sign EIP-7702 init data:', signError);

						const actualError = signError instanceof Error ? signError.message : String(signError);
						const errorMessage =
							`Failed to sign EIP-7702 initialization: ${actualError}. ` + 'Please try again.';

						throw new AAError(errorMessage, AAErrorCode.AUTHORIZATION_REJECTED, {
							originalError: signError
						});
					}
				}
			}

			// Build the transfer call for the target token
			// The solver will handle the swap and then execute this transfer
			const transferCall = {
				to: params.targetToken.address as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [params.recipient, params.amount] // Amount will be adjusted by solver
				})
			};

			// Build same-chain transaction with tokenRequests
			// This tells Rhinestone to:
			// 1. Pull sourceToken from user
			// 2. Swap it to targetToken via solver network
			// 3. Execute the transfer call
			const transactionParams: RhinestoneTransactionParams = {
				chain,
				calls: [transferCall],
				tokenRequests: [
					{
						address: params.sourceToken.address as Address,
						amount: params.amount
					}
				],
				feeAsset: feeAsset,
				eip7702InitSignature: eip7702InitSignature
			};

			console.log('[Rhinestone Client] Preparing same-chain swap transaction...', {
				chainId: chain.id,
				sourceToken: params.sourceToken.address,
				targetToken: params.targetToken.address,
				amount: params.amount.toString(),
				feeAsset,
				hasEip7702Init: Boolean(eip7702InitSignature)
			});

			// Use 3-step flow that properly handles eip7702InitSignature
			// (sendTransaction has a bug where it doesn't pass through the signature)
			const preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
			console.log('[Rhinestone Client] Transaction prepared, signing...');

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			console.log('[Rhinestone Client] Transaction signed, getting authorizations...');

			// Get EIP-7702 authorizations if needed
			// Note: For JSON-RPC accounts (like Dynamic), signAuthorizations may not be supported
			// The EIP-7702 init signature should be sufficient for the first transaction
			let authorizations: SignedAuthorizationList = [];
			if (this.config.accountType === '7702') {
				try {
					authorizations = await rhinestoneAccount.signAuthorizations(preparedTx);
					console.log('[Rhinestone Client] Authorizations signed:', authorizations.length);
				} catch (authError) {
					// If signAuthorizations fails (e.g., JSON-RPC account not supported),
					// we can proceed without authorizations as the EIP-7702 init signature
					// should be sufficient for the first transaction
					const errorMsg = authError instanceof Error ? authError.message : String(authError);
					if (errorMsg.includes('JSON-RPC') || errorMsg.includes('Account type') || errorMsg.includes('undefined')) {
						console.warn(
							'[Rhinestone Client] signAuthorizations not supported for this account type. ' +
							'Proceeding without authorizations - EIP-7702 init signature should be sufficient.'
						);
						authorizations = [];
					} else {
						// Re-throw other errors
						throw authError;
					}
				}
			}

			console.log('[Rhinestone Client] Submitting transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			console.log('[Rhinestone Client] Swap transaction submitted, waiting for execution...', {
				intentId: transactionResult.id.toString()
			});

			// Wait for execution
			const status = await rhinestoneAccount.waitForExecution(transactionResult);
			console.log('[Rhinestone Client] Swap execution complete:', status);

			const txHash = status.fill.hash;
			if (!txHash) {
				throw new AAError('Swap completed but no hash returned', AAErrorCode.TRANSACTION_FAILED);
			}

			return {
				txHash,
				intentId: transactionResult.id.toString()
			};
		} catch (error) {
			console.error('[Rhinestone Client] executeSameChainSwap failed:', error);

			if (error instanceof AAError) throw error;
			throw new AAError(
				`Same-chain swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.SWAP_FAILED,
				{ originalError: error }
			);
		}
	}

	/**
	 * Execute a same-chain transaction with optional ERC20 gas payment
	 *
	 * For same-chain transactions, we use the 'chain' parameter (not sourceChain/targetChain).
	 * This is the correct format per Rhinestone SDK types.
	 *
	 * @param params - Transaction parameters with chainId and calls
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeSameChainTransaction(
		params: {
			chainId: SupportedNetworkId;
			calls: Array<{ to: string; value?: bigint; data?: string }>;
		},
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			console.log('[Rhinestone Client] executeSameChainTransaction called', {
				chainId: params.chainId,
				callsCount: params.calls.length,
				feeAsset,
				walletAddress: walletAccount.address
			});

			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			// Validate network
			if (!this.isSupportedNetwork(params.chainId)) {
				throw new AAError(`Chain ${params.chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
			}

			// Create Rhinestone account
			console.log('[Rhinestone Client] Creating Rhinestone account...');
			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Check what address Rhinestone is using (synchronous call, no chainId param)
			const rhinestoneAddress = rhinestoneAccount.getAddress();
			console.log('[Rhinestone Client] Account created successfully', {
				rhinestoneAddress,
				walletAddress: walletAccount.address,
				addressMatch: rhinestoneAddress === walletAccount.address
			});

			// Check if the account needs EIP-7702 initialization
			// The SDK requires this signature for EOA accounts, regardless of accountType
			// If the Rhinestone account address matches the wallet address, it's an EOA

			// Try to get portfolio to see what balances Rhinestone recognizes
			try {
				const portfolio = await rhinestoneAccount.getPortfolio(false);
				// Use a custom replacer to handle BigInt values
				console.log('[Rhinestone Client] Portfolio:', JSON.stringify(portfolio, (key, value) => 
					typeof value === 'bigint' ? value.toString() : value, 2));
			} catch (portfolioError) {
				console.log('[Rhinestone Client] Could not fetch portfolio:', portfolioError);
			}

			// Get chain config
			const chain = CHAIN_CONFIG[params.chainId];

			let eip7702InitSignature: Hex | undefined;
			const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();

			// Only attempt EIP-7702 signing if account type is '7702'
			// When accountType is 'smart', the account is a smart contract, not an EOA,
			// so signEip7702InitData() is not applicable and may return null
			const shouldAttemptEIP7702 = this.config.accountType === '7702';
			
			if (shouldAttemptEIP7702) {
				console.log('[Rhinestone Client] Checking if account is deployed/initialized on this chain...');
				// Check if the account is already deployed/initialized on this chain
				const isDeployed = await rhinestoneAccount.isDeployed(chain);
				console.log('[Rhinestone Client] Account deployed status:', {
					isDeployed,
					isEOA,
					accountType: this.config.accountType,
					rhinestoneAddress,
					walletAddress: walletAccount.address
				});

				if (!isDeployed) {
					// Sign the EIP-7702 init data for the first transaction
					// This is REQUIRED for EOA accounts in EIP-7702 mode
					console.log('[Rhinestone Client] Signing EIP-7702 init data for first transaction...');
					try {
						eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
						console.log('[Rhinestone Client] EIP-7702 init signature:', eip7702InitSignature);
						
						// Validate that we got a signature
						if (!eip7702InitSignature || eip7702InitSignature === '0x' || eip7702InitSignature === null) {
							const errorMessage =
								'signEip7702InitData returned null. ' +
								'Ensure the account was created with accountType: "7702" and the wallet can sign messages.';
							
							console.error('[Rhinestone Client]', errorMessage);
							throw new Error(errorMessage);
						} else {
							console.log('[Rhinestone Client] EIP-7702 init signature obtained successfully');
						}
					} catch (signError) {
						console.error('[Rhinestone Client] Failed to sign EIP-7702 init data:', signError);

						const actualError = signError instanceof Error ? signError.message : String(signError);
						const errorMessage =
							`Failed to sign EIP-7702 initialization: ${actualError}. ` + 'Please try again.';

						throw new AAError(errorMessage, AAErrorCode.AUTHORIZATION_REJECTED, {
							originalError: signError
						});
					}
				}
			} else if (isEOA && this.config.accountType === 'smart') {
				// For smart accounts that match EOA address, we might still need to check deployment
				// but we won't use EIP-7702 signatures
				console.log(
					'[Rhinestone Client] Smart account detected (not EIP-7702). ' +
					'Checking deployment status...'
				);
				const isDeployed = await rhinestoneAccount.isDeployed(chain);
				console.log('[Rhinestone Client] Smart account deployed status:', isDeployed);
				
				if (!isDeployed) {
					console.warn(
						'[Rhinestone Client] Smart account not deployed. ' +
						'This may cause transaction failures. The account should be deployed first.'
					);
				}
			}

			// Build same-chain transaction with correct format
			// Per SDK types: SameChainTransaction uses 'chain' (not sourceChain/targetChain)
			// We need to specify sourceAssets to tell Rhinestone which tokens are available
			const transactionParams: RhinestoneTransactionParams = {
				chain, // Same-chain uses 'chain' parameter
				calls: params.calls.map((call) => ({
					to: call.to as Address,
					value: call.value || 0n,
					data: (call.data || '0x') as Hex
				})),
				feeAsset: feeAsset,
				sourceAssets: feeAsset ? { [chain.id]: [feeAsset] } : undefined,
				eip7702InitSignature: eip7702InitSignature
			};

			console.log('[Rhinestone Client] Preparing same-chain transaction...', {
				chainId: chain.id,
				callsCount: params.calls.length,
				feeAsset,
				sourceAssets: transactionParams.sourceAssets,
				hasEip7702Init: Boolean(eip7702InitSignature),
				apiKeyConfigured: !!this.config.apiKey
			});

			// Use 3-step flow that properly handles eip7702InitSignature
			let preparedTx: PreparedTransaction;
			try {
				preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
				console.log('[Rhinestone Client] Transaction prepared successfully, signing...');
			} catch (prepareError) {
				console.error('[Rhinestone Client] Failed to prepare transaction:', prepareError);
				
				// Check if it's a network/fetch error
				if (
					prepareError instanceof TypeError && 
					prepareError.message.includes('fetch')
				) {
					const errorMessage = 
						'Network error connecting to Rhinestone API. ' +
						'Please check your internet connection and try again. ' +
						'If the problem persists, the Rhinestone service may be temporarily unavailable.';
					
					throw new AAError(errorMessage, AAErrorCode.RHINESTONE_ERROR, {
						originalError: prepareError,
						isNetworkError: true
					});
				}
				
				// Re-throw other errors
				throw prepareError;
			}

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			console.log('[Rhinestone Client] Transaction signed, getting authorizations...');

			// Get EIP-7702 authorizations if needed
			// Note: For JSON-RPC accounts (like Dynamic), we need to manually sign authorizations
			let authorizations: SignedAuthorizationList = [];
			if (this.config.accountType === '7702') {
				try {
					authorizations = await rhinestoneAccount.signAuthorizations(preparedTx);
					console.log('[Rhinestone Client] Authorizations signed:', authorizations.length);
				} catch (authError) {
					// If signAuthorizations fails (e.g., JSON-RPC account not supported),
					// try to manually construct and sign EIP-7702 authorization
					const errorMsg = authError instanceof Error ? authError.message : String(authError);
					if (errorMsg.includes('JSON-RPC') || errorMsg.includes('Account type') || errorMsg.includes('undefined')) {
						console.warn(
							'[Rhinestone Client] signAuthorizations not supported for this account type. ' +
							'Attempting to manually construct and sign EIP-7702 authorization...'
						);
						
						// Try to manually construct and sign EIP-7702 authorization
						// We need: chainId, contract address, and nonce
						// For EIP-7702, we need to authorize the EOA to act as a smart account on this chain
						// The contract address is the Rhinestone smart account implementation contract
						try {
							// Try to get the authorization contract address
							// For Rhinestone EIP-7702, the contract address might be in the prepared transaction
							// or we might need to get it from the SDK
							const intentRoute = preparedTx.intentRoute;
							console.log('[Rhinestone Client] Inspecting prepared transaction for authorization info...', {
								hasIntentRoute: !!intentRoute,
								hasIntentOp: !!intentRoute?.intentOp,
								intentOpKeys: intentRoute?.intentOp ? Object.keys(intentRoute.intentOp) : []
							});
							
							const intentOp = intentRoute?.intentOp as {
								signedMetadata?: {
									authorizations?: Array<{
										chainId?: number;
										address?: Address;
										contract?: Address;
									}>;
									account?: {
										requiredDelegations?: {
											[chainId: string]: {
												address?: Address;
												contract?: Address;
											};
										};
									};
								};
								[key: string]: unknown;
							} | undefined;
							
							// Check if we can get authorization requirements from the intent op
							const authRequirements = intentOp?.signedMetadata?.account?.requiredDelegations;

							console.log('[Rhinestone Client] Authorization requirements:', authRequirements);
							
							// If we don't have explicit requirements, we need to construct the authorization
							// For same-chain transactions, we need an authorization for the current chain
							const requiredChainId = chain.id;
							
							// Try to get the contract address from requirements, or use a fallback
							let authAddress: Address | undefined;
							let authChainId = requiredChainId;
							
							// authRequirements is an object keyed by chain ID: {8453: {address: ..., contract: ...}}
							if (authRequirements && typeof authRequirements === 'object') {
								const chainReq = authRequirements[requiredChainId.toString()];
								if (chainReq) {
									authAddress = (chainReq.address || chainReq.contract) as Address | undefined;
								}
							}
							
							// If we still don't have an address, we can't proceed
							// The authorization contract address is required for EIP-7702
							if (!authAddress || authAddress === '0x0' || authAddress === '0x0000000000000000000000000000000000000000') {
								throw new AAError(
									'EIP-7702 authorization contract address could not be determined for chain ' + requiredChainId + '. ' +
									'This is required for the transaction but cannot be obtained with this account type. ' +
									'Please try with a different wallet or contact support.',
									AAErrorCode.AUTHORIZATION_REJECTED
								);
							}
							
							if (walletAccount.signTypedData) {
								const signedAuths: Array<{
									address: Address;
									chainId: number;
									nonce: number;
									r: Hex;
									s: Hex;
									v?: number;
									yParity: number;
								}> = [];
								
								// Get the nonce for this authorization (typically 0 for first authorization)
								// We'll use 0 as default, but this might need to be fetched from the contract
								const nonce = 0;
								
								// Construct EIP-7702 authorization typed data
								// EIP-7702 uses a specific typed data structure for authorizations
								// The domain must include the EOA address as verifyingContract to ensure
								// signature recovery matches the EOA address
								const typedData = {
									domain: {
										chainId: authChainId,
										verifyingContract: walletAccount.address
									},
									types: {
										Authorization: [
											{ name: 'chainId', type: 'uint256' },
											{ name: 'address', type: 'address' },
											{ name: 'nonce', type: 'uint256' }
										]
									},
									primaryType: 'Authorization' as const,
									message: {
										chainId: BigInt(authChainId),
										address: authAddress,
										nonce: BigInt(nonce)
									}
								};
								
								console.log('[Rhinestone Client] Signing EIP-7702 authorization:', {
									chainId: authChainId,
									address: authAddress,
									nonce,
									verifyingContract: walletAccount.address
								});
								
								// Sign the typed data
								const sig = await walletAccount.signTypedData(typedData);
								
								// Verify the signature recovers to the correct EOA address
								const recoveredAddress = await recoverTypedDataAddress({
									domain: typedData.domain,
									types: typedData.types,
									primaryType: typedData.primaryType,
									message: typedData.message,
									signature: sig
								});
								
								console.log('[Rhinestone Client] Signature recovery check:', {
									recoveredAddress,
									expectedAddress: walletAccount.address,
									match: recoveredAddress.toLowerCase() === walletAccount.address.toLowerCase()
								});
								
								// If signature doesn't recover to EOA, the typed data structure is wrong
								if (recoveredAddress.toLowerCase() !== walletAccount.address.toLowerCase()) {
									throw new AAError(
										`EIP-7702 authorization signature recovers to ${recoveredAddress} but expected ${walletAccount.address}. ` +
										'The typed data structure may be incorrect.',
										AAErrorCode.AUTHORIZATION_REJECTED
									);
								}
								
								// Parse the signature
								const parsedSig = parseSignature(sig);
								const { r, s, v, yParity } = parsedSig;
								
								signedAuths.push({
									address: authAddress,
									chainId: authChainId,
									nonce,
									r,
									s,
									...(v !== undefined ? { v: Number(v) } : {}),
									yParity
								});
								
								if (signedAuths.length > 0) {
									authorizations = signedAuths as unknown as SignedAuthorizationList;
									console.log('[Rhinestone Client] Manually signed authorizations:', authorizations.length);
								} else {
									throw new AAError(
										'EIP-7702 authorization signing failed. Please try again or contact support.',
										AAErrorCode.AUTHORIZATION_REJECTED
									);
								}
							} else {
								throw new AAError(
									'Wallet account does not support signTypedData, which is required for EIP-7702 authorizations.',
									AAErrorCode.AUTHORIZATION_REJECTED
								);
							}
						} catch (manualSignError) {
							console.error('[Rhinestone Client] Failed to manually sign authorizations:', manualSignError);
							// Re-throw as AAError if it's not already one
							if (manualSignError instanceof AAError) {
								throw manualSignError;
							}
							throw new AAError(
								`Failed to sign EIP-7702 authorizations: ${manualSignError instanceof Error ? manualSignError.message : 'Unknown error'}. ` +
								'Authorizations are required for this transaction.',
								AAErrorCode.AUTHORIZATION_REJECTED,
								{ originalError: manualSignError }
							);
						}
					} else {
						// Re-throw other errors
						throw authError;
					}
				}
			}

			console.log('[Rhinestone Client] Submitting transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			console.log('[Rhinestone Client] Transaction submitted, waiting for execution...', {
				intentId: transactionResult.id.toString(),
				targetChain: transactionResult.targetChain
			});

			// Wait for execution
			const status = await rhinestoneAccount.waitForExecution(transactionResult);
			console.log('[Rhinestone Client] Execution complete:', status);

			// Extract tx hash from the fill result
			const txHash = status.fill.hash;
			if (!txHash) {
				throw new AAError(
					'Transaction completed but no hash returned',
					AAErrorCode.TRANSACTION_FAILED
				);
			}

			return {
				txHash,
				intentId: transactionResult.id.toString()
			};
		} catch (error) {
			console.error('[Rhinestone Client] executeSameChainTransaction failed:', error);

			// Log additional context for orchestrator errors
			const orchestratorError = error as {
				context?: unknown;
				errorType?: string;
				traceId?: string;
			};
			if (orchestratorError.context) {
				console.error(
					'[Rhinestone Client] Error context:',
					JSON.stringify(orchestratorError.context, null, 2)
				);
			}
			if (orchestratorError.errorType) {
				console.error('[Rhinestone Client] Error type:', orchestratorError.errorType);
			}
			if (orchestratorError.traceId) {
				console.error('[Rhinestone Client] Trace ID:', orchestratorError.traceId);
			}

			if (error instanceof AAError) throw error;
			throw new AAError(
				`Same-chain transaction failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
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
			transport: createRpcTransport(chainId)
		});
	}

	/**
	 * Get the underlying SDK instance for advanced usage
	 */
	getSDK(): RhinestoneSDK {
		return this.sdk;
	}

	/**
	 * Check if gas sponsorship is enabled
	 */
	isSponsorshipEnabled(): boolean {
		return this.config.sponsorship?.enabled ?? false;
	}

	/**
	 * Get sponsorship configuration
	 */
	getSponsorshipConfig(): SponsorshipConfig | undefined {
		return this.config.sponsorship;
	}
}

/**
 * Get or create the Rhinestone client singleton
 *
 * Account Type Selection:
 * - Default: Uses EIP-7702 mode for all wallets (preserves EOA address)
 * - Can be overridden with PUBLIC_RHINESTONE_ACCOUNT_TYPE env var ('7702' or 'smart')
 *
 * Gas Sponsorship (native to Rhinestone):
 * 1. Get your deposit wallet from Rhinestone Dashboard
 * 2. Deposit USDC on Base to that wallet
 * 3. Set PUBLIC_RHINESTONE_SPONSORSHIP_ENABLED=true
 * 4. Transactions will use your sponsorship balance
 */
export function getRhinestoneClient(): RhinestoneClient {
	if (!rhinestoneInstance) {
		const apiKey = env.PUBLIC_RHINESTONE_API_KEY;

		if (!apiKey) {
			console.warn('Rhinestone API key not configured. Cross-chain features will be limited.');
		}

		// Rhinestone native sponsorship - deposit USDC on Base to your sponsorship wallet
		const sponsorship: SponsorshipConfig | undefined =
			env.PUBLIC_RHINESTONE_SPONSORSHIP_ENABLED === 'true' ? { enabled: true } : undefined;

		// Determine account type based on wallet
		// Dynamic embedded wallets support EIP-7702 mode, which preserves the EOA address
		// External wallets (WalletConnect, injected) can also use EIP-7702 to preserve EOA address
		let accountType: '7702' | 'smart';

		if (env.PUBLIC_RHINESTONE_ACCOUNT_TYPE) {
			// Use explicitly configured type if set
			accountType = env.PUBLIC_RHINESTONE_ACCOUNT_TYPE as '7702' | 'smart';
		} else {
			// Auto-detect based on wallet type
			const isEmbedded = isDynamicEmbeddedWallet();

			// Use '7702' for both embedded and external wallets to preserve EOA address
			// This enables EIP-7702 Smart EOAs which upgrade the EOA without migration
			accountType = '7702';

			console.log('[Rhinestone Client] Auto-selected account type:', accountType, { isEmbedded });
		}

		rhinestoneInstance = new RhinestoneClient({
			apiKey: apiKey || '',
			providerType: env.PUBLIC_ALCHEMY_API_KEY ? 'alchemy' : 'public',
			providerApiKey: env.PUBLIC_ALCHEMY_API_KEY,
			sponsorship,
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
