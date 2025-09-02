/**
 * Utility functions for derived calculations
 */

import type { Token } from 'sushi/currency';

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