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
import { PAYMENT_TOKENS_BY_NETWORK } from '$lib/config/tokens';

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

/**
 * Get token address by symbol and chain from PAYMENT_TOKENS_BY_NETWORK
 * This uses the single source of truth for token addresses.
 */
function resolveTokenAddress(symbol: string, chainId: number): `0x${string}` | undefined {
	const tokens = PAYMENT_TOKENS_BY_NETWORK[chainId];
	if (!tokens) return undefined;
	
	const s = symbol.toUpperCase();
	const token = tokens.find(t => t.symbol?.toUpperCase() === s);
	return token?.address as `0x${string}` | undefined;
}
  


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
	// ✅ DROP-IN REPLACEMENT #1: getSwapQuote
// Fixes: you were requesting the *target token* with params.amount (wrong) and you were using destination tokenRequests
// For ETH->Base, tokenRequests MUST describe what you are paying on SOURCE chain (sourceToken + amount).
async getSwapQuote(
	params: CrossChainSwapParams,
	feeAsset?: string
  ): Promise<CrossChainSwapQuote> {
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
  
	  // --- native ETH -> WETH normalization for quoting ---
	  const MAINNET_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
	  const BASE_WETH = '0x4200000000000000000000000000000000000006' as const;
  
	  const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
	  const isZeroAddr = (v?: string) =>
		(v ?? '').toLowerCase() === '0x0000000000000000000000000000000000000000';
  
	  const normalizeEthToWeth = (token: { symbol?: string; address: string }, chainId: number) => {
		const sym = (token.symbol ?? '').toUpperCase();
		if ((sym === 'ETH' || sym === 'NATIVE' || isZeroAddr(token.address)) && chainId === 1) {
		  return { ...token, symbol: 'WETH', address: MAINNET_WETH as `0x${string}` };
		}
		if ((sym === 'ETH' || sym === 'NATIVE' || isZeroAddr(token.address)) && chainId === 8453) {
		  return { ...token, symbol: 'WETH', address: BASE_WETH as `0x${string}` };
		}
		return token;
	  };
  
	  const normalizedSourceToken = normalizeEthToWeth(
		{ symbol: params.sourceToken.symbol, address: params.sourceToken.address as string },
		Number(params.sourceChain)
	  );
	  const normalizedTargetToken = normalizeEthToWeth(
		{ symbol: params.targetToken.symbol, address: params.targetToken.address as string },
		Number(params.targetChain)
	  );
  
	  // Validate API key
	  if (!this.config.apiKey) {
		throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
	  }
	  
	  // Get orchestrator instance
	  const orchestrator = getOrchestrator(this.config.apiKey);
  
	  try {
		// ✅ CRITICAL FIX:
		// tokenRequests MUST be what you spend on SOURCE chain (sourceToken + amount).
		// Your previous code incorrectly requested destination token.
		// Include tokens from both chains in accountAccessList for better orchestrator context
		const accountAccessList: { chainTokens: Record<number, string[]> } = {
		  chainTokens: {
			[params.sourceChain]: [normalizedSourceToken.address]
		  }
		};
		
		// Add target chain token if different from source
		if (!isSameChain && normalizedTargetToken.address.toLowerCase() !== normalizedSourceToken.address.toLowerCase()) {
		  if (!accountAccessList.chainTokens[params.targetChain]) {
			accountAccessList.chainTokens[params.targetChain] = [];
		  }
		  accountAccessList.chainTokens[params.targetChain].push(normalizedTargetToken.address);
		}
		
		// Validate amount is positive
		if (params.amount <= 0n) {
		  throw new AAError('Amount must be greater than zero', AAErrorCode.SWAP_FAILED);
		}
		
		// Ensure token addresses are properly typed as 0x${string}
		const sourceTokenAddr = normalizedSourceToken.address as `0x${string}`;
		
		// For quotes, we don't include destinationExecutions because:
		// 1. The orchestrator calculates the output amount
		// 2. We don't know the exact amount until we get the quote back
		// 3. The SDK's prepareTransaction will add the destination execution with the correct amount
		// Using 'EOA' account type is correct even for EIP-7702 because:
		// - EIP-7702 accounts use the EOA address
		// - The orchestrator treats them as EOAs for routing purposes
		// - The SDK handles the EIP-7702 upgrade internally
		const intentInput = {
		  account: {
			address: params.recipient,
			accountType: 'EOA' as const,
			setupOps: []
		  },
		  destinationChainId: params.targetChain,
		  destinationExecutions: [], // Empty for quotes - SDK will add during prepareTransaction
		  tokenRequests: [
			{
			  tokenAddress: sourceTokenAddr,
			  amount: params.amount
			}
		  ],
		  accountAccessList,
		  options: {
			topupCompact: false,
			// If your orchestrator supports feeAsset, pass it here (safe if ignored)
			...(feeAsset ? { feeAsset } : {})
		  }
		};
		
		console.log('[Rhinestone Client] Requesting quote from orchestrator:', {
		  sourceChain: params.sourceChain,
		  targetChain: params.targetChain,
		  sourceToken: normalizedSourceToken.address,
		  targetToken: normalizedTargetToken.address,
		  amount: params.amount.toString(),
		  feeAsset,
		  accountAccessList
		});
  
		const route: IntentRoute = await orchestrator.getIntentRoute(intentInput);
		const intentCost: IntentCost = route.intentCost;
  
		// NOTE: naming here depends on orchestrator response shapes; keep your safe fallbacks.
		const tokenReceived = intentCost.tokensReceived?.[0];
  
		const amountSpent = tokenReceived?.amountSpent
		  ? BigInt(tokenReceived.amountSpent)
		  : params.amount;
  
		const destinationAmount = tokenReceived?.destinationAmount
		  ? BigInt(tokenReceived.destinationAmount)
		  : params.amount;
  
		const gasPrices = route.intentOp?.signedMetadata?.gasPrices || {};
		const sourceChainGasPrice = gasPrices[params.sourceChain.toString()]
		  ? BigInt(gasPrices[params.sourceChain.toString()])
		  : 1_000_000_000n;
  
		const baseGasLimit = isSameChain ? 150000n : 500000n;
		const estimatedGasCostWei = baseGasLimit * sourceChainGasPrice;
  
		const tokenPrices = route.intentOp?.signedMetadata?.tokenPrices || {};
		const ethPrice = tokenPrices['ETH'] || 2500;
		const usdcDecimals = 6;
  
		const gasCostInEth = Number(estimatedGasCostWei) / 1e18;
		const gasCostInUSDC = BigInt(Math.ceil(gasCostInEth * ethPrice * 10 ** usdcDecimals));
  
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
			maxPriorityFeePerGas: sourceChainGasPrice / 10n,
			estimatedGasCostWei,
			estimatedGasCostUSDC: gasCostInUSDC
		  },
		  route: {
			steps: [
			  {
				type: isSameChain ? 'swap' : 'bridge',
				chainId: params.sourceChain,
				protocol: 'rhinestone-solver',
				// use normalized addresses for ETH->WETH
				tokenIn: normalizedSourceToken.address as `0x${string}`,
				tokenOut: normalizedTargetToken.address as `0x${string}`,
				amountIn: amountSpent,
				amountOut: destinationAmount
			  }
			],
			totalSteps: 1,
			estimatedDuration: isSameChain ? 15 : 60
		  },
		  expiresAt: Date.now() + 60_000,
		  priceImpactBps: Math.max(priceImpactBps, 0)
		};
  
		return quote;
	  } catch (orchestratorError) {
		const errorMessage = orchestratorError instanceof Error ? orchestratorError.message : String(orchestratorError);
		const errorStack = orchestratorError instanceof Error ? orchestratorError.stack : undefined;
		
		console.error(
		  '[Rhinestone Client] Orchestrator quote failed, using gas oracle fallback:',
		  {
			error: errorMessage,
			stack: errorStack,
			sourceChain: params.sourceChain,
			targetChain: params.targetChain,
			sourceToken: normalizedSourceToken.address,
			targetToken: normalizedTargetToken.address,
			amount: params.amount.toString(),
			feeAsset
		  }
		);
  
		const gasOracle = getGasOracle();
		const operationType = isSameChain ? 'swap' : 'bridge';
		const gasLimit = gasOracle.getDefaultGasLimit(operationType);
  
		const gasPrices = await gasOracle.getGasPrice(params.sourceChain);
		const estimatedGasCostWei = gasLimit * gasPrices.maxFeePerGas;
  
		const defaultEthPrice = 2500;
		const estimatedGasCostUSDC = gasOracle.convertToUSDC(estimatedGasCostWei, defaultEthPrice);
  
		const quote: CrossChainSwapQuote = {
		  inputAmount: params.amount,
		  outputAmount: params.amount,
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
				tokenIn: normalizedSourceToken.address as `0x${string}`,
				tokenOut: normalizedTargetToken.address as `0x${string}`,
				amountIn: params.amount,
				amountOut: params.amount
			  }
			],
			totalSteps: 1,
			estimatedDuration: isSameChain ? 15 : 60
		  },
		  expiresAt: Date.now() + 60_000,
		  priceImpactBps: 10
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
	// ✅ DROP-IN REPLACEMENT #2: executeCrossChainSwap
// Fixes:
// - Uses new getSwapQuote(params, feeAsset) signature
// - Normalizes ETH->WETH for quoting + tokenRequests + sourceAssets
// - For mainnet source, defaults feeAsset to undefined (don’t force USDC)
// - Keeps your bounded poll for txHash
// ✅ DROP-IN REPLACEMENT #2: executeCrossChainSwap
// Fixes:
// - Uses new getSwapQuote(params, feeAsset) signature
// - Normalizes ETH->WETH for quoting + tokenRequests + sourceAssets
// - For mainnet source, defaults feeAsset to undefined (don’t force USDC)
// - Keeps your bounded poll for txHash
async executeCrossChainSwap(
	params: CrossChainSwapParams,
	walletAccount: Account,
	feeAsset?: string
  ): Promise<{ txHash: Hex; intentId: string }> {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  
	const pollForHash = async (
	  account: RhinestoneAccount,
	  txResult: TransactionResult,
	  maxMs = 60_000,
	  intervalMs = 2_500
	): Promise<Hex | undefined> => {
	  const start = Date.now();
	  while (Date.now() - start < maxMs) {
		const st = await account.waitForExecution(txResult);
		const hash = st?.fill?.hash ?? st?.claims?.find((c) => c?.hash)?.hash;
		if (hash && hash !== '0x') return hash;
		await sleep(intervalMs);
	  }
	  return undefined;
	};
  
	const uniqLower = (xs: Array<string | undefined>) => {
	  const seen = new Set<string>();
	  const out: string[] = [];
	  for (const x of xs) {
		if (!x) continue;
		const k = x.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(x);
	  }
	  return out;
	};
  
	const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
  
	const resolveFeeAssetAddress = (fa: string | undefined, chainId: number): `0x${string}` | undefined => {
	  if (!fa) return undefined;
	  if (isAddress(fa)) return fa as `0x${string}`;
	  return resolveTokenAddress(fa, chainId);
	};
  
	// --- native ETH -> WETH normalization for quoting/requests ---
	const MAINNET_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
	const BASE_WETH = '0x4200000000000000000000000000000000000006' as const;
  
	const isZeroAddr = (v?: string) =>
	  (v ?? '').toLowerCase() === '0x0000000000000000000000000000000000000000';
  
	const normalizeEthToWeth = (token: { symbol?: string; address: string }, chainId: number) => {
	  const sym = (token.symbol ?? '').toUpperCase();
	  if ((sym === 'ETH' || sym === 'NATIVE' || isZeroAddr(token.address)) && chainId === 1) {
		return { ...token, symbol: 'WETH', address: MAINNET_WETH as `0x${string}` };
	  }
	  if ((sym === 'ETH' || sym === 'NATIVE' || isZeroAddr(token.address)) && chainId === 8453) {
		return { ...token, symbol: 'WETH', address: BASE_WETH as `0x${string}` };
	  }
	  return token;
	};
  
	// Quote wrapper with retries (important for ETH->Base)
	const getQuoteWithRetries = async (p: CrossChainSwapParams, effectiveFeeAsset: string | undefined) => {
	  // Try: effectiveFeeAsset (usually undefined for mainnet), then undefined.
	  let lastError: Error | unknown;
	  
	  try {
		console.log('[Rhinestone Client] Attempting quote with feeAsset:', effectiveFeeAsset);
		return await this.getSwapQuote(p, effectiveFeeAsset);
	  } catch (e1) {
		lastError = e1;
		const m1 = e1 instanceof Error ? e1.message : String(e1);
		console.warn('[Rhinestone Client] First quote attempt failed:', m1);
		
		try {
		  console.log('[Rhinestone Client] Retrying quote without feeAsset');
		  return await this.getSwapQuote(p, undefined);
		} catch (e2) {
		  lastError = e2;
		  const m2 = e2 instanceof Error ? e2.message : String(e2);
		  const m1Str = m1;
		  
		  console.error('[Rhinestone Client] Both quote attempts failed:', {
			firstAttempt: m1Str,
			secondAttempt: m2,
			sourceChain: p.sourceChain,
			targetChain: p.targetChain,
			sourceToken: p.sourceToken.symbol,
			targetToken: p.targetToken.symbol,
			amount: p.amount.toString()
		  });
		  
		  throw new AAError(
			`Could not retrieve a valid quote from any quoter. First attempt: ${m1Str}. Second attempt: ${m2}`,
			AAErrorCode.SWAP_FAILED,
			{ originalError: e2, firstError: e1 }
		  );
		}
	  }
	};
  
	try {
	  if (!this.config.apiKey) {
		throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
	  }
  
	  const srcId = Number(params.sourceChain);
	  const dstId = Number(params.targetChain);
  
	  const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
	  const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];
  
	  if (!sourceChain || !targetChain) {
		throw new AAError(
		  `Unsupported cross-chain route: ${srcId} -> ${dstId}`,
		  AAErrorCode.UNSUPPORTED_NETWORK
		);
	  }
  
	  // ✅ For Ethereum mainnet source, do NOT force feeAsset (USDC gas etc.)
	  const effectiveFeeAsset = srcId === 1 ? undefined : feeAsset;
  
	  // ---- Normalize token addresses to the correct chain ----
	  const srcTokenAddr =
		resolveTokenAddress(params.sourceToken.symbol ?? '', srcId) ??
		(params.sourceToken.address as `0x${string}`);
  
	  const dstTokenAddr =
		resolveTokenAddress(params.targetToken.symbol ?? '', dstId) ??
		(params.targetToken.address as `0x${string}`);
  
	  // Build normalized params
	  let normalizedParams: CrossChainSwapParams = {
		...params,
		sourceToken: { ...params.sourceToken, address: srcTokenAddr },
		targetToken: { ...params.targetToken, address: dstTokenAddr }
	  };
  
	  // 🔥 Critical: ETH -> WETH for quote + tokenRequests
	  normalizedParams = {
		...normalizedParams,
		sourceToken: normalizeEthToWeth(
		  { symbol: normalizedParams.sourceToken.symbol, address: normalizedParams.sourceToken.address as any },
		  srcId
		) as any,
		targetToken: normalizeEthToWeth(
		  { symbol: normalizedParams.targetToken.symbol, address: normalizedParams.targetToken.address as any },
		  dstId
		) as any
	  };
  
	  // Fee asset addresses (chain-specific) — based on effectiveFeeAsset
	  const feeAssetSrcAddr = resolveFeeAssetAddress(effectiveFeeAsset, srcId);
	  const feeAssetDstAddr = resolveFeeAssetAddress(effectiveFeeAsset, dstId);
  
	  console.log('[Rhinestone Client] Cross-chain quote inputs', {
		sourceChain: srcId,
		targetChain: dstId,
		sourceToken: { symbol: normalizedParams.sourceToken.symbol, address: normalizedParams.sourceToken.address },
		targetToken: { symbol: normalizedParams.targetToken.symbol, address: normalizedParams.targetToken.address },
		feeAssetRequested: feeAsset,
		feeAssetEffective: effectiveFeeAsset,
		feeAssetSrcAddr,
		feeAssetDstAddr,
		amount: normalizedParams.amount?.toString?.()
	  });
  
	  // ---- Quote (must be compatible with ETH->Base) ----
	  const quote = await getQuoteWithRetries(normalizedParams, effectiveFeeAsset);
  
	  if (Date.now() > quote.expiresAt) {
		throw new AAError('Quote has expired', AAErrorCode.QUOTE_EXPIRED);
	  }
  
	  // ---- Create Rhinestone account ----
	  const rhinestoneAccount = await this.createAccount(walletAccount);
	  const rhinestoneAddress = rhinestoneAccount.getAddress();
	  const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();
  
	  // ---- Check deployment status on BOTH chains for cross-chain transactions ----
	  // EIP-7702 requires the account to be initialized on each chain it operates on
	  // IMPORTANT: For cross-chain to work, authorizations MUST cover BOTH chains
	  let isDeployedOnSource = false;
	  let isDeployedOnTarget = false;
	  // Track if SDK threw the limitation error - we still need authorization even if it seems "deployed"
	  let sourceHadSdkLimitation = false;
	  let targetHadSdkLimitation = false;
	  
	  if (isEOA || this.config.accountType === '7702') {
		// Check source chain deployment
		try {
		  isDeployedOnSource = await rhinestoneAccount.isDeployed(sourceChain);
		  console.log('[Rhinestone Client] Source chain deployment status:', {
			chainId: srcId,
			chainName: sourceChain.name,
			isDeployed: isDeployedOnSource
		  });
		} catch (deployedError) {
		  const errorMsg = deployedError instanceof Error ? deployedError.message : String(deployedError);
		  if (errorMsg.includes('Existing EIP-7702 accounts') || errorMsg.includes('ExistingEip7702AccountsNotSupported')) {
			console.warn('[Rhinestone Client] Source chain: SDK limitation error - account may exist but still needs authorization for cross-chain');
			// IMPORTANT: Don't assume deployed - the SDK limitation means we CAN'T reliably check
			// For cross-chain transactions, we MUST include this chain in authorization list
			isDeployedOnSource = false;
			sourceHadSdkLimitation = true;
		  } else {
			console.warn('[Rhinestone Client] Could not check source chain deployment:', errorMsg);
			// Proceed with init signature to be safe
		  }
		}
		
		// Check target chain deployment
		try {
		  isDeployedOnTarget = await rhinestoneAccount.isDeployed(targetChain);
		  console.log('[Rhinestone Client] Target chain deployment status:', {
			chainId: dstId,
			chainName: targetChain.name,
			isDeployed: isDeployedOnTarget
		  });
		} catch (deployedError) {
		  const errorMsg = deployedError instanceof Error ? deployedError.message : String(deployedError);
		  if (errorMsg.includes('Existing EIP-7702 accounts') || errorMsg.includes('ExistingEip7702AccountsNotSupported')) {
			console.warn('[Rhinestone Client] Target chain: SDK limitation error - account may exist but still needs authorization for cross-chain');
			// IMPORTANT: Don't assume deployed - for cross-chain we need to be conservative
			// The simulation will fail if we don't include proper authorizations
			isDeployedOnTarget = false;
			targetHadSdkLimitation = true;
		  } else {
			console.warn('[Rhinestone Client] Could not check target chain deployment:', errorMsg);
			// Proceed with init signature to be safe
		  }
		}
	  }
  
	  // ---- Sign EIP-7702 init data if needed on EITHER chain ----
	  // The init signature is valid cross-chain (cacheable), so we only sign once
	  // but we need it if the account isn't deployed on at least one chain
	  let eip7702InitSignature: Hex | undefined;
	  const needsInit = (isEOA || this.config.accountType === '7702') && (!isDeployedOnSource || !isDeployedOnTarget);
	  
	  if (needsInit) {
		try {
		  console.log('[Rhinestone Client] Signing EIP-7702 init data for cross-chain transaction...', {
			needsInitOnSource: !isDeployedOnSource,
			needsInitOnTarget: !isDeployedOnTarget
		  });
		  eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
		  if (!eip7702InitSignature || eip7702InitSignature === '0x') {
			throw new Error('signEip7702InitData returned empty signature');
		  }
		  console.log('[Rhinestone Client] EIP-7702 init signature obtained (valid for both chains)');
		} catch (signError) {
		  const msg = signError instanceof Error ? signError.message : String(signError);
		  throw new AAError(
			`Failed to sign EIP-7702 initialization: ${msg}. Please try again.`,
			AAErrorCode.AUTHORIZATION_REJECTED,
			{ originalError: signError }
		  );
		}
	  } else {
		console.log('[Rhinestone Client] Account already deployed on both chains, skipping init signature');
	  }
  
	  // ---- Call on TARGET chain after solver completes swap/bridge ----
	  const transferCall = {
		to: normalizedParams.targetToken.address as Address,
		value: 0n,
		data: encodeFunctionData({
		  abi: erc20Abi,
		  functionName: 'transfer',
		  args: [normalizedParams.recipient, quote.outputAmount]
		})
	  };
  
	  // ---- sourceAssets must be chain-correct ----
	  const sourceAssets: Record<number, string[]> = {
		[sourceChain.id]: uniqLower([
		  normalizedParams.sourceToken.address as any,
		  feeAssetSrcAddr
		]),
		[targetChain.id]: uniqLower([
		  normalizedParams.targetToken.address as any,
		  feeAssetDstAddr
		])
	  };
  
	  // Determine which chains need to be included in sourceChains for authorization coverage
	  // For cross-chain transactions, BOTH chains may need EIP-7702 authorization
	  // sourceChains tells the SDK which chains need authorization, not just where funds come from
	  const chainsNeedingAuth: typeof sourceChain[] = [sourceChain];
	  
	  // CRITICAL: If target chain isn't deployed or had SDK limitation, include it for authorization
	  // This ensures the authorization list covers both chains for cross-chain transactions
	  if (!isDeployedOnTarget || targetHadSdkLimitation) {
		// Only add target if it's different from source
		if (targetChain.id !== sourceChain.id) {
		  chainsNeedingAuth.push(targetChain);
		  console.log('[Rhinestone Client] Including target chain in sourceChains for authorization coverage:', {
			targetChainId: targetChain.id,
			targetChainName: targetChain.name,
			isDeployedOnTarget,
			targetHadSdkLimitation
		  });
		}
	  }

	  const transactionParams: RhinestoneTransactionParams = {
		// Use sourceChain (singular) for standard cross-chain swaps
		// This tells the SDK where the funds are coming from for quote/route calculation
		// Authorization coverage for multiple chains is handled separately in signAuths()
		sourceChain,
		targetChain,
		calls: [transferCall],
		tokenRequests: [
		  {
			// ✅ IMPORTANT: tokenRequests specifies what tokens to PULL from the SOURCE chain
			// This tells the solver what input tokens the user is providing
			// The solver will then swap/bridge these to the target chain and execute the calls
			address: normalizedParams.targetToken.address as Address,
			amount: normalizedParams.amount
		  }
		],
		feeAsset: effectiveFeeAsset,
		sourceAssets,
		eip7702InitSignature
	  };
  
	  // Check user's source token balance before proceeding
	  let sourceTokenBalance: bigint | undefined;
	  try {
		const sourceClient = createPublicClient({
		  chain: sourceChain,
		  transport: createRpcTransport(sourceChain.id as SupportedNetworkId)
		});
		sourceTokenBalance = await sourceClient.readContract({
		  address: normalizedParams.sourceToken.address as Address,
		  abi: erc20Abi,
		  functionName: 'balanceOf',
		  args: [walletAccount.address]
		});
		console.log('[Rhinestone Client] Source token balance check:', {
		  token: normalizedParams.sourceToken.symbol,
		  address: normalizedParams.sourceToken.address,
		  balance: sourceTokenBalance.toString(),
		  requiredAmount: normalizedParams.amount.toString(),
		  hasSufficientBalance: sourceTokenBalance >= normalizedParams.amount
		});
		
		if (sourceTokenBalance < normalizedParams.amount) {
		  console.warn('[Rhinestone Client] INSUFFICIENT BALANCE: User does not have enough source tokens!', {
			balance: sourceTokenBalance.toString(),
			required: normalizedParams.amount.toString(),
			deficit: (normalizedParams.amount - sourceTokenBalance).toString()
		  });
		}
	  } catch (balanceError) {
		console.warn('[Rhinestone Client] Could not check source token balance:', balanceError);
	  }
	  
	  console.log('[Rhinestone Client] Preparing cross-chain transaction...', {
		sourceChain: sourceChain.id,
		targetChain: targetChain.id,
		feeAssetRequested: feeAsset,
		feeAssetEffective: effectiveFeeAsset,
		feeAssetSrcAddr,
		feeAssetDstAddr,
		hasEip7702Init: Boolean(eip7702InitSignature),
		isDeployedOnSource,
		isDeployedOnTarget,
		sourceHadSdkLimitation,
		targetHadSdkLimitation,
		chainsNeedingAuth: chainsNeedingAuth.map(c => ({ id: c.id, name: c.name })),
		sourceAssets,
		rhinestoneAddress,
		walletAddress: walletAccount.address,
		sourceTokenBalance: sourceTokenBalance?.toString(),
		transactionParams: {
		  sourceChain: transactionParams.sourceChain?.id,
		  targetChain: transactionParams.targetChain.id,
		  callsCount: transactionParams.calls.length,
		  tokenRequestsCount: transactionParams.tokenRequests?.length ?? 0,
		  tokenRequests: transactionParams.tokenRequests?.map(t => ({
			address: t.address,
			amount: t.amount.toString()
		  })),
		  feeAsset: transactionParams.feeAsset
		}
	  });
  
	  // prepareTransaction with retry logic - the orchestrator quoters can be flaky
	  let preparedTx: PreparedTransaction;
	  const MAX_PREPARE_RETRIES = 3;
	  const PREPARE_RETRY_DELAY = 2000; // 2 seconds
	  
	  // Log full transaction params for debugging
	  console.log('[Rhinestone Client] Full transaction params for prepareTransaction:', {
		sourceChain: { id: transactionParams.sourceChain?.id, name: transactionParams.sourceChain?.name },
		targetChain: { id: transactionParams.targetChain?.id, name: transactionParams.targetChain?.name },
		calls: transactionParams.calls?.map(c => ({ to: c.to, value: String(c.value), dataLength: c.data?.length })),
		tokenRequests: transactionParams.tokenRequests?.map(t => ({ address: t.address, amount: String(t.amount) })),
		feeAsset: transactionParams.feeAsset,
		sourceAssets: transactionParams.sourceAssets,
		hasEip7702InitSignature: Boolean(transactionParams.eip7702InitSignature)
	  });
	  
	  for (let attempt = 1; attempt <= MAX_PREPARE_RETRIES; attempt++) {
		try {
		  console.log(`[Rhinestone Client] prepareTransaction attempt ${attempt}/${MAX_PREPARE_RETRIES}...`);
		  preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
		  console.log('[Rhinestone Client] prepareTransaction succeeded');
		  break; // Success, exit retry loop
		} catch (prepareError) {
		  const errorMsg = prepareError instanceof Error ? prepareError.message : String(prepareError);
		  const errorStack = prepareError instanceof Error ? prepareError.stack : undefined;
		  
		  console.error(`[Rhinestone Client] prepareTransaction attempt ${attempt} failed:`, {
			error: errorMsg,
			stack: errorStack,
			sourceChain: sourceChain.id,
			targetChain: targetChain.id,
			sourceToken: normalizedParams.sourceToken.address,
			targetToken: normalizedParams.targetToken.address,
			amount: normalizedParams.amount.toString(),
			rhinestoneAddress,
			walletAddress: walletAccount.address,
			accountType: this.config.accountType
		  });
		  
		  // Check if this is a quoter error that might be transient
		  const isQuoterError = errorMsg.toLowerCase().includes('quote') || 
							   errorMsg.toLowerCase().includes('quoter') ||
							   errorMsg.toLowerCase().includes('could not retrieve');
		  
		  // If we have more retries and it's a quoter error, wait and retry
		  if (attempt < MAX_PREPARE_RETRIES && isQuoterError) {
			console.log(`[Rhinestone Client] Quoter error detected, waiting ${PREPARE_RETRY_DELAY}ms before retry...`);
			await sleep(PREPARE_RETRY_DELAY);
			continue;
		  }
		  
		  // No more retries or non-transient error - throw with helpful message
		  const isQuoteError = errorMsg.includes('Could not retrieve a valid quote');
		  
		  if (isQuoteError) {
			throw new AAError(
			  `The Rhinestone orchestrator could not find a valid route for this swap after ${attempt} attempts. ` +
			  `This typically happens when:\n` +
			  `1) The cross-chain route (${sourceChain.name} → ${targetChain.name}) is temporarily unavailable\n` +
			  `2) The amount (${(Number(normalizedParams.amount) / 1e6).toFixed(2)} USDC) is below the minimum\n` +
			  `3) Quoters are experiencing high load or maintenance\n\n` +
			  `Please try again in a few minutes, or try with a larger amount.`,
			  AAErrorCode.SWAP_FAILED,
			  { 
				originalError: prepareError,
				sourceChain: sourceChain.id,
				targetChain: targetChain.id,
				amount: normalizedParams.amount.toString(),
				attempts: attempt
			  }
			);
		  }
		  
		  // Generic error
		  throw new AAError(
			`Failed to prepare cross-chain transaction: ${errorMsg}. ` +
			`This might be due to unsupported token pair, insufficient liquidity, or orchestrator configuration issue.`,
			AAErrorCode.SWAP_FAILED,
			{ originalError: prepareError }
		  );
		}
	  }
	  
	  // TypeScript needs this check since preparedTx might not be assigned if loop exits unexpectedly
	  if (!preparedTx!) {
		throw new AAError(
		  'Failed to prepare transaction after all retries',
		  AAErrorCode.SWAP_FAILED
		);
	  }
	  const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
  
	  // ---- Authorizations ----
	  // For cross-chain transactions, we need authorizations for BOTH source and target chains
	  // The EIP-7702 delegate contract address used by Rhinestone
	  const EIP7702_DELEGATE_CONTRACT = '0x000000000032ddc454c3bdcba80484ad5a798705' as Address;
	  
	  const signAuths = async (): Promise<SignedAuthorizationList> => {
		if (this.config.accountType !== '7702') return [];
		
		// Use a mutable array to collect authorizations, then cast at the end
		const authsList: Array<{
		  chainId: number;
		  address: Address;
		  nonce: number;
		  r: Hex;
		  s: Hex;
		  yParity: number;
		}> = [];
		
		try {
		  // First, try the SDK's signAuthorizations
		  const sdkAuths = await rhinestoneAccount.signAuthorizations(signedTx) ?? [];
		  authsList.push(...(sdkAuths as any[]));
		  const authCount = sdkAuths?.length ?? 0;
		  const authChainIds = sdkAuths?.map((a: any) => a.chainId ?? 'unknown') ?? [];
		  console.log('[Rhinestone Client] SDK signAuthorizations result:', {
			count: authCount,
			chainIds: authChainIds,
			expectedChains: chainsNeedingAuth.map(c => c.id)
		  });
		} catch (authError) {
		  const msg = authError instanceof Error ? authError.message : String(authError);
		  if (
			msg.includes('JSON-RPC') ||
			msg.toLowerCase().includes('not supported') ||
			msg.toLowerCase().includes('account type') ||
			msg.toLowerCase().includes('undefined')
		  ) {
			console.warn('[Rhinestone Client] SDK signAuthorizations not supported; will sign manually.');
		  } else {
			throw authError;
		  }
		}
		
		// Check which chains are missing and manually sign for them
		const gotChainIds = new Set(authsList.map((a: any) => Number(a.chainId)).filter(id => !isNaN(id)));
		const missingChainIds = chainsNeedingAuth
		  .map(c => c.id)
		  .filter(chainId => !gotChainIds.has(chainId));
		
		if (missingChainIds.length > 0) {
		  console.log('[Rhinestone Client] Manually signing authorizations for missing chains:', {
			missingChainIds,
			hasSignAuthorization: typeof (walletAccount as any).signAuthorization === 'function'
		  });
		  
		  // Check if wallet supports signAuthorization
		  if (typeof (walletAccount as any).signAuthorization === 'function') {
			for (const chainId of missingChainIds) {
			  try {
				console.log('[Rhinestone Client] Signing authorization for chain:', chainId);
				const auth = await (walletAccount as any).signAuthorization({
				  contractAddress: EIP7702_DELEGATE_CONTRACT,
				  chainId: chainId,
				  nonce: 0 // Nonce 0 for new authorizations
				});
				
				console.log('[Rhinestone Client] Authorization signed for chain:', {
				  chainId,
				  hasR: Boolean(auth.r),
				  hasS: Boolean(auth.s),
				  yParity: auth.yParity
				});
				
				authsList.push({
				  chainId: chainId,
				  address: EIP7702_DELEGATE_CONTRACT,
				  nonce: auth.nonce ?? 0,
				  r: auth.r,
				  s: auth.s,
				  yParity: auth.yParity ?? 0
				});
			  } catch (signError) {
				const errorMsg = signError instanceof Error ? signError.message : String(signError);
				console.error('[Rhinestone Client] Failed to sign authorization for chain:', {
				  chainId,
				  error: errorMsg
				});
				
				// Check if user rejected
				if (
				  errorMsg.toLowerCase().includes('reject') ||
				  errorMsg.toLowerCase().includes('denied') ||
				  errorMsg.toLowerCase().includes('user rejected')
				) {
				  throw new AAError(
					'Authorization signing was rejected by user',
					AAErrorCode.AUTHORIZATION_REJECTED,
					{ originalError: signError, chainId }
				  );
				}
				// For other errors, log but continue - maybe the chain doesn't need authorization after all
				console.warn('[Rhinestone Client] Could not sign authorization for chain, continuing:', chainId);
			  }
			}
		  } else {
			console.warn('[Rhinestone Client] Wallet does not support signAuthorization method. Missing chains:', missingChainIds);
		  }
		}
		
		// Final log of all authorizations
		console.log('[Rhinestone Client] Final authorization list:', {
		  count: authsList.length,
		  chainIds: authsList.map((a: any) => a.chainId),
		  expectedChains: chainsNeedingAuth.map(c => c.id)
		});
		
		return authsList as unknown as SignedAuthorizationList;
	  };

	  let authorizations = await signAuths();
  
	  const submit = async (auths: SignedAuthorizationList) => {
		console.log('[Rhinestone Client] Submitting cross-chain transaction...');
		return rhinestoneAccount.submitTransaction(signedTx, auths);
	  };
  
	  let txResult: TransactionResult;
	  try {
		txResult = await submit(authorizations);
	  } catch (submitErr) {
		const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
		
		// Extract detailed error information including Tenderly trace
		const errorObj = submitErr as any;
		
		// Extract traceId from SimulationFailedError structure
		// SimulationFailedError has traceId in constructor params, which may be stored in various places
		const tenderlyTraceId = 
		  errorObj?.traceId ||                    // Direct property
		  errorObj?.trace_id ||                   // Snake case variant
		  errorObj?.tenderlyTraceId ||            // Alternative property name
		  errorObj?.context?.traceId ||           // In context object
		  errorObj?.params?.traceId ||            // In params object
		  errorObj?.error?.traceId ||            // Nested in error property
		  (errorObj?.name === 'SimulationFailedError' && errorObj?.traceId); // Explicit check for SimulationFailedError
		
		const tenderlyUrl = errorObj?.tenderlyUrl || errorObj?.tenderly_url || errorObj?.simulationUrl;
		const errorData = errorObj?.data || errorObj?.response?.data;
		const errorCause = errorObj?.cause;
		
		// Try to extract trace ID from error message if not in properties
		let extractedTraceId = tenderlyTraceId;
		if (!extractedTraceId && msg) {
		  // Look for UUID-like patterns that might be trace IDs
		  const traceMatch = msg.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
		  if (traceMatch) {
			extractedTraceId = traceMatch[1];
		  }
		}
		
		// Enhanced logging for SimulationFailedError
		const isSimulationFailedError = errorObj?.name === 'SimulationFailedError' || 
									   msg.toLowerCase().includes('simulation') && msg.toLowerCase().includes('failed');
		
		console.error('[Rhinestone Client] Submit transaction error details:', {
		  message: msg,
		  errorName: errorObj?.name,
		  isSimulationFailedError,
		  tenderlyTraceId: extractedTraceId,
		  tenderlyUrl,
		  errorData,
		  errorCause: errorCause instanceof Error ? errorCause.message : errorCause,
		  // For SimulationFailedError, log the full structure to help debug traceId location
		  ...(isSimulationFailedError && {
			simulationErrorStructure: {
			  traceId: errorObj?.traceId,
			  context: errorObj?.context,
			  params: errorObj?.params,
			  error: errorObj?.error,
			  simulations: errorObj?.simulations
			}
		  }),
		  // Log all enumerable properties of the error
		  allErrorProps: Object.keys(errorObj || {}).reduce((acc, key) => {
			try {
			  const val = errorObj[key];
			  if (typeof val !== 'function') {
				acc[key] = typeof val === 'object' ? JSON.stringify(val).slice(0, 500) : val;
			  }
			} catch { /* ignore */ }
			return acc;
		  }, {} as Record<string, any>)
		});
  
		if (msg.toLowerCase().includes('authorization list') && msg.toLowerCase().includes('cover chain')) {
		  console.warn('[Rhinestone Client] Authorization list did not cover chain(s). Re-signing and retrying once...', {
			source: sourceChain.id,
			target: targetChain.id
		  });
		  authorizations = await signAuths();
		  txResult = await submit(authorizations);
		} else if (msg.toLowerCase().includes('initialization signature is required')) {
		  throw new AAError(
			'EIP-7702 initialization signature is required for EOA accounts',
			AAErrorCode.AUTHORIZATION_REJECTED,
			{ originalError: submitErr }
		  );
		} else if (msg.toLowerCase().includes('simulation') && msg.toLowerCase().includes('failed')) {
		  // Handle SimulationFailedError with more details
		  const tenderlyInfo = extractedTraceId 
			? `Tenderly trace ID: ${extractedTraceId}. View at: https://dashboard.tenderly.co/tx/mainnet/${extractedTraceId}` 
			: 'No Tenderly trace ID available.';
		  
		  throw new AAError(
			`Bundle simulation failed. ${tenderlyInfo}\n` +
			`This usually means: 1) Insufficient token balance, 2) Token not approved, or 3) Invalid transaction parameters.\n` +
			`Source: ${sourceChain.name} (${sourceChain.id}), Target: ${targetChain.name} (${targetChain.id})`,
			AAErrorCode.TRANSACTION_FAILED, // Use TRANSACTION_FAILED until SIMULATION_FAILED is recognized
			{ 
			  originalError: submitErr, 
			  tenderlyTraceId: extractedTraceId,
			  tenderlyUrl,
			  errorData,
			  sourceChain: sourceChain.id,
			  targetChain: targetChain.id,
			  authorizationsCount: authorizations.length,
			  simulationFailed: true
			}
		  );
		} else {
		  throw submitErr;
		}
	  }
  
	  const status = await rhinestoneAccount.waitForExecution(txResult);
	  const directHash = status?.fill?.hash ?? status?.claims?.find((c) => c?.hash)?.hash;
  
	  if (directHash && directHash !== '0x') {
		return { txHash: directHash, intentId: txResult.id.toString() };
	  }
  
	  const polledHash = await pollForHash(rhinestoneAccount, txResult, 60_000, 2_500);
	  if (polledHash && polledHash !== '0x') {
		return { txHash: polledHash, intentId: txResult.id.toString() };
	  }
  
	  throw new AAError(
		`Cross-chain transaction completed but no hash returned (intentId: ${txResult.id.toString()}). Backend may not have attached the chain tx hash yet.`,
		AAErrorCode.TRANSACTION_FAILED,
		{ intentId: txResult.id.toString(), status }
	  );
	  } catch (error) {
	  console.error('[Rhinestone Client] executeCrossChainSwap error:', error);
	  
	  // Try to extract more details from the error
	  let errorMessage = 'Unknown error';
	  let errorDetails: any = {};
	  
	  if (error instanceof Error) {
		errorMessage = error.message;
		errorDetails = {
		  name: error.name,
		  stack: error.stack,
		  // Check if error has additional properties
		  ...(error as any).response && { response: (error as any).response },
		  ...(error as any).data && { data: (error as any).data },
		  ...(error as any).status && { status: (error as any).status }
		};
	  }
	  
	  // Check if it's an orchestrator error
	  if (errorMessage.includes('Something went wrong') || errorMessage.includes('OrchestratorError')) {
		console.error('[Rhinestone Client] Orchestrator error details:', {
		  errorMessage,
		  errorDetails,
		  sourceChain: params.sourceChain,
		  targetChain: params.targetChain,
		  sourceToken: params.sourceToken.symbol,
		  targetToken: params.targetToken.symbol
		});
		
		throw new AAError(
		  `Orchestrator error: ${errorMessage}. ` +
		  `This might indicate the token pair (${params.sourceToken.symbol} -> ${params.targetToken.symbol}) ` +
		  `is not supported, or there's insufficient liquidity. Please try a different token or contact support.`,
		  AAErrorCode.SWAP_FAILED,
		  { originalError: error, errorDetails }
		);
	  }
	  
	  if (error instanceof AAError) throw error;
	  throw new AAError(
		`Cross-chain swap failed: ${errorMessage}`,
		AAErrorCode.SWAP_FAILED,
		{ originalError: error, errorDetails }
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
				let needsInitSignatureAnyway = false;
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
					// the SDK still requires the init signature for prepareTransaction
					// even though the account technically exists
					if (errorMsg.includes('Existing EIP-7702 accounts') || errorMsg.includes('ExistingEip7702AccountsNotSupported')) {
						console.warn('[Rhinestone Client] Account appears to be already initialized with EIP-7702 (SDK limitation). Will still get init signature as SDK requires it.');
						needsInitSignatureAnyway = true;
					} else {
						// Re-throw other errors
						throw deployedError;
					}
				}

				// Get init signature if not deployed OR if SDK requires it despite existing account
				if (!isDeployed || needsInitSignatureAnyway) {
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
	  
		const pollForHash = async (
		  account: RhinestoneAccount,
		  txResult: TransactionResult,
		  maxMs = 45_000,
		  intervalMs = 2_500
		): Promise<Hex | undefined> => {
		  const start = Date.now();
		  while (Date.now() - start < maxMs) {
			const st = await account.waitForExecution(txResult);
			const hash = st?.fill?.hash ?? st?.claims?.find((c) => c?.hash)?.hash;
			if (hash && hash !== '0x') return hash;
			await sleep(intervalMs);
		  }
		  return undefined;
		};
	  
		// Normalize fee asset to an address for sourceAssets when possible
		// Uses resolveTokenAddress to support any fee token (USDC, USDT, etc.) on any network
		const normalizeFeeAssetToAddress = (fa?: string, chainId?: number): string | undefined => {
		  if (!fa) return undefined;
		  // already looks like an address
		  if (/^0x[a-fA-F0-9]{40}$/.test(fa)) return fa;
		  // resolve token symbol to address using PAYMENT_TOKENS_BY_NETWORK
		  if (chainId) {
			return resolveTokenAddress(fa, chainId);
		  }
		  return undefined; // unknown symbol or no chainId
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
	  
		  const rhinestoneAccount = await this.createAccount(walletAccount);
		  const rhinestoneAddress = rhinestoneAccount.getAddress();
	  
		  // EIP-7702 init signature (required by backend flow)
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
	  
		  const feeAssetAddress = normalizeFeeAssetToAddress(feeAsset, chain.id);
		  const sourceAssets =
			feeAssetAddress ? { [chain.id]: [feeAssetAddress] } : undefined;
	  
		  const transactionParams: RhinestoneTransactionParams = {
			chain,
			calls: params.calls.map((c) => ({
			  to: c.to as Address,
			  value: (c.value ?? 0n) as bigint,
			  data: (c.data ?? '0x') as Hex
			})),
			feeAsset, // keep original feeAsset for SDK (it might accept symbol)
			sourceAssets, // MUST be addresses
			eip7702InitSignature
		  };
	  
		  console.log('[Rhinestone Client] Preparing same-chain transaction...', {
			chainId: chain.id,
			callsCount: transactionParams.calls.length,
			feeAsset,
			feeAssetAddress,
			hasEip7702Init: Boolean(eip7702InitSignature),
			rhinestoneAddress,
			walletAddress: walletAccount.address
		  });
	  
		  const preparedTx = await rhinestoneAccount.prepareTransaction(transactionParams);
		  const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
	  
		  // 🔑 Important: authorizations may be REQUIRED depending on route/wallet
		  const getAuthorizations = async (): Promise<SignedAuthorizationList> => {
			if (this.config.accountType !== '7702') return [];
			try {
			  const auths = await rhinestoneAccount.signAuthorizations(signedTx);
			  console.log('[Rhinestone Client] Authorizations signed:', auths?.length ?? 0);
			  return auths ?? [];
			} catch (authError) {
			  const msg = authError instanceof Error ? authError.message : String(authError);
	  
			  // Only swallow for known Dynamic JSON-RPC limitations
			  if (
				msg.includes('JSON-RPC') ||
				msg.includes('not supported') ||
				msg.toLowerCase().includes('account type') ||
				msg.toLowerCase().includes('undefined')
			  ) {
				console.warn(
				  '[Rhinestone Client] signAuthorizations not supported for this wallet. Proceeding without authorizations.'
				);
				return [];
			  }
	  
			  throw authError;
			}
		  };
	  
		  let authorizations: SignedAuthorizationList = await getAuthorizations();
	  
		  const submit = async (auths: SignedAuthorizationList) => {
			console.log('[Rhinestone Client] Submitting transaction...');
			return rhinestoneAccount.submitTransaction(signedTx, auths);
		  };
	  
		  let txResult: TransactionResult;
		  try {
			txResult = await submit(authorizations);
		  } catch (submitErr) {
			const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
	  
			if (msg.includes('authorization list') && msg.includes('cover chain')) {
			  console.warn(
				'[Rhinestone Client] Authorization did not cover chain. Re-signing authorizations and retrying once...',
				{ chainId: chain.id }
			  );
			  authorizations = await getAuthorizations();
			  txResult = await submit(authorizations);
			} else {
			  throw submitErr;
			}
		  }
	  
		  console.log('[Rhinestone Client] Transaction submitted, waiting for execution...', {
			intentId: txResult.id.toString(),
			targetChain: txResult.targetChain
		  });
	  
		  const status = await rhinestoneAccount.waitForExecution(txResult);
		  const directHash = status?.fill?.hash ?? status?.claims?.find((c) => c?.hash)?.hash;
	  
		  if (directHash && directHash !== '0x') {
			return { txHash: directHash, intentId: txResult.id.toString() };
		  }
	  
		  console.warn('[Rhinestone Client] No txHash found in execution status. Polling for txHash...', {
			intentId: txResult.id.toString()
		  });
	  
		  const polledHash = await pollForHash(rhinestoneAccount, txResult, 45_000, 2_500);
		  if (polledHash && polledHash !== '0x') {
			return { txHash: polledHash, intentId: txResult.id.toString() };
		  }
	  
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
					console.log('[Rhinestone Client] Transaction messages:', safeStringify(messages));
					
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
