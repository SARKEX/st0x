/**
 * Pure helpers for market order slippage and fill evaluation.
 *
 * Extracted from marketOrderExecution.ts and transaction.ts so both can share
 * the same logic without circular imports, and so the logic is easily unit-tested.
 */

export const MIN_SLIPPAGE_BPS = 1;
export const MAX_SLIPPAGE_BPS = 5_000;
export const DEFAULT_MARKET_ORDER_SLIPPAGE_BPS = 100;

/** 99.7% threshold — below this counts as a partial fill (subgraph noise tolerance). */
export const MARKET_ORDER_FULL_FILL_THRESHOLD_BPS = 9970n;

export function clampSlippageBps(slippageBps: number): number {
	if (!Number.isFinite(slippageBps)) return DEFAULT_MARKET_ORDER_SLIPPAGE_BPS;
	return Math.max(MIN_SLIPPAGE_BPS, Math.min(MAX_SLIPPAGE_BPS, Math.round(slippageBps)));
}

/**
 * Convert user slippage tolerance into a ratio multiplier applied to the worst
 * simulated fill ratio. Used identically for Buy and Sell — the SDK's `priceCap`
 * is a single per-leg cap regardless of side.
 */
export function computeRatioMultiplier(slippageBps: number): string {
	const effective = clampSlippageBps(slippageBps);
	return String(1 + effective / 10_000);
}

export interface MarketOrderFillEvaluation {
	isNoFill: boolean;
	isPartialFill: boolean;
}

export interface MarketOrderFillInput {
	/** Actual amount of takerWants token received in this transaction (bigint, wants-token decimals). */
	totalTakerWantsAmount: bigint;
	/** Actual amount of takerPays token spent in this transaction (bigint, pays-token decimals). */
	totalTakerPaysAmount: bigint;
	/** Amount the user wanted to receive (bigint, wants-token decimals). */
	requestedTakerWantsAmount: bigint;
	/**
	 * Optional: amount the user wanted to give away (bigint, pays-token decimals).
	 * When set, this is the user's true anchor (Sell-by-asset, Buy-by-spend) and
	 * partial-fill detection compares actual paid vs this value. Without this, the
	 * comparison falls back to the wants side — correct only for `buyUpTo` modes
	 * where the user's anchor is the wants amount.
	 */
	requestedTakerPaysAmount?: bigint;
}

/**
 * Decide whether a market order fill is empty / partial / full.
 *
 * The "anchor" is the side the user typed their amount in:
 *   - Buy-by-asset (`buyUpTo`): anchor = wants (asset received)
 *   - Buy-by-spend (`spendUpTo` payment): anchor = pays (payment spent)
 *   - Sell-by-asset (`spendUpTo` asset): anchor = pays (asset sold)
 *
 * Comparing the wrong side conflates price slippage with quantity shortfall — e.g.
 * a Sell that fully sells the asset but at a worse price than simulated would be
 * incorrectly flagged as "partial quantity unavailable".
 */
export function evaluateMarketOrderFill(input: MarketOrderFillInput): MarketOrderFillEvaluation {
	const {
		totalTakerWantsAmount,
		totalTakerPaysAmount,
		requestedTakerWantsAmount,
		requestedTakerPaysAmount
	} = input;

	const usePaysAnchor = requestedTakerPaysAmount !== undefined && requestedTakerPaysAmount > 0n;
	const requested = usePaysAnchor
		? (requestedTakerPaysAmount as bigint)
		: requestedTakerWantsAmount;
	const actual = usePaysAnchor ? totalTakerPaysAmount : totalTakerWantsAmount;

	const isNoFill = requested <= 0n || actual <= 0n;
	const isPartialFill =
		!isNoFill && actual * 10_000n < requested * MARKET_ORDER_FULL_FILL_THRESHOLD_BPS;

	return { isNoFill, isPartialFill };
}
