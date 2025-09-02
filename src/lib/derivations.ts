/**
 * Utility functions for derived calculations
 */

import type { Token } from 'sushi/currency';

/**
 * For limit strategies, return the baseline IO ratio to use.
 * Currently acts as a pass-through for Buy orders; for Sell orders, also pass-through
 * to avoid unintended price inversion. Adjust here if Sell should invert in future.
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
export function hasValidPriceFeedId(token: Token | undefined): boolean {
	if (!token) return false;
	// Check if token has priceFeedId property and it's not empty
	const feedId = (token as any).priceFeedId;
	return !!feedId && feedId !== '' && feedId !== '0x';
}
