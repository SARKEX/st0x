/**
 * Utility functions for derived calculations
 */

import type { Token } from '$lib/types';

/**
 * For limit order strategies, convert user-specified price to the orderbook IO ratio.
 *
 * Bid orders (user buying): User specifies price as "I pay X per 1 asset"
 *   → This is (output/input) in orderbook terms since X is the output
 *   → So the price must be inverted to IORatio
 *
 * Ask orders (user selling): User specifies price as "I get X per 1 asset"
 *   → This is naturally IOratio as X is the input
 *   → So the price remains unchanged
 *
 * @param orderType - 'Bid' or 'Ask'
 * @param ratio - The price as a string
 * @param formatTo18Decimals - If true, formats result to 18 decimals and removes trailing zeros
 * @returns The IO ratio as a string
 */
export function priceToIoratioString(
	orderType: 'Bid' | 'Ask',
	ratio: string,
	formatTo18Decimals: boolean = false
): string {
	const r = (ratio ?? '').toString().trim();
	if (!r) return '';

	const n = Number(r);
	if (!Number.isFinite(n)) return r;

	let result: number;
	if (orderType === 'Bid') {
		if (n === 0) return r;
		result = 1 / n;
	} else {
		result = n;
	}

	if (formatTo18Decimals) {
		// Format to 18 decimals and remove trailing zeros
		return result
			.toFixed(18)
			.replace(/\.0+$/, '')
			.replace(/\.(.*?)(0+)$/, (m, p1) => (p1 ? `.${p1}`.replace(/\.$/, '') : ''))
			.replace(/\.$/, '');
	}

	return result.toString();
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

/** Whether the retained REST market-price service covers this token. */
export function hasMarketPrice(token: (Token & { category?: string }) | undefined): boolean {
	return token?.category === 'ST0x';
}
