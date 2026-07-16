import { RaindexClient } from '@rainlanguage/raindex';
import { env as publicEnv } from '$env/dynamic/public';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import { RAINDEX_SUBGRAPH_COMPAT_PATH } from '$lib/config/raindexSubgraph';
type RaindexClientInstance = RaindexClient;

// SEC-01 / Phase 3 D-02: Same PUBLIC_BASE_RPC_URL the client networks config reads.
// Dev fallback preserves the `npm run dev` no-env-needed path; production sets the
// Alchemy URL via Vercel env vars. The literal Alchemy URL was committed pre-Phase-3
// and is rotated as part of the SEC-01 deploy (see 03-RUNBOOK.md / Plan 03-10).
const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';

/**
 * TEMP: route RaindexClient subgraph traffic through the same-origin rewrite
 * proxy until Goldsky serves the renamed `raindex` schema. Absolute URL required
 * by the WASM fetch layer (`response.url` must parse).
 */
function resolveSubgraphUrl(): string {
	if (browser && typeof window !== 'undefined' && window.location?.origin) {
		return `${window.location.origin}${RAINDEX_SUBGRAPH_COMPAT_PATH}`;
	}
	const base =
		publicEnv.PUBLIC_APP_URL ||
		(typeof process !== 'undefined' && process.env.VERCEL_URL
			? `https://${process.env.VERCEL_URL}`
			: 'http://127.0.0.1:5173');
	return `${base.replace(/\/$/, '')}${RAINDEX_SUBGRAPH_COMPAT_PATH}`;
}

/**
 * Raindex settings YAML.
 *
 * Hand-maintained in this file (rather than fetched from upstream rain.strategies)
 * because:
 *  - Upstream keeps adding fields (e.g. local-db-sync) that the SDK interprets
 *    and refuses to start without corresponding callbacks we don't ship.
 *  - No network fetch on client boot.
 *  - Deterministic config — we know exactly what the SDK sees.
 *
 * When adding a new chain, add a `networks`, `subgraphs`, `metaboards`, `raindexes`,
 * and `rainlangs` entry below.
 *
 * NOTE: RPCs here are NOT the same as in networks.ts. The Raindex SDK uses
 * multicall eth_call for quote simulation — many public RPCs (llamarpc, meowrpc,
 * blastapi, tenderly) don't support this. Use RPCs known to handle eth_call.
 *
 * TEMP subgraph URL: `/api/public/raindex-subgraph-compat` rewrites raindex↔orderbook
 * against the still-live `ob4-base/2026-02-05-c4ef` deployment. Swap back to the
 * direct Goldsky URL once the renamed subgraph is deployed.
 */
function buildSettingsYaml(): string {
	return `version: 6
networks:
  base:
    rpcs:
      - ${PRIMARY_RPC}
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: ${resolveSubgraphUrl()}
metaboards:
  base: https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn
raindexes:
  base:
    address: 0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D
    network: base
    subgraph: base
    deployment-block: 41747644
rainlangs:
  base:
    address: 0x22508460712C350e914b49155982d3A92D923b10
    network: base
`;
}

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
	const settings = buildSettingsYaml();
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
 * Each client has different primary RPCs, SDK handles failover within each.
 */
export async function getLoadBalancedClient(network: Network): Promise<RaindexClientInstance> {
	const pool = await getClientPool(network);
	const client = pool.clients[pool.currentIndex];
	pool.currentIndex = (pool.currentIndex + 1) % 2;
	return client;
}

/**
 * Create a RaindexClient from the hardcoded settings YAML.
 */
export async function createRaindexClient(): Promise<RaindexClientInstance> {
	const clientResult = await RaindexClient.new([buildSettingsYaml()]);
	if (clientResult.error) {
		throw new Error(`Failed to create RaindexClient: ${clientResult.error.readableMsg}`);
	}
	return clientResult.value;
}
