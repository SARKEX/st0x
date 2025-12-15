/**
 * Account Abstraction Orchestrator
 *
 * Central coordinator for Rhinestone-based account abstraction:
 * - Cross-chain swap orchestration
 * - Gas sponsorship via Rhinestone paymaster
 * - Trade execution with AA features
 */

import type { Address, Hash } from 'viem';
import {
	type PaymentToken,
	type TradeWithAAParams,
	type TradeExecutionResult,
	type ExecutionStep,
	type GasEstimate,
	type SupportedNetworkId,
	SUPPORTED_NETWORKS,
	SETTLEMENT_CHAIN_ID,
	AAError,
	AAErrorCode
} from './types';

// Import sub-services
import { getRhinestoneClient, isRhinestoneConfigured } from './rhinestone/client';
import {
	getSwapToSettlementQuote,
	getSwapFromSettlementQuote,
	isSwapRequired,
	validateSwap
} from './rhinestone/swaps';
import { getWalletCapabilities, supportsEIP7702, isPrivyWalletReady } from './wallets/privy-7702';
import { USDC_BASE, getDefaultPaymentToken } from './tokens';

// =============================================================================
// Types
// =============================================================================

export interface GasPaymentOption {
	method: 'native' | 'sponsored';
	available: boolean;
	label: string;
	description: string;
	estimatedCost?: string;
}

export interface GasPaymentMethod {
	type: 'native' | 'sponsored';
	paymasterAddress?: Address;
}

// =============================================================================
// Main Orchestrator Class
// =============================================================================

export class AccountAbstractionOrchestrator {
	/**
	 * Execute a trade with account abstraction features
	 *
	 * This handles:
	 * 1. Cross-chain swaps if source token is on different chain
	 * 2. Gas sponsorship via Rhinestone paymaster (if configured)
	 * 3. Trade execution
	 */
	async executeTrade(params: TradeWithAAParams): Promise<TradeExecutionResult> {
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
			let crossChainTxHash: Hash | undefined;

			if (this.needsCrossChainSwap(params.sourceToken, SETTLEMENT_CHAIN_ID)) {
				steps.push({
					type: 'bridge',
					status: 'pending',
					chainId: params.sourceToken.chainId,
					description: `Swapping ${params.sourceToken.symbol} to USDC on Base`
				});

				// Get swap quote
				const quote = await getSwapToSettlementQuote(
					params.sourceToken,
					params.sourceAmount,
					params.walletAddress
				);

				steps[steps.length - 1].status = 'executing';

				// TODO: Execute actual cross-chain swap via Rhinestone
				if (!isRhinestoneConfigured()) {
					return {
						success: false,
						error: 'Cross-chain swaps require Rhinestone API key configuration',
						executionSteps: steps
					};
				}

				// Update settlement amount from quote
				settlementAmount = quote.outputAmount;
				steps[steps.length - 1].status = 'confirmed';
			}

			// Step 3: Execute the actual trade on Base
			steps.push({
				type: 'trade',
				status: 'executing',
				chainId: SETTLEMENT_CHAIN_ID,
				description: params.tradeType === 'buy' ? 'Buying tStock' : 'Selling tStock'
			});

			// TODO: Integrate with existing market order execution
			// This should hook into marketOrderExecution.ts
			return {
				success: false,
				error: 'Trade execution integration pending - use existing trade flow for now',
				executionSteps: steps
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
	 * Estimate gas for a trade
	 */
	async estimateTradeGas(params: TradeWithAAParams): Promise<GasEstimate> {
		// Base gas estimate for a typical trade
		let totalGasLimit = 300000n; // Base trade gas

		// Add cross-chain swap gas if needed
		if (this.needsCrossChainSwap(params.sourceToken, SETTLEMENT_CHAIN_ID)) {
			totalGasLimit += 200000n; // Additional for cross-chain coordination
		}

		// Add approval gas if first trade
		totalGasLimit += 50000n; // ERC20 approval

		// Current gas prices (simplified - should use actual gas oracle)
		const maxFeePerGas = 1000000000n; // 1 gwei
		const maxPriorityFeePerGas = 100000000n; // 0.1 gwei

		const estimatedGasCostWei = totalGasLimit * maxFeePerGas;

		// Convert to USDC (assuming ~$3500 ETH)
		const ETH_PRICE_USD = 3500n;
		const estimatedGasCostUSDC = (estimatedGasCostWei * ETH_PRICE_USD * 10n ** 6n) / 10n ** 18n;

		return {
			gasLimit: totalGasLimit,
			maxFeePerGas,
			maxPriorityFeePerGas,
			estimatedGasCostWei,
			estimatedGasCostUSDC
		};
	}

	/**
	 * Check if a cross-chain swap is needed
	 */
	needsCrossChainSwap(
		sourceToken: PaymentToken,
		targetChainId: SupportedNetworkId
	): boolean {
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
	 * Prepare a cross-chain swap (get quote and check approvals)
	 */
	async prepareCrossChainSwap(
		sourceToken: PaymentToken,
		amount: bigint,
		recipient: Address
	): Promise<{
		quote: unknown;
		approvalNeeded: boolean;
		approvalAmount?: bigint;
	}> {
		const quote = await getSwapToSettlementQuote(sourceToken, amount, recipient);

		return {
			quote,
			approvalNeeded: true, // Assume approval needed for now
			approvalAmount: amount
		};
	}

	/**
	 * Get available gas payment options
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

		// Sponsored gas (via Rhinestone paymaster)
		if (rhinestoneClient.hasPaymasterConfig()) {
			options.push({
				method: 'sponsored',
				available: true,
				label: 'Sponsored',
				description: 'Gas fees sponsored via Rhinestone paymaster'
			});
		} else {
			options.push({
				method: 'sponsored',
				available: false,
				label: 'Sponsored',
				description: 'Requires Rhinestone paymaster configuration'
			});
		}

		return options;
	}

	/**
	 * Select gas payment method
	 */
	async selectGasPaymentMethod(
		walletAddress: Address,
		chainId: SupportedNetworkId,
		preferredMethod: 'native' | 'sponsored'
	): Promise<GasPaymentMethod> {
		const rhinestoneClient = getRhinestoneClient();

		if (preferredMethod === 'sponsored' && rhinestoneClient.hasPaymasterConfig()) {
			return { type: 'sponsored' };
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
		gasSponsorship: rhinestoneClient.hasPaymasterConfig(),
		eip7702: supportsEIP7702()
	};
}
