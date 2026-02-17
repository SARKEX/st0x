/**
 * RPC Configuration and Load Balancing Utilities
 *
 * Provides:
 * - Multiple fallback RPC endpoints per chain
 * - Round-robin load balancing across endpoints
 * - Automatic failover on 429 rate limits or errors
 * - Retry logic with exponential backoff
 */

import { http, fallback, type Transport } from 'viem';
import {
	type SupportedNetworkId,
	SUPPORTED_NETWORKS
} from '$lib/services/account-abstraction/types';

// =============================================================================
// RPC Configuration
// =============================================================================

/**
 * Multiple RPC endpoints per chain for load balancing and failover
 * Ordered by preference (most reliable first)
 */
export const RPC_ENDPOINTS: Record<SupportedNetworkId, string[]> = {
	[SUPPORTED_NETWORKS.BASE]: [
		'https://mainnet.base.org', // Official Base RPC
		'https://base-mainnet.g.alchemy.com/v2/y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9', // Alchemy
		'https://base.llamarpc.com', // LlamaNodes
		'https://base.meowrpc.com', // MeowRPC
		'https://base-mainnet.public.blastapi.io', // BlastAPI
		'https://gateway.tenderly.co/public/base', // Tenderly
		'https://base-rpc.publicnode.com' // PublicNode (rate limited, last resort)
	],
	[SUPPORTED_NETWORKS.ARBITRUM]: [
		'https://arb1.arbitrum.io/rpc', // Official Arbitrum RPC
		'https://arbitrum.llamarpc.com', // LlamaNodes
		'https://arbitrum-one.public.blastapi.io', // BlastAPI
		'https://arbitrum-one.publicnode.com' // PublicNode
	],
	[SUPPORTED_NETWORKS.OPTIMISM]: [
		'https://mainnet.optimism.io', // Official Optimism RPC
		'https://optimism.llamarpc.com', // LlamaNodes
		'https://optimism.publicnode.com', // PublicNode
		'https://optimism-mainnet.public.blastapi.io', // BlastAPI
		'https://rpc.ankr.com/optimism' // Ankr
	],
	[SUPPORTED_NETWORKS.ETHEREUM]: [
		'https://eth.llamarpc.com', // LlamaNodes
		'https://ethereum.publicnode.com', // PublicNode
		'https://rpc.ankr.com/eth', // Ankr
		'https://eth.meowrpc.com' // MeowRPC
	],
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: [
		'https://sepolia.base.org', // Official Base Sepolia
		'https://base-sepolia.publicnode.com' // PublicNode
	],
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: [
		'https://sepolia-rollup.arbitrum.io/rpc', // Official Arbitrum Sepolia
		'https://arbitrum-sepolia.publicnode.com' // PublicNode
	]
};

/**
 * Get the primary RPC URL for a chain (first in the list)
 */
export function getPrimaryRpcUrl(chainId: SupportedNetworkId): string {
	return RPC_ENDPOINTS[chainId][0];
}

/**
 * Get all RPC URLs for a chain
 */
export function getAllRpcUrls(chainId: SupportedNetworkId): string[] {
	return RPC_ENDPOINTS[chainId];
}

// =============================================================================
// Smart Load Balancer with Health Tracking
// =============================================================================

interface EndpointHealth {
	url: string;
	failures: number;
	lastFailure: number | null;
	cooldownUntil: number | null; // Timestamp when endpoint can be used again
	consecutiveFailures: number;
}

/**
 * Health tracking per chain
 */
const endpointHealth = new Map<SupportedNetworkId, Map<string, EndpointHealth>>();

/**
 * Round-robin index tracker per chain (for healthy endpoints only)
 */
const roundRobinIndexes = new Map<SupportedNetworkId, number>();

/**
 * Initialize health tracking for a chain
 */
function initHealthTracking(chainId: SupportedNetworkId): void {
	if (endpointHealth.has(chainId)) return;

	const healthMap = new Map<string, EndpointHealth>();
	for (const url of RPC_ENDPOINTS[chainId]) {
		healthMap.set(url, {
			url,
			failures: 0,
			lastFailure: null,
			cooldownUntil: null,
			consecutiveFailures: 0
		});
	}
	endpointHealth.set(chainId, healthMap);
}

/**
 * Get healthy endpoints (not in cooldown)
 */
function getHealthyEndpoints(chainId: SupportedNetworkId): string[] {
	initHealthTracking(chainId);
	const healthMap = endpointHealth.get(chainId)!;
	const now = Date.now();

	return RPC_ENDPOINTS[chainId].filter((url) => {
		const health = healthMap.get(url);
		if (!health) return true;
		if (!health.cooldownUntil) return true;
		return now >= health.cooldownUntil;
	});
}

/**
 * Mark an endpoint as failed (429 or timeout)
 */
export function markEndpointFailed(chainId: SupportedNetworkId, url: string): void {
	initHealthTracking(chainId);
	const healthMap = endpointHealth.get(chainId)!;
	const health = healthMap.get(url);
	if (!health) return;

	const now = Date.now();
	health.failures++;
	health.consecutiveFailures++;
	health.lastFailure = now;

	// Exponential backoff: 2^failures seconds, capped at 5 minutes
	const backoffSeconds = Math.min(Math.pow(2, health.consecutiveFailures), 300);
	health.cooldownUntil = now + backoffSeconds * 1000;

	console.warn(
		`[RPC] Endpoint ${url} marked as failed. Cooldown: ${backoffSeconds}s (failures: ${health.consecutiveFailures})`
	);
}

/**
 * Mark an endpoint as successful (reset consecutive failures)
 */
export function markEndpointSuccess(chainId: SupportedNetworkId, url: string): void {
	initHealthTracking(chainId);
	const healthMap = endpointHealth.get(chainId)!;
	const health = healthMap.get(url);
	if (!health) return;

	// Reset consecutive failures on success
	health.consecutiveFailures = 0;
	health.cooldownUntil = null;
}

/**
 * Get the next RPC URL using smart round-robin load balancing
 * Only rotates through healthy endpoints (not in cooldown)
 *
 * @param chainId - The chain to get an RPC URL for
 * @returns The next healthy RPC URL in rotation
 */
export function getNextRpcUrl(chainId: SupportedNetworkId): string {
	const healthyEndpoints = getHealthyEndpoints(chainId);

	// If all endpoints are in cooldown, use the primary endpoint
	if (healthyEndpoints.length === 0) {
		console.warn(`[RPC] All endpoints for chain ${chainId} in cooldown, using primary`);
		return RPC_ENDPOINTS[chainId][0];
	}

	const currentIndex = roundRobinIndexes.get(chainId) ?? 0;
	const url = healthyEndpoints[currentIndex % healthyEndpoints.length];

	// Update index for next call
	roundRobinIndexes.set(chainId, (currentIndex + 1) % healthyEndpoints.length);

	return url;
}

/**
 * Reset the round-robin index for a chain (useful for testing)
 */
export function resetRoundRobin(chainId: SupportedNetworkId): void {
	roundRobinIndexes.set(chainId, 0);
}

/**
 * Reset health tracking for a chain (useful for testing)
 */
export function resetHealthTracking(chainId: SupportedNetworkId): void {
	endpointHealth.delete(chainId);
	initHealthTracking(chainId);
}

// =============================================================================
// Viem Transport Creation with Fallbacks
// =============================================================================

/**
 * Create a viem transport with smart load balancing and health tracking
 *
 * Features:
 * - Smart round-robin across healthy endpoints only
 * - Skips endpoints in cooldown (recently failed with 429 or timeout)
 * - Falls back to other endpoints if one fails
 * - Reduced retry count to avoid hammering rate-limited endpoints
 *
 * @param chainId - The chain to create transport for
 * @param options - Optional configuration
 * @returns Viem transport with smart load balancing
 *
 * @example
 * ```ts
 * import { createPublicClient } from 'viem';
 * import { base } from 'viem/chains';
 * import { createRpcTransport, SUPPORTED_NETWORKS } from '$lib/utils/rpc';
 *
 * const client = createPublicClient({
 *   chain: base,
 *   transport: createRpcTransport(SUPPORTED_NETWORKS.BASE)
 * });
 * ```
 */
export function createRpcTransport(
	chainId: SupportedNetworkId,
	options: {
		/** Number of retry attempts per endpoint (default: 1) */
		retryCount?: number;
		/** Initial retry delay in ms (default: 200) */
		retryDelay?: number;
	} = {}
): Transport {
	const { retryCount = 1, retryDelay = 200 } = options;

	initHealthTracking(chainId);

	// Get healthy endpoints (not in cooldown)
	const healthyEndpoints = getHealthyEndpoints(chainId);

	// If no healthy endpoints, use all endpoints
	const endpoints = healthyEndpoints.length > 0 ? healthyEndpoints : RPC_ENDPOINTS[chainId];

	// Create http transports for healthy endpoints only
	// Reduced retry count to avoid hitting rate limits multiple times
	const transports = endpoints.map((url) =>
		http(url, {
			retryCount, // Reduced from 3 to 1
			retryDelay,
			timeout: 30_000 // 30 second timeout
		})
	);

	// Use viem's fallback transport
	// It will try each transport in order until one succeeds
	return fallback(transports, {
		rank: false, // Keep the order we defined (healthy endpoints first)
		retryCount: 1, // Retry once with next endpoint
		retryDelay: 100
	});
}

/**
 * Create a load-balanced transport that rotates through endpoints
 *
 * Instead of always trying endpoints in order (primary first),
 * this uses round-robin to distribute load across all endpoints.
 *
 * @param chainId - The chain to create transport for
 * @returns Viem transport with load balancing
 */
export function createLoadBalancedTransport(chainId: SupportedNetworkId): Transport {
	const endpoints = RPC_ENDPOINTS[chainId];

	// Get current round-robin index
	const startIndex = roundRobinIndexes.get(chainId) ?? 0;

	// Rotate the endpoints array to start from the next endpoint
	const rotatedEndpoints = [...endpoints.slice(startIndex), ...endpoints.slice(0, startIndex)];

	// Update index for next call
	roundRobinIndexes.set(chainId, (startIndex + 1) % endpoints.length);

	// Create transports in the rotated order
	const transports = rotatedEndpoints.map((url) =>
		http(url, {
			retryCount: 3,
			retryDelay: 150,
			timeout: 30_000
		})
	);

	return fallback(transports, {
		rank: false
	});
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if an error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
	const errorString = String(error).toLowerCase();
	return (
		errorString.includes('429') ||
		errorString.includes('rate limit') ||
		errorString.includes('too many requests')
	);
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
	const errorString = String(error).toLowerCase();
	return (
		errorString.includes('timeout') ||
		errorString.includes('timed out') ||
		errorString.includes('request took too long')
	);
}

/**
 * Check if an error should trigger a retry/fallback
 */
export function shouldRetry(error: unknown): boolean {
	return isRateLimitError(error) || isTimeoutError(error);
}

/**
 * Handle RPC error and mark endpoint as failed if needed
 * Call this in catch blocks when making RPC requests
 *
 * @param chainId - The chain that failed
 * @param error - The error that occurred
 * @param url - Optional specific URL that failed (if known)
 *
 * @example
 * ```ts
 * try {
 *   const result = await publicClient.readContract(...);
 * } catch (error) {
 *   handleRpcError(SUPPORTED_NETWORKS.BASE, error);
 *   throw error;
 * }
 * ```
 */
export function handleRpcError(chainId: SupportedNetworkId, error: unknown, url?: string): void {
	if (!isRateLimitError(error) && !isTimeoutError(error)) {
		return; // Not a rate limit or timeout error, don't mark as failed
	}

	if (url) {
		// Mark specific URL as failed
		markEndpointFailed(chainId, url);
	} else {
		// Mark the current primary endpoint as failed
		// This will trigger exponential backoff and rotate to next endpoint
		const currentUrl = getNextRpcUrl(chainId);
		markEndpointFailed(chainId, currentUrl);
	}
}

interface EndpointHealthStatus {
	failures: number;
	consecutiveFailures: number;
	lastFailure: string | null;
	inCooldown: boolean;
	cooldownEndsAt: string | null;
}

/**
 * Get health status for all endpoints on a chain
 * Useful for debugging
 */
export function getEndpointHealthStatus(
	chainId: SupportedNetworkId
): Record<string, EndpointHealthStatus> {
	initHealthTracking(chainId);
	const healthMap = endpointHealth.get(chainId)!;
	const now = Date.now();

	const status: Record<string, EndpointHealthStatus> = {};
	for (const [url, health] of healthMap.entries()) {
		status[url] = {
			failures: health.failures,
			consecutiveFailures: health.consecutiveFailures,
			lastFailure: health.lastFailure ? new Date(health.lastFailure).toISOString() : null,
			inCooldown: health.cooldownUntil ? now < health.cooldownUntil : false,
			cooldownEndsAt: health.cooldownUntil ? new Date(health.cooldownUntil).toISOString() : null
		};
	}

	return status;
}
