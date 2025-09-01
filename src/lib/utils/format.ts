/**
 * Format utilities to replace duplicate code across the app
 */

/**
 * Truncate an Ethereum address to show first 6 and last 4 characters
 */
export function truncateAddress(address: string): string {
	if (!address) return '';
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a number with commas and decimal places
 */
export function formatNumber(value: number, decimals: number = 2): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(value);
}

/**
 * Format a USD price
 */
export function formatUSD(value: number, decimals: number = 2): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(value);
}

/**
 * Format a percentage with + or - sign
 */
export function formatPercent(value: number, decimals: number = 2): string {
	const sign = value >= 0 ? '+' : '';
	return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatCompact(value: number): string {
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(2)}B`;
	} else if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(2)}M`;
	} else if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}
	return value.toFixed(2);
}