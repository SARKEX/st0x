/**
 * Account Abstraction Module
 *
 * Provides cross-chain trading and gas abstraction for st0x via Rhinestone.
 *
 * Features:
 * - Cross-chain swaps (USDT/ETH → USDC) via Rhinestone solver network
 * - Gas sponsorship via Rhinestone (native, deposit USDC on Base)
 * - EIP-7702 Smart EOAs for Privy users
 *
 * @example
 * ```typescript
 * import {
 *   getAAOrchestrator,
 *   getPaymentTokensForNetwork,
 *   SUPPORTED_NETWORKS
 * } from '$lib/services/account-abstraction';
 *
 * // Get available payment tokens
 * const tokens = getPaymentTokensForNetwork(SUPPORTED_NETWORKS.BASE);
 *
 * // Check if cross-chain swap needed
 * const orchestrator = getAAOrchestrator();
 * const needsSwap = orchestrator.needsCrossChainSwap(selectedToken, SUPPORTED_NETWORKS.BASE);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export * from './types';

// =============================================================================
// Tokens
// =============================================================================

export {
	// Individual tokens
	USDC_BASE,
	USDC_ARBITRUM,
	USDC_ETHEREUM,
	USDT_BASE,
	USDT_ARBITRUM,
	USDT_ETHEREUM,
	ETH_BASE,
	ETH_ARBITRUM,
	ETH_ETHEREUM,
	WETH_BASE,
	WETH_ARBITRUM,
	WETH_ETHEREUM,
	// Token collections
	PAYMENT_TOKENS_MULTI_NETWORK,
	// Helper functions
	getPaymentTokensForNetwork,
	getDefaultPaymentToken,
	getPaymentToken,
	getNetworksForToken,
	getAllTokenSymbols,
	requiresWrapping,
	getWrappedToken,
	// Display helpers
	NETWORK_NAMES,
	NETWORK_ICONS
} from './tokens';

// =============================================================================
// Rhinestone (Cross-Chain Swaps & Gas Sponsorship)
// =============================================================================

export { RhinestoneClient, getRhinestoneClient, isRhinestoneConfigured } from './rhinestone/client';

export {
	GasOracle,
	getGasOracle,
	createGasOracle,
	type GasPriceData,
	type GasOracleConfig
} from './rhinestone/gasOracle';

export {
	BalanceChecker,
	getBalanceChecker,
	formatBalanceShortfall,
	type BalanceCheckResult
} from './rhinestone/balanceChecker';

export {
	PriceOracle,
	getPriceOracle,
	type TokenPrice
} from './rhinestone/priceOracle';

export {
	TransactionMonitor,
	getTransactionMonitor,
	monitorTransaction,
	getStatusDescription,
	type IntentStatus,
	type MonitoredTransaction,
	type TransactionUpdate
} from './rhinestone/transactionMonitor';

export {
	getSwapToSettlementQuote,
	getSwapFromSettlementQuote,
	calculateOptimalRoute,
	isSwapRequired,
	validateSwap,
	estimateSwapCost,
	encodeApproval,
	executeSwapToSettlement,
	executeSwapFromSettlement,
	getUSDCEquivalent
} from './rhinestone/swaps';

// =============================================================================
// EIP-7702 / Privy Integration
// =============================================================================

export {
	supportsEIP7702,
	checkDelegationStatus,
	getWalletCapabilities,
	getPrivyWalletAddress,
	isPrivyWalletReady,
	encodeBatchCall,
	encodeExecute,
	checkEOADelegateStatus,
	getERC7579Implementation,
	signEIP7702Authorization,
	createPrivyWalletClient,
	getPrivyAccountForRhinestone,
	type EIP7702WalletCapabilities,
	type EOADelegateStatus,
	type EIP7702SignedAuthorization,
	type EIP7702AuthorizationOptions
} from './wallets/privy-7702';

// =============================================================================
// Orchestrator (Main Entry Point)
// =============================================================================

export {
	AccountAbstractionOrchestrator,
	getAAOrchestrator,
	isAAAvailable,
	getAAFeatureStatus,
	type GasPaymentOption,
	type GasPaymentMethod
} from './orchestrator';
