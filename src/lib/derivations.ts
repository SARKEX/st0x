/**
 * Utility functions for derived calculations
 */

import type { Token } from 'sushi';

/**
 * For limit order strategies, convert user-specified price to the orderbook IO ratio.
 *
 * Bid orders (user buying): User specifies price as "I pay X per 1 asset"
 *   → This becomes ratio = 1/X in orderbook terms (output/input)
 *   → So the price must be inverted
 *
 * Ask orders (user selling): User specifies price as "I get X per 1 asset"
 *   → This becomes ratio = X/1 = X in orderbook terms (output/input)
 *   → So the price remains unchanged
 *
 * (unless the provided ratio is invalid or zero)
 */
export function getBaseline(orderType: 'Bid' | 'Ask', ratio: string): string {
	const r = (ratio ?? '').toString().trim();
	if (!r) return '';
	if (orderType === 'Bid') {
		const n = Number(r);
		if (!Number.isFinite(n) || n === 0) return r;
		const inverted = 1 / n;
		return inverted.toString();
	}
	return r;
}

/**
 * Convert period and unit to seconds
 */
export function getPeriodInSeconds(period: string, unit: 'Days' | 'Hours' | 'Minutes'): number {
	const periodNum = parseInt(period) || 0;

	switch (unit) {
		case 'Days':
			return periodNum * 24 * 60 * 60;
		case 'Hours':
			return periodNum * 60 * 60;
		case 'Minutes':
			return periodNum * 60;
		default:
			return 0;
	}
}

/**
 * Check if a token has a valid Pyth price feed ID
 */
type MaybePythToken = Token & { priceFeedId?: string };

export function hasValidPriceFeedId(token: Token | MaybePythToken | undefined): boolean {
	if (!token) return false;
	const maybe = token as MaybePythToken;
	const feedId = maybe.priceFeedId;
	return !!feedId && feedId !== '' && feedId !== '0x';
}
