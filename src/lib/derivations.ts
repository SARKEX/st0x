/**
 * Utility functions for derived calculations
 */

import type { Token } from 'sushi';

/**
 * For limit strategies, return the baseline IO ratio to use.
 * Buy orders pass through unchanged, while Sell orders return the inverse
 * (unless the provided ratio is invalid or zero).
 */
export function getBaseline(orderType: 'Buy' | 'Sell', ratio: string): string {
	const r = (ratio ?? '').toString().trim();
	if (!r) return '';
	if (orderType === 'Sell') {
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
