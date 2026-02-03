/**
 * Account Abstraction Orchestrator
 *
 * Central coordinator for Rhinestone-based account abstraction:
 * - Cross-chain swap orchestration
 * - Gas sponsorship via Rhinestone (native, deposit USDC on Base)
 * - Trade execution with AA features
 *
 * Integration points:
 * - Called before market order execution when user selects non-Base/non-USDC payment
 * - Handles cross-chain swap, then calls existing trade flow
 */

import type { Address, Account, Hex } from 'viem';
import {
	type PaymentToken,
	type TradeWithAAParams,
	type TradeExecutionResult,
	type ExecutionStep,
	type GasEstimate,
	type CrossChainSwapQuote,
	type SupportedNetworkId,
	SETTLEMENT_CHAIN_ID
} from './types';

// Import sub-services
import { getRhinestoneClient, isRhinestoneConfigured } from './rhinestone/client';
import {
	getSwapToSettlementQuote,
	validateSwap,
	executeSwapToSettlement,
	executeSwapFromSettlement
} from './rhinestone/swaps';
import { supportsEIP7702 } from './wallets/dynamic';
import { USDC_BASE } from './tokens';
import { getBalanceChecker, formatBalanceShortfall } from './rhinestone/balanceChecker';
import { getPriceOracle } from './rhinestone/priceOracle';
import { getGasOracle } from './rhinestone/gasOracle';
import { monitorTransaction, type TransactionUpdate } from './rhinestone/transactionMonitor';

// Rhinestone Spoke Pool address for approvals (from @rhinestone/sdk)
const RHINESTONE_SPOKE_POOL = '0x000000000060f6e853447881951574cdd0663530' as Address;

// =============================================================================
// Types
// =============================================================================

export interface GasPaymentOption {
	method: 'native' | 'erc20' | 'sponsored';
	available: boolean;
	label: string;
	description: string;
	estimatedCost?: string;
	feeAsset?: string; // For erc20 method - e.g., 'USDC'
}

export interface GasPaymentMethod {
	type: 'native' | 'erc20' | 'sponsored';
	feeAsset?: string; // For erc20 method - e.g., 'USDC'
}

// =============================================================================
// Main Orchestrator Class
// =============================================================================

export class AccountAbstractionOrchestrator {
	/**
	 * Execute a cross-chain swap to get USDC on Base for trading
	 *
	 * This is called BEFORE the actual trade execution when user selects
	 * a non-Base/non-USDC payment method.
	 *
	 * @param sourceToken - Token the user wants to pay with
	 * @param amount - Amount of source token
	 * @param recipient - Recipient address (user's address on Base)
	 * @param walletAccount - User's wallet account for signing
	 * @param onStatusChange - Optional callback for transaction status updates
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 * @returns Result with USDC amount received and tx hash
	 */
	async executePreTradeSwap(
		sourceToken: PaymentToken,
		amount: bigint,
		recipient: Address,
		walletAccount: Account,
		onStatusChange?: (update: TransactionUpdate) => void,
		feeAsset?: string
	): Promise<{
		success: boolean;
		usdcAmount: bigint;
		txHash?: Hex;
		intentId?: string;
		error?: string;
	}> {
		try {
			// Validate the swap
			const validation = await validateSwap(sourceToken, amount, recipient);
			if (!validation.valid) {
				return { success: false, usdcAmount: 0n, error: validation.error };
			}

			// Check if swap is actually needed
			if (!this.needsCrossChainSwap(sourceToken, SETTLEMENT_CHAIN_ID)) {
				// Already USDC on Base, no swap needed
				return { success: true, usdcAmount: amount };
			}

			// Check Rhinestone is configured
			if (!isRhinestoneConfigured()) {
				return {
					success: false,
					usdcAmount: 0n,
					error:
						'Cross-chain swaps require Rhinestone API key. Configure PUBLIC_RHINESTONE_API_KEY.'
				};
			}

			// Check balance before attempting swap
			const balanceChecker = getBalanceChecker();
			const balanceCheck = await balanceChecker.checkSufficientBalance(
				sourceToken,
				recipient,
				amount
			);

			if (!balanceCheck.hasEnough) {
				return {
					success: false,
					usdcAmount: 0n,
					error: formatBalanceShortfall(balanceCheck)
				};
			}

			// Execute the swap
			const result = await executeSwapToSettlement(
				sourceToken,
				amount,
				recipient,
				walletAccount,
				feeAsset
			);

			// Start monitoring the transaction if we have an intentId
			if (result.intentId && onStatusChange) {
				monitorTransaction(
					result.intentId,
					sourceToken.chainId,
					SETTLEMENT_CHAIN_ID,
					onStatusChange
				);
			}

			return {
				success: true,
				usdcAmount: result.outputAmount,
				txHash: result.txHash,
				intentId: result.intentId
			};
		} catch (error) {
			return {
				success: false,
				usdcAmount: 0n,
				error: error instanceof Error ? error.message : 'Unknown swap error'
			};
		}
	}

	/**
	 * Execute a swap from USDC on Base after selling tStocks
	 *
	 * Called AFTER the trade when user wants proceeds in different token/chain.
	 *
	 * @param targetToken - The token to receive
	 * @param usdcAmount - Amount of USDC to swap
	 * @param recipient - The address to receive target token
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executePostTradeSwap(
		targetToken: PaymentToken,
		usdcAmount: bigint,
		recipient: Address,
		walletAccount: Account,
		feeAsset?: string
	): Promise<{
		success: boolean;
		outputAmount: bigint;
		txHash?: Hex;
		intentId?: string;
		error?: string;
	}> {
		try {
			// Check if swap is actually needed
			if (
				!this.needsCrossChainSwap(USDC_BASE, targetToken.chainId) &&
				targetToken.symbol === 'USDC'
			) {
				return { success: true, outputAmount: usdcAmount };
			}

			// Check Rhinestone is configured
			if (!isRhinestoneConfigured()) {
				return {
					success: false,
					outputAmount: 0n,
					error:
						'Cross-chain swaps require Rhinestone API key. Configure PUBLIC_RHINESTONE_API_KEY.'
				};
			}

			// Execute the swap
			const result = await executeSwapFromSettlement(
				targetToken,
				usdcAmount,
				recipient,
				walletAccount,
				feeAsset
			);

			return {
				success: true,
				outputAmount: result.outputAmount,
				txHash: result.txHash,
				intentId: result.intentId
			};
		} catch (error) {
			return {
				success: false,
				outputAmount: 0n,
				error: error instanceof Error ? error.message : 'Unknown swap error'
			};
		}
	}

	/**
	 * Get a quote for converting source token to USDC on Base
	 */
	async getPreTradeQuote(
		sourceToken: PaymentToken,
		amount: bigint,
		recipient: Address,
		feeAsset?: string
	): Promise<CrossChainSwapQuote | null> {
		try {
			if (!this.needsCrossChainSwap(sourceToken, SETTLEMENT_CHAIN_ID)) {
				// No swap needed - return passthrough quote
				return {
					inputAmount: amount,
					outputAmount: amount,
					estimatedGas: {
						gasLimit: 0n,
						maxFeePerGas: 0n,
						maxPriorityFeePerGas: 0n,
						estimatedGasCostWei: 0n,
						estimatedGasCostUSDC: 0n
					},
					route: { steps: [], totalSteps: 0, estimatedDuration: 0 },
					expiresAt: Date.now() + 300000,
					priceImpactBps: 0
				};
			}

			return await getSwapToSettlementQuote(sourceToken, amount, recipient, feeAsset);
		} catch {
			return null;
		}
	}

	/**
	 * Check if a quote is still valid (not expired)
	 */
	isQuoteValid(quote: CrossChainSwapQuote): boolean {
		// Add 5 second buffer before expiry
		return quote.expiresAt > Date.now() + 5000;
	}

	/**
	 * Get a fresh quote, refreshing if the current one is expired or about to expire
	 */
	async getOrRefreshQuote(
		sourceToken: PaymentToken,
		amount: bigint,
		recipient: Address,
		currentQuote?: CrossChainSwapQuote | null,
		feeAsset?: string
	): Promise<CrossChainSwapQuote | null> {
		// If we have a valid quote, return it
		if (currentQuote && this.isQuoteValid(currentQuote)) {
			return currentQuote;
		}

		// Otherwise fetch a fresh quote
		return this.getPreTradeQuote(sourceToken, amount, recipient, feeAsset);
	}

	/**
	 * Execute a trade with account abstraction features
	 *
	 * This handles the full flow:
	 * 1. Cross-chain swaps if source token is on different chain
	 * 2. Trade execution (via existing flow)
	 * 3. Optional post-trade swap if user wants proceeds elsewhere
	 *
	 * Note: For now, this orchestrates but the actual trade execution
	 * should be handled by the existing marketOrderExecution flow.
	 */
	async executeTrade(
		params: TradeWithAAParams,
		walletAccount?: Account
	): Promise<TradeExecutionResult> {
		const steps: ExecutionStep[] = [];

		try {
			// Step 1: Validate the trade
			if (this.needsCrossChainSwap(params.sourceToken, SETTLEMENT_CHAIN_ID)) {
				const validation = await validateSwap(
					params.sourceToken,
					params.sourceAmount,
					params.walletAddress
				);

				if (!validation.valid) {
					return {
						success: false,
						error: validation.error,
						executionSteps: steps
					};
				}
			}

			// Step 2: Handle cross-chain swap if needed
			let settlementAmount = params.sourceAmount;
			let crossChainTxHash: Hex | undefined;

			if (this.needsCrossChainSwap(params.sourceToken, SETTLEMENT_CHAIN_ID)) {
				steps.push({
					type: 'bridge',
					status: 'pending',
					chainId: params.sourceToken.chainId,
					description: `Swapping ${params.sourceToken.symbol} to USDC on Base`
				});

				// Check Rhinestone is configured
				if (!isRhinestoneConfigured()) {
					steps[steps.length - 1].status = 'failed';
					return {
						success: false,
						error: 'Cross-chain swaps require Rhinestone API key configuration',
						executionSteps: steps
					};
				}

				// Need wallet account for signing
				if (!walletAccount) {
					steps[steps.length - 1].status = 'failed';
					return {
						success: false,
						error: 'Wallet account required for cross-chain swap',
						executionSteps: steps
					};
				}

				steps[steps.length - 1].status = 'executing';

				// Determine feeAsset based on gas payment method
				const feeAsset = params.gasPaymentMethod === 'erc20' ? 'USDC' : undefined;

				// Execute the swap
				const swapResult = await executeSwapToSettlement(
					params.sourceToken,
					params.sourceAmount,
					params.walletAddress,
					walletAccount,
					feeAsset
				);

				// Update settlement amount from result
				settlementAmount = swapResult.outputAmount;
				crossChainTxHash = swapResult.txHash;
				steps[steps.length - 1].status = 'confirmed';
				steps[steps.length - 1].txHash = crossChainTxHash;
			}

			// Step 3: Execute the actual trade on Base
			steps.push({
				type: 'trade',
				status: 'pending',
				chainId: SETTLEMENT_CHAIN_ID,
				description: params.tradeType === 'buy' ? 'Buying tStock' : 'Selling tStock'
			});

			// The actual trade execution should be handled by the caller using marketOrderExecution
			// Return success with the settlement amount that should be used for the trade
			steps[steps.length - 1].status = 'executing';

			return {
				success: true,
				settlementUSDCAmount: settlementAmount,
				crossChainTxHash,
				executionSteps: steps,
				// Note: Trade transaction will be executed separately via marketOrderExecution
				message:
					settlementAmount !== params.sourceAmount
						? `Swapped to ${
								Number(settlementAmount) / 1e6
							} USDC on Base. Ready for trade execution.`
						: 'Ready for trade execution.'
			};
		} catch (error) {
			const lastStep = steps[steps.length - 1];
			if (lastStep) {
				lastStep.status = 'failed';
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				executionSteps: steps
			};
		}
	}

	/**
	 * Estimate gas for a trade using real-time gas and price oracles
	 */
	async estimateTradeGas(params: TradeWithAAParams): Promise<GasEstimate> {
		const gasOracle = getGasOracle();
		const priceOracle = getPriceOracle();

		// Base gas estimate for a typical trade
		let totalGasLimit = 300000n; // Base trade gas

		// Add cross-chain swap gas if needed
		if (this.needsCrossChainSwap(params.sourceToken, SETTLEMENT_CHAIN_ID)) {
			totalGasLimit += gasOracle.getDefaultGasLimit('bridge');
		}

		// Check if approval is needed and add gas for it
		const balanceChecker = getBalanceChecker();
		const approvalCheck = await balanceChecker.needsApproval(
			params.sourceToken,
			params.walletAddress,
			RHINESTONE_SPOKE_POOL,
			params.sourceAmount
		);

		if (approvalCheck.needsApproval) {
			totalGasLimit += gasOracle.getDefaultGasLimit('approve');
		}

		// Get real gas prices from the source chain
		const gasPrices = await gasOracle.getGasPrice(params.sourceToken.chainId);

		const estimatedGasCostWei = totalGasLimit * gasPrices.maxFeePerGas;

		// Get real ETH price and convert to USDC
		const estimatedGasCostUSDC = await priceOracle.convertGasToUSDC(estimatedGasCostWei);

		return {
			gasLimit: totalGasLimit,
			maxFeePerGas: gasPrices.maxFeePerGas,
			maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
			estimatedGasCostWei,
			estimatedGasCostUSDC
		};
	}

	/**
	 * Check if a cross-chain swap is needed
	 */
	needsCrossChainSwap(sourceToken: PaymentToken, targetChainId: SupportedNetworkId): boolean {
		// If different chain, definitely needs swap
		if (sourceToken.chainId !== targetChainId) {
			return true;
		}

		// If same chain but different token than settlement (USDC)
		if (sourceToken.symbol !== 'USDC') {
			return true;
		}

		return false;
	}

	/**
	 * Prepare a cross-chain swap (get quote, check balance, and check approvals)
	 */
	async prepareCrossChainSwap(
		sourceToken: PaymentToken,
		amount: bigint,
		recipient: Address
	): Promise<{
		quote: CrossChainSwapQuote | null;
		approvalNeeded: boolean;
		approvalAmount?: bigint;
		hasBalance: boolean;
		balanceShortfall?: bigint;
		error?: string;
	}> {
		const balanceChecker = getBalanceChecker();

		// Check balance first
		const balanceCheck = await balanceChecker.checkSufficientBalance(
			sourceToken,
			recipient,
			amount
		);

		if (!balanceCheck.hasEnough) {
			return {
				quote: null,
				approvalNeeded: false,
				hasBalance: false,
				balanceShortfall: balanceCheck.shortfall,
				error: formatBalanceShortfall(balanceCheck)
			};
		}

		// Get quote
		const quote = await getSwapToSettlementQuote(sourceToken, amount, recipient);

		// Check if approval is needed
		const approvalCheck = await balanceChecker.needsApproval(
			sourceToken,
			recipient,
			RHINESTONE_SPOKE_POOL,
			amount
		);

		return {
			quote,
			approvalNeeded: approvalCheck.needsApproval,
			approvalAmount: approvalCheck.needsApproval ? amount : undefined,
			hasBalance: true
		};
	}

	/**
	 * Get available gas payment options
	 *
	 * Options:
	 * - native: User pays with ETH
	 * - erc20: User pays with USDC from their balance (Base only)
	 * - sponsored: App sponsors gas (requires deposit to Rhinestone)
	 */
	getGasPaymentOptions(chainId: SupportedNetworkId): GasPaymentOption[] {
		const options: GasPaymentOption[] = [];
		const rhinestoneClient = getRhinestoneClient();

		// Native ETH payment (always available)
		options.push({
			method: 'native',
			available: true,
			label: 'Pay with ETH',
			description: 'Standard gas payment using ETH'
		});

		// ERC20 gas payment - user pays with USDC (Base only)
		// This uses Rhinestone's feeAsset feature
		if (chainId === 8453) {
			// Base mainnet
			options.push({
				method: 'erc20',
				available: true,
				label: 'Pay with USDC',
				description: 'Pay gas fees using USDC from your balance',
				feeAsset: 'USDC'
			});
		}

		// Sponsored gas (via Rhinestone native sponsorship)
		// Requires: deposit USDC to sponsorship wallet + set PUBLIC_RHINESTONE_SPONSORSHIP_ENABLED=true
		if (rhinestoneClient.isSponsorshipEnabled()) {
			options.push({
				method: 'sponsored',
				available: true,
				label: 'Sponsored',
				description: 'Gas fees sponsored (free for you)'
			});
		}

		return options;
	}

	/**
	 * Select gas payment method
	 */
	async selectGasPaymentMethod(
		_walletAddress: Address,
		chainId: SupportedNetworkId,
		preferredMethod: 'native' | 'erc20' | 'sponsored'
	): Promise<GasPaymentMethod> {
		const rhinestoneClient = getRhinestoneClient();

		if (preferredMethod === 'sponsored' && rhinestoneClient.isSponsorshipEnabled()) {
			return { type: 'sponsored' };
		}

		if (preferredMethod === 'erc20' && chainId === 8453) {
			return { type: 'erc20', feeAsset: 'USDC' };
		}

		return { type: 'native' };
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let orchestratorInstance: AccountAbstractionOrchestrator | null = null;

/**
 * Get the AA orchestrator singleton
 */
export function getAAOrchestrator(): AccountAbstractionOrchestrator {
	if (!orchestratorInstance) {
		orchestratorInstance = new AccountAbstractionOrchestrator();
	}
	return orchestratorInstance;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if AA features are available
 */
export function isAAAvailable(): boolean {
	return isRhinestoneConfigured();
}

/**
 * Get a summary of AA feature availability
 */
export function getAAFeatureStatus(): {
	crossChainSwaps: boolean;
	gasSponsorship: boolean;
	eip7702: boolean;
} {
	const rhinestoneClient = getRhinestoneClient();

	return {
		crossChainSwaps: isRhinestoneConfigured(),
		gasSponsorship: rhinestoneClient.isSponsorshipEnabled(),
		eip7702: supportsEIP7702()
	};
}
