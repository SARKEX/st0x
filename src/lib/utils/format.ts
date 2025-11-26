/**
 * Format utilities to replace duplicate code across the app
 */

/**
 * Truncate an Ethereum address to show first 7 and last 4 characters
 */
export function truncateAddress(address: string): string {
	if (!address || address.length <= 30) return ''; // Not a real address
	let prefix = address.slice(0, 6);
	if (/[a-zA-Z]$/.test(prefix) && address.length > prefix.length) {
		prefix = address.slice(0, 7);
	}
	const suffixLength = address.length <= 14 ? 5 : 4;
	const suffix = address.slice(-suffixLength);
	return `${prefix}...${suffix}`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatCompact(value: number): string {
	const isNegative = value < 0;
	const absValue = Math.abs(value);
	let formatted: string;

	if (!Number.isFinite(value)) {
		return String(value);
	}

	if (absValue >= 1_000_000_000) {
		formatted = `${(absValue / 1_000_000_000).toFixed(2)}B`;
	} else if (absValue >= 1_000_000) {
		formatted = `${(absValue / 1_000_000).toFixed(2)}M`;
	} else if (absValue >= 1_000) {
		formatted = `${(absValue / 1_000).toFixed(1)}K`;
	} else {
		formatted = absValue.toFixed(2);
	}

	return isNegative ? `-${formatted}` : formatted;
}
