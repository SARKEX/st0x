/**
 * Format utilities to replace duplicate code across the app
 */

import { formatUnits } from 'viem';

const ETH_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;

/**
 * Format a token amount for display or analytics without throwing.
 * viem's formatUnits calls value.toString(); an undefined amount after a
 * failed trade (cleared bound input) otherwise crashes the failure path.
 */
export function formatUnitsSafe(
	amount: bigint | null | undefined,
	decimals: number | null | undefined
): string {
	if (amount === undefined || amount === null) return '0';
	if (typeof decimals !== 'number' || !Number.isFinite(decimals) || decimals < 0) return '0';
	try {
		return formatUnits(amount, decimals);
	} catch {
		return '0';
	}
}

/**
 * Validate an Ethereum address (0x + 40 hex chars, case-insensitive)
 */
export function isValidEthAddress(address: string): boolean {
	return ETH_ADDRESS_RE.test(address);
}

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
