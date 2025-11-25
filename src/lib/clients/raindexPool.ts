/**
 * Raindex Client Pool with Load Balancing
 *
 * Creates multiple RaindexClient instances and distributes load between them.
 * Uses RpcLoadBalancer to select which client to use for each request.
 */

import { RaindexClient } from '@rainlanguage/orderbook';
import { fetchText } from '$lib/clients/http';
import { RpcLoadBalancer, createRpcLoadBalancer } from '$lib/utils/rpcLoadBalancer';
import type { Network } from '$lib/config/network';

export const RAIN_STRATEGIES_COMMIT = 'b2e056bb58f0e467a515132ce7a1b25bc624bd09';
export const RAIN_STRATEGIES_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/settings.yaml`;

interface ClientPoolEntry {
	client: RaindexClient;
	rpcUrl: string;
	pairIndex: number;
	endpointIndex: 0 | 1;
}

/**
 * Pool of RaindexClient instances with load balancing
 */
export class RaindexClientPool {
	private clients: ClientPoolEntry[] = [];
	private loadBalancer: RpcLoadBalancer | null = null;
	private strategiesYaml: string | null = null;
	private currentClientIndex = 0;

	/**
	 * Initialize the pool with multiple clients
	 */
	async initialize(network: Network): Promise<void> {
		// Fetch strategies YAML once
		if (!this.strategiesYaml) {
			this.strategiesYaml = await fetchText(RAIN_STRATEGIES_URL);
		}

		// Create load balancer from network RPC URLs
		const allRpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];
		this.loadBalancer = createRpcLoadBalancer(network.rpcUrl, network.fallbackRpcUrls);

		console.log(`[RaindexClientPool] Initializing pool with ${allRpcUrls.length} RPCs`);

		// Note: RaindexClient doesn't currently support custom RPC URLs
		// We create multiple instances for potential future use when SDK supports it
		// For now, we'll create 2 clients (one per pair) as a proof of concept

		// Create one client per pair (simplified approach)
		const stats = this.loadBalancer.getStats();
		for (const pairStat of stats.pairs) {
			try {
				const clientResult = await RaindexClient.new([this.strategiesYaml]);
				if (clientResult.error) {
					console.warn(
						`[RaindexClientPool] Failed to create client for pair ${pairStat.pairIndex}:`,
						clientResult.error.readableMsg
					);
					continue;
				}

				this.clients.push({
					client: clientResult.value,
					rpcUrl: pairStat.primary.url,
					pairIndex: pairStat.pairIndex,
					endpointIndex: 0
				});

				console.log(`[RaindexClientPool] Created client for pair ${pairStat.pairIndex}`);
			} catch (error) {
				console.error(
					`[RaindexClientPool] Error creating client for pair ${pairStat.pairIndex}:`,
					error
				);
			}
		}

		console.log(`[RaindexClientPool] Pool initialized with ${this.clients.length} clients`);
	}

	/**
	 * Get next client using load balancing
	 */
	getClient(): ClientPoolEntry | null {
		if (this.clients.length === 0) {
			return null;
		}

		if (!this.loadBalancer) {
			// Fallback to round-robin if no load balancer
			this.currentClientIndex = (this.currentClientIndex + 1) % this.clients.length;
			return this.clients[this.currentClientIndex];
		}

		// Get next endpoint from load balancer
		const endpoint = this.loadBalancer.getNextEndpoint();
		if (!endpoint) {
			// All endpoints unhealthy, use first client
			return this.clients[0];
		}

		// Find client matching the pair
		const client = this.clients.find((c) => c.pairIndex === endpoint.pairIndex);
		if (client) {
			return client;
		}

		// Fallback to round-robin
		this.currentClientIndex = (this.currentClientIndex + 1) % this.clients.length;
		return this.clients[this.currentClientIndex];
	}

	/**
	 * Record successful request
	 */
	recordSuccess(entry: ClientPoolEntry): void {
		if (this.loadBalancer) {
			this.loadBalancer.recordSuccess(entry.pairIndex, entry.endpointIndex);
		}
	}

	/**
	 * Record failed request
	 */
	recordFailure(entry: ClientPoolEntry, error: unknown): void {
		if (this.loadBalancer) {
			this.loadBalancer.recordFailure(entry.pairIndex, entry.endpointIndex, error);
		}
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return {
			totalClients: this.clients.length,
			loadBalancer: this.loadBalancer?.getStats()
		};
	}
}

// Global pool instance (one per network)
const poolCache = new Map<number, RaindexClientPool>();

/**
 * Get or create a client pool for a network
 */
export async function getRaindexClientPool(network: Network): Promise<RaindexClientPool> {
	let pool = poolCache.get(network.id);
	if (!pool) {
		pool = new RaindexClientPool();
		await pool.initialize(network);
		poolCache.set(network.id, pool);
	}
	return pool;
}

/**
 * Simple wrapper to get a single client (for backward compatibility)
 */
export async function getBalancedRaindexClient(network: Network): Promise<RaindexClient> {
	const pool = await getRaindexClientPool(network);
	const entry = pool.getClient();
	if (!entry) {
		throw new Error('No available RaindexClient in pool');
	}
	return entry.client;
}
