/**
 * Client-side Base RPC URL ordering for wagmi transports.
 *
 * svelte-wagmi's defaultConfig uses bare `http()`, which falls through to
 * public chain RPCs (e.g. mainnet.base.org) and rate-limits under load.
 * Use {@link getClientRpcUrls} with viem `fallback([...])` so the browser
 * follows the active registry's ordered RPC list.
 */

import { fallback, http, type Transport } from 'viem';

/**
 * Run one retry round after every configured provider has failed once.
 *
 * Rate-limit retries live here, rather than in the app-level `withRetry`,
 * so a logical read cannot multiply two independent retry loops.
 */
export const CLIENT_RPC_RETRY_OPTIONS = {
	retryCount: 1,
	retryDelay: 1000,
	rank: false
} as const;

function getRpcUrlKey(value: string): string {
	const parsed = new URL(value);
	parsed.hash = '';
	return parsed.href;
}

/**
 * Ordered, de-duplicated RPC URLs for browser wagmi transports.
 * The registry's first URL remains first.
 */
export function getClientRpcUrls(ordered: readonly string[]): string[] {
	const seen = new Set<string>();
	const urls: string[] = [];
	for (const url of ordered) {
		const key = getRpcUrlKey(url);
		if (seen.has(key)) continue;
		seen.add(key);
		urls.push(url);
	}
	if (urls.length === 0) {
		throw new Error('At least one client RPC URL is required');
	}
	return urls;
}

/** Build the bounded fallback used by browser-side wagmi reads. */
export function createClientRpcFallback(transports: Transport[]): Transport {
	return fallback(transports, CLIENT_RPC_RETRY_OPTIONS);
}

/** Build HTTP transports for the configured browser RPC URL order. */
export function createClientRpcTransport(urls: readonly string[]): Transport {
	return createClientRpcFallback(getClientRpcUrls(urls).map((url) => http(url)));
}
