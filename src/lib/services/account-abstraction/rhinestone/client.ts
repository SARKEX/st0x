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
	type SignedAuthorizationList,
	type WalletClient
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


function safeStringify(value: unknown) {
	return JSON.stringify(
	  value,
	  (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
	  2
	);
  }

  
function isJsonRpcAccount(account: Account): boolean {
	return (account as any)?.type === 'json-rpc';
  }
  
  function isErc20Gas(feeAsset?: string): boolean {
	// Treat any non-empty string other than ETH as ERC20 gas payment intent
	if (!feeAsset) return false;
	return feeAsset.toUpperCase() !== 'ETH';
  }
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
	// Store wallet client for authorization signing (needed for JSON-RPC accounts)
	private walletClientCache: Map<string, WalletClient> = new Map();

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
			// For Dynamic wallets, always pass eoa to enable EIP-7702 support
			// This matches the working implementation pattern
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

			// Check if this is a Dynamic wallet account (has signAuthorization method)
			// Dynamic wallets created with toAccount() will have signAuthorization
			const isDynamicWallet = typeof walletAccount.signAuthorization === 'function' ||
				(walletAccount as any)?.type === 'json-rpc' || 
				(walletAccount as any)?.type === 'local';

			// For EIP-7702 mode, add the accountType and eoa parameter
			// This tells Rhinestone to use EIP-7702 to upgrade the EOA
			// instead of creating a separate smart account
			if (this.config.accountType === '7702') {
				createAccountOptions.accountType = '7702';
				createAccountOptions.eoa = walletAccount;
			} else if (isDynamicWallet) {
				// Always pass eoa for Dynamic wallets (matches working implementation)
				// This ensures proper EIP-7702 authorization signing support
				console.log('[Rhinestone Client] Detected Dynamic wallet, passing eoa for EIP-7702 support');
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
				// Note: isDeployed() may throw if EIP-7702 account already exists (SDK limitation)
				let isDeployed = false;
				try {
					isDeployed = await rhinestoneAccount.isDeployed(targetChain);
					console.log('[Rhinestone Client] Account deployed status:', {
						isDeployed,
						isEOA,
						accountType: this.config.accountType,
						rhinestoneAddress,
						walletAddress: walletAccount.address
					});
				} catch (deployedError) {
					const errorMsg = deployedError instanceof Error ? deployedError.message : String(deployedError);
					// If the error is about existing EIP-7702 accounts not being supported,
					// we can assume the account is already initialized and skip the init signature
					if (errorMsg.includes('Existing EIP-7702 accounts') || errorMsg.includes('ExistingEip7702AccountsNotSupported')) {
						console.warn('[Rhinestone Client] Account appears to be already initialized with EIP-7702 (SDK limitation). Skipping init signature.');
						isDeployed = true; // Treat as deployed to skip init signature
					} else {
						// Re-throw other errors
						throw deployedError;
					}
				}

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
					// IMPORTANT: signAuthorizations should be called with signedTx, not preparedTx
					authorizations = await rhinestoneAccount.signAuthorizations(signedTx);
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
					// IMPORTANT: signAuthorizations should be called with signedTx, not preparedTx
					authorizations = await rhinestoneAccount.signAuthorizations(signedTx);
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

			// Get a quote first to ensure the orchestrator has token configuration/price data
			// This is REQUIRED because the orchestrator needs to know about both tokens
			// before it can prepare the swap transaction. The quote call populates the
			// orchestrator's internal cache with token configs and prices.
			console.log('[Rhinestone Client] Getting quote to populate orchestrator token data...');
			const quote = await this.getSwapQuote({
				sourceChain: params.chainId,
				targetChain: params.chainId,
				sourceToken: params.sourceToken,
				targetToken: params.targetToken,
				amount: params.amount,
				recipient: params.recipient,
				slippageBps: params.slippageBps
			});
			console.log('[Rhinestone Client] Quote obtained successfully, orchestrator has token data');
			
			// Check if quote has expired
			if (Date.now() > quote.expiresAt) {
				throw new AAError('Quote has expired, please try again', AAErrorCode.QUOTE_EXPIRED);
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
				// Check if the account is already deployed/initialized on this chain
				// Note: isDeployed() may throw if EIP-7702 account already exists (SDK limitation)
				let isDeployed = false;
				try {
					isDeployed = await rhinestoneAccount.isDeployed(chain);
					console.log('[Rhinestone Client] Account deployed status:', {
						isDeployed,
						isEOA,
						accountType: this.config.accountType,
						rhinestoneAddress,
						walletAddress: walletAccount.address
					});
				} catch (deployedError) {
					const errorMsg = deployedError instanceof Error ? deployedError.message : String(deployedError);
					// If the error is about existing EIP-7702 accounts not being supported,
					// we can assume the account is already initialized and skip the init signature
					if (errorMsg.includes('Existing EIP-7702 accounts') || errorMsg.includes('ExistingEip7702AccountsNotSupported')) {
						console.warn('[Rhinestone Client] Account appears to be already initialized with EIP-7702 (SDK limitation). Skipping init signature.');
						isDeployed = true; // Treat as deployed to skip init signature
					} else {
						// Re-throw other errors
						throw deployedError;
					}
				}

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
			// Use the quote's outputAmount for the transfer amount
			const transferCall = {
				to: params.targetToken.address as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [params.recipient, quote.outputAmount] // Use quote output amount
				})
			};

			// Build same-chain transaction with tokenRequests
			// This tells Rhinestone to:
			// 1. Pull sourceToken from user
			// 2. Swap it to targetToken via solver network
			// 3. Execute the transfer call
			// 
			// For same-chain swaps, we need to provide sourceAssets to help the orchestrator
			// understand which tokens are available and their configurations
			// Try both symbols and addresses - the orchestrator might need addresses for lookup
			const sourceAssetsTokens: string[] = [];
			
			// Add token addresses (more reliable for orchestrator lookup)
			sourceAssetsTokens.push(params.sourceToken.address);
			if (params.targetToken.address.toLowerCase() !== params.sourceToken.address.toLowerCase()) {
				sourceAssetsTokens.push(params.targetToken.address);
			}
			
			// Also add symbols as fallback (some orchestrator configs might use symbols)
			if (params.sourceToken.symbol) {
				sourceAssetsTokens.push(params.sourceToken.symbol);
			}
			if (params.targetToken.symbol && params.targetToken.symbol !== params.sourceToken.symbol) {
				sourceAssetsTokens.push(params.targetToken.symbol);
			}
			// Also include feeAsset if specified and not already in the list
			if (feeAsset && !sourceAssetsTokens.includes(feeAsset)) {
				sourceAssetsTokens.push(feeAsset);
			}

			const transactionParams: RhinestoneTransactionParams = {
				chain,
				calls: [transferCall],
				tokenRequests: [
					{
						address: params.sourceToken.address as Address,
						amount: params.amount
					}
				],
				// Provide sourceAssets to help orchestrator with token configuration
				// Include both source and target tokens so orchestrator has price/config data
				sourceAssets: sourceAssetsTokens.length > 0 ? { [chain.id]: sourceAssetsTokens } : undefined,
				feeAsset: feeAsset,
				eip7702InitSignature: eip7702InitSignature
			};

			console.log('[Rhinestone Client] Preparing same-chain swap transaction...', {
				chainId: chain.id,
				sourceToken: params.sourceToken.address,
				sourceTokenSymbol: params.sourceToken.symbol,
				targetToken: params.targetToken.address,
				targetTokenSymbol: params.targetToken.symbol,
				amount: params.amount.toString(),
				feeAsset,
				sourceAssets: transactionParams.sourceAssets,
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
					// IMPORTANT: signAuthorizations should be called with signedTx, not preparedTx
					authorizations = await rhinestoneAccount.signAuthorizations(signedTx);
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

			// Check if it's an orchestrator error about missing token config
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('Missing arbitrary token config') || errorMessage.includes('price for swapped token')) {
				// This error suggests the orchestrator doesn't have price/config data for one of the tokens
				// Try to provide more helpful error message
				throw new AAError(
					`Swap failed: The orchestrator doesn't have price or configuration data for one of the tokens in this swap. ` +
					`Source token: ${params.sourceToken.symbol} (${params.sourceToken.address}), ` +
					`Target token: ${params.targetToken.symbol} (${params.targetToken.address}). ` +
					`This might happen with less common tokens. Try using a more common token pair, or contact support.`,
					AAErrorCode.SWAP_FAILED,
					{ 
						originalError: error,
						sourceToken: params.sourceToken,
						targetToken: params.targetToken
					}
				);
			}

			if (error instanceof AAError) throw error;
			throw new AAError(
				`Same-chain swap failed: ${errorMessage}`,
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
		const chain = CHAIN_CONFIG[params.chainId];
	  
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	  
		// Keep polling short + bounded so UI never “stucks”
		const pollForHash = async (
		  account: RhinestoneAccount,
		  txResult: TransactionResult,
		  maxMs = 45_000,
		  intervalMs = 2_500
		): Promise<Hex | undefined> => {
		  const start = Date.now();
		  while (Date.now() - start < maxMs) {
			const st = await account.waitForExecution(txResult);
			const hash =
			  st?.fill?.hash ??
			  st?.claims?.find((c) => c?.hash)?.hash;
	  
			if (hash && hash !== '0x') return hash;
			await sleep(intervalMs);
		  }
		  return undefined;
		};
	  
		try {
		  console.log('[Rhinestone Client] executeSameChainTransaction called', {
			chainId: params.chainId,
			callsCount: params.calls.length,
			feeAsset,
			walletAddress: walletAccount.address
		  });
	  
		  if (!this.config.apiKey) {
			throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
		  }
	  
		  if (!this.isSupportedNetwork(params.chainId)) {
			throw new AAError(`Chain ${params.chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
		  }
	  
		  // Create Rhinestone account (7702)
		  const rhinestoneAccount = await this.createAccount(walletAccount);
		  const rhinestoneAddress = rhinestoneAccount.getAddress();
	  
		  // EIP-7702 init signature (your SDK seems to require it even if already initialized)
		  let eip7702InitSignature: Hex | undefined;
		  if (this.config.accountType === '7702') {
			try {
			  console.log('[Rhinestone Client] Signing EIP-7702 init data for transaction...');
			  eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
			  if (!eip7702InitSignature || eip7702InitSignature === '0x') {
				throw new Error('signEip7702InitData returned empty signature');
			  }
			  console.log('[Rhinestone Client] EIP-7702 init signature obtained successfully');
			} catch (e) {
			  throw new AAError(
				`Failed to sign EIP-7702 initialization: ${e instanceof Error ? e.message : String(e)}`,
				AAErrorCode.AUTHORIZATION_REJECTED,
				{ originalError: e }
			  );
			}
		  }
	  
		  const transactionParams: RhinestoneTransactionParams = {
			chain,
			calls: params.calls.map((c) => ({
			  to: c.to as Address,
			  value: (c.value ?? 0n) as bigint,
			  data: (c.data ?? '0x') as Hex
			})),
			feeAsset,
			// IMPORTANT: sourceAssets should include actual token addresses (not symbols) when using Permit2 routes.
			// If feeAsset is 'USDC', you should pass Base USDC address here (0x8335...).
			sourceAssets: feeAsset ? { [chain.id]: [feeAsset] } : undefined,
			eip7702InitSignature
		  };
	  
		  console.log('[Rhinestone Client] Preparing same-chain transaction...', {
			chainId: chain.id,
			callsCount: transactionParams.calls.length,
			feeAsset,
			hasEip7702Init: Boolean(eip7702InitSignature),
			rhinestoneAddress,
			walletAddress: walletAccount.address
		  });
	  
		  // 3-step flow
		  const preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
		  const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
	  
		  // NOTE: For your current logs, authorizations are always 0; keep that behavior.
		  // If Rhinestone later requires them, you can add it back.
		  const authorizations: SignedAuthorizationList = [];
	  
		  console.log('[Rhinestone Client] Submitting transaction...');
		  const txResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);
	  
		  console.log('[Rhinestone Client] Transaction submitted, waiting for execution...', {
			intentId: txResult.id.toString(),
			targetChain: txResult.targetChain
		  });
	  
		  // First wait
		  const status = await rhinestoneAccount.waitForExecution(txResult);
		  const directHash =
			status?.fill?.hash ??
			status?.claims?.find((c) => c?.hash)?.hash;
	  
		  if (directHash && directHash !== '0x') {
			return { txHash: directHash, intentId: txResult.id.toString() };
		  }
	  
		  console.warn('[Rhinestone Client] No txHash found in execution status. Polling for txHash...', {
			intentId: txResult.id.toString()
		  });
	  
		  // Bounded poll
		  const polledHash = await pollForHash(rhinestoneAccount, txResult, 45_000, 2_500);
		  if (polledHash && polledHash !== '0x') {
			return { txHash: polledHash, intentId: txResult.id.toString() };
		  }
	  
		  // **Key change**: don’t hang; surface a handleable error that includes intentId.
		  throw new AAError(
			`Transaction completed but no hash returned (intentId: ${txResult.id.toString()}). This usually means the backend did not attach the chain tx hash yet.`,
			AAErrorCode.TRANSACTION_FAILED,
			{
			  intentId: txResult.id.toString(),
			  chainId: chain.id,
			  feeAsset,
			  status
			}
		  );
		} catch (error) {
		  console.error('[Rhinestone Client] executeSameChainTransaction failed:', error);
		  if (error instanceof AAError) throw error;
	  
		  throw new AAError(
			`Same-chain transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			AAErrorCode.TRANSACTION_FAILED,
			{ originalError: error }
		  );
		}
	  }
	  
	  

	/**
	 * Manually sign EIP-7702 authorization using Dynamic wallet client
	 * 
	 * This is a workaround for JSON-RPC accounts that don't support viem's signAuthorization.
	 * We use the wallet client's signAuthorization method directly, which works with JSON-RPC accounts.
	 * 
	 * @param walletAccount - The wallet account
	 * @param chain - The chain to authorize
	 * @param accountAddress - The account address (EOA address)
	 * @param preparedTx - The prepared transaction (to extract delegate contract address)
	 * @param walletClient - Optional wallet client (will be fetched if not provided)
	 * @returns Signed authorization list
	 */
	private async manualSignAuthorization(
		walletAccount: Account,
		chain: Chain,
		accountAddress: Address,
		preparedTx: PreparedTransaction,
		walletClient?: WalletClient
	): Promise<SignedAuthorizationList> {
		try {
			// Get wallet client if not provided
			if (!walletClient) {
				// Try to get from cache first
				const cacheKey = `${walletAccount.address}-${chain.id}`;
				walletClient = this.walletClientCache.get(cacheKey);
				
				if (!walletClient) {
					// Try to get the Dynamic wallet client
					const { createDynamicWalletClient } = await import('../wallets/dynamic');
					const fetchedWalletClient = await createDynamicWalletClient(chain.id as SupportedNetworkId);
					
					if (fetchedWalletClient) {
						walletClient = fetchedWalletClient;
						this.walletClientCache.set(cacheKey, walletClient);
					}
				}
			}
			
			if (!walletClient) {
				throw new Error('Failed to get Dynamic wallet client');
			}

			// Get the nonce for the account
			const publicClient = this.createPublicClient(chain.id as SupportedNetworkId);
			const nonce = await publicClient.getTransactionCount({ address: accountAddress });

			// Get delegate contract address from Rhinestone SDK
			// For EIP-7702, the delegate is the smart account implementation
			// We need to create a Rhinestone account to access this information
			let delegateContractAddress: Address | undefined;
			
			try {
				// Create a Rhinestone account to get the delegate address
				const tempRhinestoneAccount = await this.createAccount(walletAccount);
				
				// Try to get transaction messages which might contain delegate information
				const messages = tempRhinestoneAccount.getTransactionMessages(preparedTx);
				
				// The delegate address might be in the messages structure
				// For EIP-7702, it's typically in the authorization data
				if (messages && typeof messages === 'object') {
					// Log messages for debugging
					console.log('[Rhinestone Client] Transaction messages:', safeStringify(messages, (key, value) => 
						typeof value === 'bigint' ? value.toString() : value, 2));
					
					// Try to extract delegate address from messages
					// The structure varies, so we check multiple possible locations
					const messagesStr = safeStringify(messages);
					
					// Look for address-like patterns in the messages
					const addressPattern = /0x[a-fA-F0-9]{40}/g;
					const addresses = messagesStr.match(addressPattern);
					
					if (addresses && addresses.length > 0) {
						// The delegate address is likely one of these addresses
						// For EIP-7702, it should be the smart account implementation
						// We'll try the first non-account address we find
						for (const addr of addresses) {
							if (addr.toLowerCase() !== accountAddress.toLowerCase()) {
								delegateContractAddress = addr as Address;
								console.log('[Rhinestone Client] Found potential delegate address:', delegateContractAddress);
								break;
							}
						}
					}
				}
				
				// If we still don't have it, try to get it from the SDK's account
				// The SDK might expose the implementation address
				if (!delegateContractAddress && (tempRhinestoneAccount as any).implementation) {
					delegateContractAddress = (tempRhinestoneAccount as any).implementation as Address;
					console.log('[Rhinestone Client] Got delegate address from account implementation:', delegateContractAddress);
				}
			} catch (msgError) {
				console.warn('[Rhinestone Client] Could not extract delegate address:', msgError);
			}

			// Use wallet client's signAuthorization method
			// This works with JSON-RPC accounts because the wallet client handles the RPC call
			if (typeof walletClient.signAuthorization === 'function') {
				if (!delegateContractAddress) {
					// If we still don't have the delegate address, we need to throw an error
					// The delegate address is required for EIP-7702 authorization
					throw new Error(
						'Delegate contract address required for EIP-7702 authorization. ' +
						'Could not extract it from Rhinestone SDK. ' +
						'This might be a limitation of the SDK or the account type.'
					);
				}
				
				try {
					console.log('[Rhinestone Client] Using wallet client signAuthorization with delegate:', delegateContractAddress);
					
					const authorization = await walletClient.signAuthorization({
						account: walletAccount,
						contractAddress: delegateContractAddress
					});
					
					console.log('[Rhinestone Client] Authorization signed successfully:', {
						chainId: chain.id,
						delegate: delegateContractAddress,
						nonce: nonce.toString()
					});
					
					// Convert to SignedAuthorizationList format
					// Viem expects number for chainId and nonce, and requires yParity
					const signedAuth = {
						chainId: Number(chain.id),
						address: delegateContractAddress,
						nonce: Number(nonce),
						r: authorization.r,
						s: authorization.s,
						yParity: authorization.yParity ?? (authorization.v !== undefined ? (authorization.v === 0n ? 0 : 1) : 0)
					};
					
					return [signedAuth] as unknown as SignedAuthorizationList;
				} catch (signError) {
					console.error('[Rhinestone Client] Wallet client signAuthorization failed:', signError);
					throw signError;
				}
			} else {
				throw new Error('Wallet client does not support signAuthorization method');
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to manually sign authorization: ${errorMsg}`);
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
