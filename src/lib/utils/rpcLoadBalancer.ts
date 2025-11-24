/**
 * RPC Load Balancer
 *
 * Distributes load across paired RPC endpoints with automatic failover.
 *
 * Architecture:
 * - Groups RPCs into pairs (2 URLs per pair)
 * - Round-robins within each pair for load balancing
 * - Falls back to next pair on failures
 * - Circuit breaker pattern to avoid hammering failed endpoints
 */

export interface RpcEndpoint {
	url: string;
	healthy: boolean;
	consecutiveFailures: number;
	lastFailureTime: number;
	totalRequests: number;
	successfulRequests: number;
}

export interface RpcPair {
	primary: RpcEndpoint;
	secondary: RpcEndpoint;
	currentIndex: 0 | 1; // Which endpoint to use next
}

export class RpcLoadBalancer {
	private pairs: RpcPair[] = [];
	private currentPairIndex = 0;

	// Configuration
	private readonly maxConsecutiveFailures = 3;
	private readonly recoveryTimeMs = 60_000; // 1 minute
	private readonly minHealthyPerPair = 1; // At least 1 healthy endpoint per pair

	constructor(urls: string[]) {
		if (urls.length < 2) {
			throw new Error('RpcLoadBalancer requires at least 2 URLs');
		}

		// Remove duplicates
		const uniqueUrls = Array.from(new Set(urls));

		// Group into pairs
		for (let i = 0; i < uniqueUrls.length; i += 2) {
			const primary = this.createEndpoint(uniqueUrls[i]);
			const secondary = uniqueUrls[i + 1]
				? this.createEndpoint(uniqueUrls[i + 1])
				: this.createEndpoint(uniqueUrls[i]); // Duplicate if odd number

			this.pairs.push({
				primary,
				secondary,
				currentIndex: 0
			});
		}

		console.log(`[RpcLoadBalancer] Initialized with ${this.pairs.length} pairs:`, {
			pairs: this.pairs.map((p, idx) => ({
				pair: idx + 1,
				primary: p.primary.url,
				secondary: p.secondary.url
			}))
		});
	}

	private createEndpoint(url: string): RpcEndpoint {
		return {
			url,
			healthy: true,
			consecutiveFailures: 0,
			lastFailureTime: 0,
			totalRequests: 0,
			successfulRequests: 0
		};
	}

	/**
	 * Get the next healthy endpoint, with load balancing and failover
	 */
	getNextEndpoint(): { url: string; pairIndex: number; endpointIndex: 0 | 1 } | null {
		// Try current pair first
		const currentPair = this.pairs[this.currentPairIndex];
		const endpoint = this.getEndpointFromPair(currentPair);
		if (endpoint) {
			return {
				url: endpoint.url,
				pairIndex: this.currentPairIndex,
				endpointIndex: currentPair.currentIndex
			};
		}

		// Current pair unhealthy, try other pairs
		for (let i = 0; i < this.pairs.length; i++) {
			const pairIndex = (this.currentPairIndex + i + 1) % this.pairs.length;
			const pair = this.pairs[pairIndex];
			const endpoint = this.getEndpointFromPair(pair);
			if (endpoint) {
				console.log(`[RpcLoadBalancer] Failed over to pair ${pairIndex + 1}`);
				this.currentPairIndex = pairIndex;
				return {
					url: endpoint.url,
					pairIndex,
					endpointIndex: pair.currentIndex
				};
			}
		}

		// All endpoints unhealthy - attempt recovery
		console.warn('[RpcLoadBalancer] All endpoints unhealthy, attempting recovery...');
		this.attemptRecovery();

		// Try again after recovery
		const recoveredEndpoint = this.getEndpointFromPair(this.pairs[this.currentPairIndex]);
		if (recoveredEndpoint) {
			return {
				url: recoveredEndpoint.url,
				pairIndex: this.currentPairIndex,
				endpointIndex: this.pairs[this.currentPairIndex].currentIndex
			};
		}

		return null;
	}

	/**
	 * Get next healthy endpoint from a pair, with round-robin
	 */
	private getEndpointFromPair(pair: RpcPair): RpcEndpoint | null {
		// Try current endpoint
		const current = pair.currentIndex === 0 ? pair.primary : pair.secondary;
		if (this.isHealthy(current)) {
			// Round-robin for next time
			pair.currentIndex = pair.currentIndex === 0 ? 1 : 0;
			return current;
		}

		// Try other endpoint in pair
		const other = pair.currentIndex === 0 ? pair.secondary : pair.primary;
		if (this.isHealthy(other)) {
			// Switch to the healthy one
			pair.currentIndex = pair.currentIndex === 0 ? 1 : 0;
			return other;
		}

		// Both unhealthy
		return null;
	}

	/**
	 * Check if endpoint is healthy (considering circuit breaker)
	 */
	private isHealthy(endpoint: RpcEndpoint): boolean {
		// Check if marked unhealthy
		if (!endpoint.healthy) {
			// Check if enough time passed for recovery attempt
			const timeSinceFailure = Date.now() - endpoint.lastFailureTime;
			if (timeSinceFailure > this.recoveryTimeMs) {
				console.log(`[RpcLoadBalancer] Attempting recovery for ${endpoint.url}`);
				endpoint.healthy = true;
				endpoint.consecutiveFailures = 0;
				return true;
			}
			return false;
		}

		return true;
	}

	/**
	 * Mark request as successful
	 */
	recordSuccess(pairIndex: number, endpointIndex: 0 | 1): void {
		const pair = this.pairs[pairIndex];
		const endpoint = endpointIndex === 0 ? pair.primary : pair.secondary;

		endpoint.totalRequests++;
		endpoint.successfulRequests++;
		endpoint.consecutiveFailures = 0;
		endpoint.healthy = true;
	}

	/**
	 * Mark request as failed
	 */
	recordFailure(pairIndex: number, endpointIndex: 0 | 1, error: unknown): void {
		const pair = this.pairs[pairIndex];
		const endpoint = endpointIndex === 0 ? pair.primary : pair.secondary;

		endpoint.totalRequests++;
		endpoint.consecutiveFailures++;
		endpoint.lastFailureTime = Date.now();

		// Circuit breaker: mark unhealthy after consecutive failures
		if (endpoint.consecutiveFailures >= this.maxConsecutiveFailures) {
			console.warn(
				`[RpcLoadBalancer] Circuit breaker opened for ${endpoint.url} ` +
					`(${endpoint.consecutiveFailures} consecutive failures)`
			);
			endpoint.healthy = false;
		}

		console.warn(`[RpcLoadBalancer] Request failed for ${endpoint.url}:`, error);
	}

	/**
	 * Force recovery of all endpoints (emergency reset)
	 */
	private attemptRecovery(): void {
		this.pairs.forEach((pair) => {
			pair.primary.healthy = true;
			pair.primary.consecutiveFailures = 0;
			pair.secondary.healthy = true;
			pair.secondary.consecutiveFailures = 0;
		});
	}

	/**
	 * Get statistics for monitoring
	 */
	getStats() {
		return {
			pairs: this.pairs.map((pair, idx) => ({
				pairIndex: idx,
				primary: {
					url: pair.primary.url,
					healthy: pair.primary.healthy,
					successRate:
						pair.primary.totalRequests > 0
							? (pair.primary.successfulRequests / pair.primary.totalRequests) * 100
							: 100,
					totalRequests: pair.primary.totalRequests,
					consecutiveFailures: pair.primary.consecutiveFailures
				},
				secondary: {
					url: pair.secondary.url,
					healthy: pair.secondary.healthy,
					successRate:
						pair.secondary.totalRequests > 0
							? (pair.secondary.successfulRequests / pair.secondary.totalRequests) * 100
							: 100,
					totalRequests: pair.secondary.totalRequests,
					consecutiveFailures: pair.secondary.consecutiveFailures
				}
			})),
			currentPairIndex: this.currentPairIndex
		};
	}

	/**
	 * Execute a function with automatic failover
	 */
	async executeWithFailover<T>(
		fn: (url: string) => Promise<T>,
		maxRetries: number = this.pairs.length * 2
	): Promise<T> {
		let lastError: unknown;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const endpoint = this.getNextEndpoint();
			if (!endpoint) {
				throw new Error('No healthy RPC endpoints available');
			}

			try {
				const result = await fn(endpoint.url);
				this.recordSuccess(endpoint.pairIndex, endpoint.endpointIndex);
				return result;
			} catch (error) {
				this.recordFailure(endpoint.pairIndex, endpoint.endpointIndex, error);
				lastError = error;

				// If this was the last attempt, throw
				if (attempt === maxRetries - 1) {
					throw new Error(
						`All RPC endpoints failed after ${maxRetries} attempts. Last error: ${lastError}`
					);
				}

				// Small delay before retry
				await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
			}
		}

		throw lastError;
	}
}

/**
 * Create load balancer from network configuration
 */
export function createRpcLoadBalancer(rpcUrl: string, fallbackRpcUrls: string[]): RpcLoadBalancer {
	const allUrls = [rpcUrl, ...fallbackRpcUrls];
	return new RpcLoadBalancer(allUrls);
}
