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
 * Format USD currency with K suffix for large values
 */
export function formatUsd(amount: number): string {
	if (amount >= 1000) {
		return '$' + (amount / 1000).toFixed(1) + 'K';
	}
	return '$' + amount.toFixed(2);
}

/**
 * Format points with M/K suffixes
 */
export function formatPoints(points: number): string {
	if (points >= 1_000_000) {
		return (points / 1_000_000).toFixed(1) + 'M';
	}
	if (points >= 1_000) {
		return (points / 1_000).toFixed(1) + 'K';
	}
	return Math.round(points).toLocaleString('en-US');
}

/**
 * Format APY percentage with K suffix for large values
 */
export function formatApy(apy: number | null): string {
	if (apy === null || apy === 0) return '-';
	if (apy >= 1000) {
		return (apy / 1000).toFixed(1) + 'K%';
	}
	if (apy >= 100) {
		return Math.round(apy) + '%';
	}
	return apy.toFixed(1) + '%';
}
