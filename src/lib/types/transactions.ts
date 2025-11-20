/**
 * Transaction parameter types for type-safe interaction with transactionStore
 */

import type { OrderV4 } from '@rainlanguage/orderbook';
import type { QuoteFill, WalkQuotesResult } from '$lib/utils/orderbook';

/**
 * Token information for transaction display and processing
 */
export interface TokenInfo {
	address: string;
	decimals: number;
	symbol: string;
}

/**
 * Re-export QuoteFill from orderbook utils for convenience
 */
export type { QuoteFill };

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
 */
export interface TakeOrdersParams {
	// Order identification
	orderData: OrderV4;
	ioIndexes: {
		input: number;   // Index of input token in order's validInputs
		output: number;  // Index of output token in order's validOutputs
	};

	// Taker perspective - what user wants vs what they pay
	takerWantsToken: TokenInfo;  // What user RECEIVES (input from order perspective)
	takerPaysToken: TokenInfo;   // What user GIVES (output from order perspective)

	// Requested amount
	requestedTakerWantsAmount: bigint;  // Amount user wants to receive

	// Optional: pre-calculated simulation for validation
	simulation?: OrderSimulation;
}

/**
 * Parameters for deploying a maker order (DCA, limit, etc.)
 *
 * Perspective: MAKER (placing order on orderbook)
 */
export interface DeployOrderParams {
	orderType: 'dca' | 'limit' | 'dsf' | 'folio';
	composedRainlang: string;
	deploymentArgs: unknown;  // From Rain SDK

	// Maker perspective
	orderInputToken: TokenInfo;   // What maker order receives
	orderOutputToken: TokenInfo;  // What maker order gives
}
