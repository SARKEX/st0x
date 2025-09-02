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