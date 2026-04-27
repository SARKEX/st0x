/**
 * Transaction parameter types for type-safe interaction with transactionStore
 */

import type { OrderV4 } from '@rainlanguage/orderbook';
import type { WalkQuotesResult } from '$lib/utils/orderbook';
import type { MinimalToken } from '$lib/types/orderPerspective';

/**
 * Token information for transaction display and processing
 * Alias for MinimalToken to maintain backward compatibility
 */
export type TokenInfo = MinimalToken;

/**
 * Simulation result from orderbook walk
 * This is essentially the same as WalkQuotesResult
 */
export type OrderSimulation = WalkQuotesResult;

/**
 * Parameters for executing a market order (taking orders from orderbook)
 *
 * Perspective: TAKER (user executing against orderbook)
 * - takerWantsToken: What the user wants to RECEIVE
 * - takerPaysToken: What the user will GIVE AWAY
 * - requestedTakerWantsAmount: Amount user wants to receive
 * - requestedTakerPaysAmount: Amount user wants to give away (set when the user typed
 *   their order in the pays direction, e.g. Sell-by-asset or Buy-by-spend; controls
 *   which side anchors partial-fill detection)
 */
export interface TakeOrdersParams {
	// Order identification
	orderData: OrderV4;
	ioIndexes: {
		input: number; // Index of input token in order's validInputs
		output: number; // Index of output token in order's validOutputs
	};

	// Taker perspective - what user wants vs what they pay
	takerWantsToken: TokenInfo; // What user RECEIVES (input from order perspective)
	takerPaysToken: TokenInfo; // What user GIVES (output from order perspective)

	// Requested amount
	requestedTakerWantsAmount: bigint; // Amount user wants to receive
	/**
	 * Optional: amount user wants to give away. When defined, partial-fill detection
	 * compares actual paid vs this value (correct anchor for `spendUpTo` modes). When
	 * undefined, falls back to comparing actual received vs `requestedTakerWantsAmount`
	 * (correct for `buyUpTo` modes).
	 */
	requestedTakerPaysAmount?: bigint;

	// Optional: pre-calculated simulation for validation
	simulation?: OrderSimulation;

	// Optional: per-order fill amounts (parallel to orders array in TakeOrdersConfigV5)
	// Used for calculating per-batch maximumIO when splitting large orders
	orderFillAmounts?: bigint[];

	// Decimal precision of orderFillAmounts values.
	// When IOIsInput=true (Buy+amount): input token decimals (takerWantsToken)
	// When IOIsInput=false (Buy+spend, Sell): output token decimals (takerPaysToken)
	orderFillDecimals?: number;

	/**
	 * Total payer-token allowance (wei) needed for **all** legs of a batched market take.
	 * When set, multi-leg flows can approve once instead of per `getTakeCalldata` leg.
	 */
	requiredPayerAllowance?: bigint;
}
