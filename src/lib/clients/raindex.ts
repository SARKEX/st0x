import { RaindexClient } from '@rainlanguage/raindex';
import type { Network } from '$lib/config/network';
import { getBrowserRaindexSettings } from '$lib/clients/raindexSettings';
type RaindexClientInstance = RaindexClient;

// Two-client pool for load balancing
interface ClientPool {
	clients: [RaindexClientInstance, RaindexClientInstance];
	currentIndex: number;
}

const clientPools = new Map<number, ClientPool>();
const poolInitPromise: Map<number, Promise<ClientPool>> = new Map();

/**
 * Initialize the client pool for a network.
 * Creates 2 clients for load balancing (both use the same settings YAML).
 */

async function initializePool(_network: Network): Promise<ClientPool> {
	const settings = await getBrowserRaindexSettings();
	const [resultA, resultB] = await Promise.all([
		RaindexClient.new([settings]),
		RaindexClient.new([settings])
	]);

	if (resultA.error) {
		throw new Error(`Failed to create RaindexClient A: ${resultA.error.readableMsg}`);
	}
	if (resultB.error) {
		throw new Error(`Failed to create RaindexClient B: ${resultB.error.readableMsg}`);
	}

	return {
		clients: [resultA.value, resultB.value],
		currentIndex: 0
	};
}

/**
 * Get or create the client pool for a network.
 */
async function getClientPool(network: Network): Promise<ClientPool> {
	// Return cached pool if exists
	const existing = clientPools.get(network.id);
	if (existing) return existing;

	// Check if initialization is in progress
	let initPromise = poolInitPromise.get(network.id);
	if (!initPromise) {
		initPromise = initializePool(network);
		poolInitPromise.set(network.id, initPromise);
	}

	const pool = await initPromise;
	clientPools.set(network.id, pool);
	poolInitPromise.delete(network.id);

	return pool;
}

/**
 * Get the next client using round-robin load balancing.
 * Both clients share the canonical registry settings and the SDK handles RPC failover.
 */
export async function getLoadBalancedClient(network: Network): Promise<RaindexClientInstance> {
	const pool = await getClientPool(network);
	const client = pool.clients[pool.currentIndex];
	pool.currentIndex = (pool.currentIndex + 1) % 2;
	return client;
}

/**
 * Create a RaindexClient from the browser-safe canonical registry settings.
 */
export async function createRaindexClient(): Promise<RaindexClientInstance> {
	const settings = await getBrowserRaindexSettings();
	const clientResult = await RaindexClient.new([settings]);
	if (clientResult.error) {
		throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
	}
	return clientResult.value;
}
