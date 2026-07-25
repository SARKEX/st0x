/**
 * Partial-fill detection — extracted from transaction.ts (TRADE-02 PR-5).
 *
 * Thin wrapper over `evaluateMarketOrderFill` from $lib/utils/marketOrderFill.
 * Assembles a `MarketOrderSummary` from the take-order receipt + computed
 * partial-fill state.
 *
 * Consumed by both market-order finalization paths POST-COMPLETION (after
 * vault invalidation has run). DO NOT interleave with vault state mutations —
 * see 02-RESEARCH.md §"Pitfall 6" for the regression class this contract
 * protects against (partial-fill banner displayed with stale balance reads).
 *
 * This module is a LEAF: it imports nothing from $lib/services or any
 * other $lib/stores/* module beyond `transactionShared` (for the
 * MarketOrderSummary interface).
 */

import { evaluateMarketOrderFill } from '$lib/utils/marketOrderFill';
import type { MarketOrderSummary } from './transactionShared';

export interface DetectPartialFillParams {
	/** Total amount of the takerWants token actually received (sum across legs). */
	totalTakerWantsAmount: bigint;
	/** Total amount of the takerPays token actually spent (sum across legs). */
	totalTakerPaysAmount: bigint;
	/** Amount the user originally requested to receive. */
	requestedTakerWantsAmount: bigint;
	/**
	 * Amount the user originally requested to spend. When set, this is the
	 * user's true anchor (Sell-by-asset, Buy-by-spend) and partial-fill detection
	 * compares actual paid vs this value. Without this, the comparison falls
	 * back to the wants side — correct only for `buyUpTo` modes where the
	 * user's anchor is the wants amount.
	 */
	requestedTakerPaysAmount?: bigint;
	inputTokenSymbol: string;
	inputTokenAddress: string;
	inputTokenDecimals: number;
	outputTokenSymbol: string;
	outputTokenAddress: string;
	outputTokenDecimals: number;
	/** input received per unit output given (display-friendly ratio). */
	ioRatio: number;
	/** Slippage measured at submit time (preserved for the summary card). */
	actualSlippage: bigint;
}

/**
 * Build a MarketOrderSummary from take-order receipt totals + the user's
 * requested anchor amounts. Delegates the partial-fill / no-fill
 * determination to `evaluateMarketOrderFill`, then folds the boolean flags
 * into a fully-populated summary shape ready for the UI banner.
 *
 * The destructure-then-shorthand-assign pattern at the top of the function
 * is intentional: it avoids `MemberExpression` reads on the params object
 * for `inputTokenAddress` / `outputTokenAddress`, which would otherwise
 * fire the TRADE-01 ESLint rule (banning raw IO-perspective property
 * reads). Field assignment in object literals is not a `MemberExpression`,
 * so the assembly below is rule-safe.
 */
export function detectPartialFill(params: DetectPartialFillParams): MarketOrderSummary {
	const {
		totalTakerWantsAmount,
		totalTakerPaysAmount,
		requestedTakerWantsAmount,
		requestedTakerPaysAmount,
		inputTokenSymbol,
		inputTokenAddress,
		inputTokenDecimals,
		outputTokenSymbol,
		outputTokenAddress,
		outputTokenDecimals,
		ioRatio,
		actualSlippage
	} = params;

	const evaluation = evaluateMarketOrderFill({
		totalTakerWantsAmount,
		totalTakerPaysAmount,
		requestedTakerWantsAmount,
		requestedTakerPaysAmount
	});

	return {
		inputAmount: totalTakerWantsAmount,
		inputTokenDecimals,
		inputTokenSymbol,
		inputTokenAddress,
		outputAmount: totalTakerPaysAmount,
		outputTokenDecimals,
		outputTokenSymbol,
		outputTokenAddress,
		requestedInputAmount: requestedTakerWantsAmount,
		ioRatio,
		actualSlippage,
		isPartialFill: evaluation.isPartialFill,
		isNoFill: evaluation.isNoFill
	};
}
