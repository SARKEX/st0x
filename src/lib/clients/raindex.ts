import { RaindexClient } from '@rainlanguage/orderbook';
import { fetchText } from '$lib/clients/http';
import { type Network } from '$lib/config/network';

export const RAIN_STRATEGIES_COMMIT = 'b2e056bb58f0e467a515132ce7a1b25bc624bd09';
export const RAIN_STRATEGIES_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/settings.yaml`;

// Cache the strategies YAML so we don't refetch on every client creation.
let strategiesYamlPromise: Promise<string> | null = null;

async function getStrategiesYaml(): Promise<string> {
	if (!strategiesYamlPromise) {
		strategiesYamlPromise = fetchText(RAIN_STRATEGIES_URL);
	}
	return strategiesYamlPromise;
}

// Two-client pool for load balancing
interface ClientPool {
	clients: [RaindexClient, RaindexClient];
	currentIndex: number;
}

const clientPools = new Map<number, ClientPool>();
const poolInitPromise: Map<number, Promise<ClientPool>> = new Map();

/**
 * Initialize the client pool for a network.
 * Creates 2 clients for load balancing (both use the same strategies YAML config).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function initializePool(_network: Network): Promise<ClientPool> {
	const strategiesYaml = await getStrategiesYaml();

	// Create both clients using the strategies YAML (which includes network configs)
	const [resultA, resultB] = await Promise.all([
		RaindexClient.new([strategiesYaml]),
		RaindexClient.new([strategiesYaml])
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
 * Each client has different primary RPCs, SDK handles failover within each.
 */
export async function getLoadBalancedClient(network: Network): Promise<RaindexClient> {
	const pool = await getClientPool(network);
	const client = pool.clients[pool.currentIndex];
	pool.currentIndex = (pool.currentIndex + 1) % 2;
	return client;
}

/**
 * Create a RaindexClient using the strategies YAML.
 * The strategies YAML already contains network configurations including RPCs.
 */
export async function createRaindexClient(): Promise<RaindexClient> {
	const strategiesYaml = await getStrategiesYaml();

	const clientResult = await RaindexClient.new([strategiesYaml]);
	if (clientResult.error) {
		throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
	}
	return clientResult.value;
}
