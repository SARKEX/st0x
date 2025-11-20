/**
 * Order Perspective Types
 *
 * This module defines clear types for different perspectives when working with orders:
 * - Maker perspective: The order placed on the orderbook (what order receives/gives)
 * - Taker perspective: The user executing against the orderbook (what user wants/pays)
 */

/**
 * Minimal token interface for order perspective types
 */
export interface Token {
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
	orderInputToken: Token;   // What the order receives (on-chain INPUT)
	orderOutputToken: Token;  // What the order gives away (on-chain OUTPUT)
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
	takerWants: Token;  // What the user wants to receive
	takerPays: Token;   // What the user will give away
}

/**
 * Complete taker order information including which maker side to cross
 */
export interface TakerOrderInfo extends TakerOrderTokens {
	userAction: UserAction;      // 'Buy' | 'Sell' (UI-level action)
	crossingSide: OrderSide;     // Which maker side we're taking from ('bid' | 'ask')
	crossingDescription: string; // Human-readable description
}

/**
 * Trade result tokens (what actually happened)
 */
export interface TradeResultTokens {
	takerReceivedToken: Token;  // Token user received
	takerGaveToken: Token;      // Token user gave
	takerReceived: bigint;      // Amount received
	takerGave: bigint;          // Amount given
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
	assetToken: Token,
	paymentToken: Token
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
	orderInputToken: Token,
	orderOutputToken: Token,
	paymentToken: Token
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
	paymentToken: Token
): TakerOrderTokens {
	const side = deriveMakerSide(maker.orderInputToken, maker.orderOutputToken, paymentToken);

	if (side === 'bid') {
		// BID maker: has asset as input, USDC as output
		// Taker would SELL asset to this maker
		return {
			takerWants: maker.orderOutputToken, // USDC
			takerPays: maker.orderInputToken    // asset
		};
	} else {
		// ASK maker: has USDC as input, asset as output
		// Taker would BUY asset from this maker
		return {
			takerWants: maker.orderOutputToken, // asset
			takerPays: maker.orderInputToken    // USDC
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
		orderInputToken: taker.takerWants,  // What order receives = what taker wants
		orderOutputToken: taker.takerPays   // What order gives = what taker pays
	};
}
