/**
 * Account Abstraction Types
 *
 * Type definitions for the Rhinestone account abstraction integration.
 */

import type { Address, Hash, Hex } from 'viem';

// =============================================================================
// Supported Networks & Tokens
// =============================================================================

export const SUPPORTED_NETWORKS = {
	BASE: 8453,
	ARBITRUM: 42161,
	ETHEREUM: 1,
	BASE_SEPOLIA: 84532,
	ARBITRUM_SEPOLIA: 421614
} as const;

export type SupportedNetworkId = (typeof SUPPORTED_NETWORKS)[keyof typeof SUPPORTED_NETWORKS];

export interface PaymentToken {
	address: Address;
	symbol: string;
	decimals: number;
	name: string;
	chainId: SupportedNetworkId;
	logoUrl: string;
	priceFeedId: Hex;
	isNative?: boolean;
}

// Settlement token is always USDC on Base for tStocks
export const SETTLEMENT_CHAIN_ID = SUPPORTED_NETWORKS.BASE;
export const SETTLEMENT_TOKEN_SYMBOL = 'USDC';

// =============================================================================
// Rhinestone Types
// =============================================================================

export interface RhinestoneConfig {
	apiKey: string;
	providerType: 'alchemy' | 'infura' | 'public';
	providerApiKey?: string;
	paymasterConfig?: PaymasterConfig;
	/**
	 * Account type for Rhinestone SDK
	 * - 'smart': Creates a new smart account (default, ERC-4337 style)
	 * - '7702': Uses EIP-7702 to upgrade existing EOA (preserves address)
	 *
	 * For Privy embedded wallets, use '7702' to keep the user's EOA address
	 * while gaining smart account capabilities.
	 */
	accountType?: 'smart' | '7702';
}

export interface PaymasterConfig {
	/**
	 * Rhinestone native sponsorship (recommended)
	 * - Deposit USDC on Base to your sponsorship wallet
	 * - Set sponsored: true in transactions
	 * - Covers gas, bridging (3bps), and swap fees (50bps)
	 *
	 * Legacy external paymasters (not recommended)
	 * - 'pimlico' or 'biconomy' require separate API keys
	 */
	type: 'rhinestone' | 'pimlico' | 'biconomy';
	apiKey?: string;
	sponsorshipEnabled?: boolean;
}

export interface CrossChainSwapParams {
	sourceChain: SupportedNetworkId;
	targetChain: SupportedNetworkId;
	sourceToken: PaymentToken;
	targetToken: PaymentToken;
	amount: bigint;
	recipient: Address;
	slippageBps?: number; // Basis points (100 = 1%)
}

export interface CrossChainSwapQuote {
	inputAmount: bigint;
	outputAmount: bigint;
	estimatedGas: GasEstimate;
	route: SwapRoute;
	expiresAt: number;
	priceImpactBps: number;
}

export interface GasEstimate {
	gasLimit: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
	estimatedGasCostWei: bigint;
	estimatedGasCostUSDC: bigint; // In USDC decimals (6)
}

export interface SwapRoute {
	steps: SwapStep[];
	totalSteps: number;
	estimatedDuration: number; // seconds
}

export interface SwapStep {
	type: 'swap' | 'bridge' | 'approve';
	chainId: SupportedNetworkId;
	protocol: string;
	tokenIn: Address;
	tokenOut: Address;
	amountIn: bigint;
	amountOut: bigint;
}

export interface OmnichainTransactionParams {
	sourceChain: SupportedNetworkId;
	targetChain: SupportedNetworkId;
	calls: TransactionCall[];
	tokenRequests?: TokenRequest[];
}

export interface TransactionCall {
	to: Address;
	data: Hex;
	value?: bigint;
}

export interface TokenRequest {
	token: Address;
	amount: bigint;
	chainId: SupportedNetworkId;
}

// =============================================================================
// EIP-7702 Types
// =============================================================================

export interface EIP7702Authorization {
	chainId: bigint;
	address: Address; // The contract to delegate to
	nonce: bigint;
}

export interface SignedAuthorization extends EIP7702Authorization {
	r: Hex;
	s: Hex;
	v: number;
}

// =============================================================================
// Trade Integration Types
// =============================================================================

export interface TradeWithAAParams {
	// Source configuration
	sourceToken: PaymentToken;
	sourceAmount: bigint;

	// Target configuration
	targetAsset: Address; // tStock address
	targetChainId: SupportedNetworkId;

	// Trade details
	tradeType: 'buy' | 'sell';
	slippageBps: number;

	// Gas payment preference
	gasPaymentMethod: 'native' | 'sponsored';

	// Wallet address
	walletAddress: Address;
}

export interface TradeExecutionResult {
	success: boolean;
	transactionHash?: Hash;
	crossChainTxHash?: Hex;
	error?: string;
	gasUsed?: bigint;
	executionSteps: ExecutionStep[];
	// Additional fields for AA orchestration
	settlementUSDCAmount?: bigint; // Amount of USDC available on Base after any swaps
	intentId?: string; // Rhinestone intent ID for tracking
	message?: string; // Status message
}

export interface ExecutionStep {
	type: 'approve' | 'swap' | 'bridge' | 'trade';
	status: 'pending' | 'executing' | 'confirmed' | 'failed';
	transactionHash?: Hash;
	txHash?: Hex; // Alternative tx hash field
	chainId: SupportedNetworkId;
	description: string;
}

// =============================================================================
// Error Types
// =============================================================================

export class AAError extends Error {
	constructor(
		message: string,
		public code: AAErrorCode,
		public details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'AAError';
	}
}

export enum AAErrorCode {
	// Wallet errors
	WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
	UNSUPPORTED_WALLET_TYPE = 'UNSUPPORTED_WALLET_TYPE',
	AUTHORIZATION_REJECTED = 'AUTHORIZATION_REJECTED',

	// Network errors
	UNSUPPORTED_NETWORK = 'UNSUPPORTED_NETWORK',
	NETWORK_MISMATCH = 'NETWORK_MISMATCH',

	// Token errors
	INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
	TOKEN_NOT_SUPPORTED = 'TOKEN_NOT_SUPPORTED',

	// Transaction errors
	TRANSACTION_FAILED = 'TRANSACTION_FAILED',
	GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
	PAYMASTER_ERROR = 'PAYMASTER_ERROR',

	// Cross-chain errors
	BRIDGE_ERROR = 'BRIDGE_ERROR',
	SWAP_FAILED = 'SWAP_FAILED',
	QUOTE_EXPIRED = 'QUOTE_EXPIRED',

	// Service errors
	RHINESTONE_ERROR = 'RHINESTONE_ERROR',

	// Generic
	UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
