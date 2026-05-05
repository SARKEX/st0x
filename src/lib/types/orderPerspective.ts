/**
 * Order Perspective Types
 *
 * This module defines clear types for different perspectives when working with orders:
 * - Maker perspective: The order placed on the orderbook (what order receives/gives)
 * - Taker perspective: The user executing against the orderbook (what user wants/pays)
 */

/**
 * Minimal token interface for order perspective types
 * Subset of full Token from $lib/types - only includes fields needed for order calculations
 */
export interface MinimalToken {
	address: string;
	decimals: number;
	symbol: string;
}

/**
 * User-facing action (UI layer)
 */
export type UserAction = 'Buy' | 'Sell';

/**
 * Market side from orderbook perspective
 */
export type OrderSide = 'bid' | 'ask';

/**
 * Maker order tokens (from order's perspective)
 *
 * This represents what the ORDER receives and gives (on-chain perspective).
 *
 * Example BID order (buying asset):
 *   - orderInputToken: asset (order receives asset)
 *   - orderOutputToken: USDC (order gives USDC)
 *
 * Example ASK order (selling asset):
 *   - orderInputToken: USDC (order receives USDC)
 *   - orderOutputToken: asset (order gives asset)
 */
export interface MakerOrderTokens {
	orderInputToken: MinimalToken; // What the order receives (on-chain INPUT)
	orderOutputToken: MinimalToken; // What the order gives away (on-chain OUTPUT)
}

/**
 * Taker order tokens (from user's perspective)
 *
 * This represents what the USER wants to receive and is willing to pay.
 *
 * Example BUY action:
 *   - takerWants: asset (user wants to receive asset)
 *   - takerPays: USDC (user pays with USDC)
 *
 * Example SELL action:
 *   - takerWants: USDC (user wants to receive USDC)
 *   - takerPays: asset (user pays with asset)
 */
export interface TakerOrderTokens {
	takerWants: MinimalToken; // What the user wants to receive
	takerPays: MinimalToken; // What the user will give away
}

/**
 * Complete taker order information including which maker side to cross
 */
export interface TakerOrderInfo extends TakerOrderTokens {
	userAction: UserAction; // 'Buy' | 'Sell' (UI-level action)
	crossingSide: OrderSide; // Which maker side we're taking from ('bid' | 'ask')
	crossingDescription: string; // Human-readable description
}

/**
 * Trade result tokens (what actually happened)
 */
export interface TradeResultTokens {
	takerReceivedToken: MinimalToken; // Token user received
	takerGaveToken: MinimalToken; // Token user gave
	takerReceived: bigint; // Amount received
	takerGave: bigint; // Amount given
}

/**
 * Converts user action and tokens to taker order information
 *
 * @param userAction - 'Buy' or 'Sell'
 * @param assetToken - The non-settlement token (e.g., tSTOX)
 * @param paymentToken - The settlement token (e.g., USDC)
 * @returns Complete taker order information
 */
export function getUserTakerInfo(
	userAction: UserAction,
	assetToken: MinimalToken,
	paymentToken: MinimalToken
): TakerOrderInfo {
	if (userAction === 'Buy') {
		return {
			takerWants: assetToken,
			takerPays: paymentToken,
			userAction: 'Buy',
			crossingSide: 'ask', // Taking from sellers (ask orders)
			crossingDescription: 'Taking asks to buy asset'
		};
	} else {
		return {
			takerWants: paymentToken,
			takerPays: assetToken,
			userAction: 'Sell',
			crossingSide: 'bid', // Taking from buyers (bid orders)
			crossingDescription: 'Taking bids to sell asset'
		};
	}
}

/**
 * Derives the order side from token positions (maker perspective)
 *
 * Rules:
 * - If USDC/payment token is OUTPUT → BID order (buying asset, giving USDC)
 * - If USDC/payment token is INPUT → ASK order (selling asset, getting USDC)
 *
 * @param orderInputToken - What the order receives
 * @param orderOutputToken - What the order gives
 * @param paymentToken - The settlement token (e.g., USDC)
 * @returns 'bid' or 'ask'
 */
export function deriveMakerSide(
	orderInputToken: MinimalToken,
	orderOutputToken: MinimalToken,
	paymentToken: MinimalToken
): OrderSide {
	const paymentAddress = paymentToken.address.toLowerCase();
	const outputAddress = orderOutputToken.address.toLowerCase();

	// If payment token is OUTPUT, this is a BID (buying asset, giving USDC)
	if (outputAddress === paymentAddress) {
		return 'bid';
	}

	// Otherwise, payment token is INPUT, this is ASK (selling asset, getting USDC)
	return 'ask';
}

/**
 * Converts maker order tokens to the equivalent taker perspective
 *
 * For a BID maker order (input=asset, output=USDC):
 *   - From taker's perspective, they would SELL the asset
 *   - takerWants: USDC, takerPays: asset
 *
 * For an ASK maker order (input=USDC, output=asset):
 *   - From taker's perspective, they would BUY the asset
 *   - takerWants: asset, takerPays: USDC
 *
 * @param maker - Maker order tokens
 * @param paymentToken - The settlement token
 * @returns Taker order tokens
 */
export function makerToTakerTokens(
	maker: MakerOrderTokens,
	paymentToken: MinimalToken
): TakerOrderTokens {
	const side = deriveMakerSide(maker.orderInputToken, maker.orderOutputToken, paymentToken);

	if (side === 'bid') {
		// BID maker: has asset as input, USDC as output
		// Taker would SELL asset to this maker
		return {
			takerWants: maker.orderOutputToken, // USDC
			takerPays: maker.orderInputToken // asset
		};
	} else {
		// ASK maker: has USDC as input, asset as output
		// Taker would BUY asset from this maker
		return {
			takerWants: maker.orderOutputToken, // asset
			takerPays: maker.orderInputToken // USDC
		};
	}
}

/**
 * Converts taker perspective to maker order tokens
 *
 * This is the inverse of makerToTakerTokens.
 *
 * @param taker - Taker order tokens
 * @returns Maker order tokens
 */
export function takerToMakerTokens(taker: TakerOrderTokens): MakerOrderTokens {
	return {
		orderInputToken: taker.takerWants, // What order receives = what taker wants
		orderOutputToken: taker.takerPays // What order gives = what taker pays
	};
}

// ============================================================================
// TRADE-01: Canonical accessor wrappers for IO-perspective fields
// ============================================================================
//
// These wrappers are the single boundary through which non-allowlisted code
// reads `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` /
// `outputIOIndex` on any maker-shaped object (ProcessedQuote, the inline
// types in transaction.ts:handleRemoveOrder, QuoteLike from tokenMath.ts,
// TakeOrderConfigV4 from the SDK, etc.). The ESLint `no-restricted-syntax`
// rule (eslint.config.js) forbids direct `.inputTokenAddress` /
// `.outputTokenAddress` / `.inputIOIndex` / `.outputIOIndex` MemberExpression
// reads outside the allowlist (this file + utils/orderbook.ts + api/orders.ts
// + generated-graphql.ts). The wrapper bodies below ARE legal raw reads
// because this file is the canonical IO-perspective access boundary.
//
// Naming: `getMaker...` reflects that these fields are the on-chain order
// (maker) perspective — `inputTokenAddress` is what the order RECEIVES,
// `outputTokenAddress` is what it GIVES AWAY (CLAUDE.md §"Order Semantics").
//
// Type design: each accessor takes a structural type with only the field it
// reads. This lets the helpers serve the multiple receiver shapes that exist
// today (ProcessedQuote, partial inline shapes, TakeOrderConfigV4, etc.)
// without forcing all receivers to widen to ProcessedQuote. The structural
// types accept `string | undefined` for addresses so callers preserving
// optional-field semantics (e.g. handleRemoveOrder) don't lose them at the
// boundary; the return type matches the field's declared type.

/**
 * Read maker INPUT token address from any object that has one.
 *
 * Use this instead of direct `.inputTokenAddress` access to keep the
 * IO-perspective boundary structurally enforced by ESLint. Field-only
 * generics let the wrapper serve every receiver shape the codebase has —
 * `ProcessedQuote` (string), the inline `handleRemoveOrder` shape
 * (`string?`), `QuoteLike` (string), and partial fixtures in tests — without
 * forcing all of them to widen to one interface.
 *
 * Returns whatever type the field has on the receiver (string for full
 * `ProcessedQuote`, `string | undefined` for optional fields, etc.).
 *
 * @param quote - any object with an `inputTokenAddress` field
 * @returns the value of the `inputTokenAddress` field
 */
export function getMakerInputTokenAddress<T extends { inputTokenAddress?: unknown }>(
	quote: T
): T['inputTokenAddress'] {
	return quote.inputTokenAddress;
}

/**
 * Read maker OUTPUT token address from any object that has one.
 *
 * @param quote - any object with an `outputTokenAddress` field
 * @returns the value of the `outputTokenAddress` field
 */
export function getMakerOutputTokenAddress<T extends { outputTokenAddress?: unknown }>(
	quote: T
): T['outputTokenAddress'] {
	return quote.outputTokenAddress;
}

/**
 * Read input IO-index from any object that has one.
 *
 * Receiver shapes the codebase exposes: `ProcessedQuote` (number),
 * `TakeOrderConfigV4` from the SDK (string). The wrapper is type-transparent
 * — it returns whatever the field is declared as on the receiver type.
 *
 * @param quote - any object with an `inputIOIndex` field
 * @returns the value of the `inputIOIndex` field
 */
export function getMakerInputIOIndex<T extends { inputIOIndex?: unknown }>(
	quote: T
): T['inputIOIndex'] {
	return quote.inputIOIndex;
}

/**
 * Read output IO-index from any object that has one.
 *
 * @param quote - any object with an `outputIOIndex` field
 * @returns the value of the `outputIOIndex` field
 */
export function getMakerOutputIOIndex<T extends { outputIOIndex?: unknown }>(
	quote: T
): T['outputIOIndex'] {
	return quote.outputIOIndex;
}
