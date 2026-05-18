// Fork-aware stub for /api/st0x/v1/orders/token/<addr>.
//
// The production ST0x REST API runs against LIVE Base mainnet — it has its
// own RPC connection that we cannot intercept from Playwright (server-to-
// server, never hits the browser). For the UI E2E suite this means the
// orderbook quotes the UI displays reflect LIVE state while the SDK preflight
// simulates against our anvil fork. Any drift between LIVE and FORK breaks
// the test (vault balances differ, ioRatios differ, order list differs).
//
// This stub bridges the gap by:
//   1. Letting the production REST proxy fetch the LIVE order list once
//      (the subgraph-indexed fields don't depend on live on-chain state).
//   2. Running a single batched RaindexClient.getOrders against the same
//      subgraph + anvil RPC, then getQuotes() per order on anvil — those
//      ratios reflect FORK state.
//   3. Substituting fork-derived ioRatio + maxOutput into each row.
//
// Cache: the fork is static across the spec run, so we cache the
// hash → (ratio, maxOutput) map once. Subsequent stub hits — and there are
// many, one per UI page-load × token — reuse the cache. Without this the
// burst of getQuotes calls trips Goldsky's free-tier rate limit (HTTP 429).
//
// Local-vs-CI: anvil's lazy state fetch from the parent RPC uses
// `eth_getProof`, which free public Base RPCs (publicnode, base.org,
// drpc.org, llamarpc) all reject ("distance to target block exceeds
// maximum proof window"). Local runs need an archive provider
// (Alchemy / QuickNode); CI's BASE_RPC_URL already is one.
//
// Vault balance: getOrders reads vault balances from the LIVE Goldsky
// subgraph, not from anvil. With FORK_BLOCK pinned within minutes of "now"
// (the dynamic branch in globalSetup), that approximation is accurate.
// For genuinely old forks a direct anvil eth_call against the orderbook's
// vaultBalance function would be needed — left as a future enhancement.
import { RaindexClient } from '@rainlanguage/orderbook';
import type { ApiOrderSummary, ApiOrdersListResponse } from '../../../src/lib/api/st0xApi';

const ORDERBOOK_ADDRESS = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D';

const ANVIL_SETTINGS_YAML = `version: 5
networks:
  base:
    rpcs:
      - http://127.0.0.1:8545
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn
metaboards:
  base: https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn
orderbooks:
  base:
    address: ${ORDERBOOK_ADDRESS}
    network: base
    subgraph: base
    deployment-block: 41747644
rainlangs:
  base:
    address: 0x22508460712C350e914b49155982d3A92D923b10
    network: base
`;

interface ForkQuote {
	ratio: string;
	maxOutput: string;
}

// keyed by `${orderHashLc}|${inputLc}|${outputLc}`
type ForkQuoteCache = Map<string, ForkQuote>;

let clientPromise: Promise<RaindexClient> | null = null;
let cachePromise: Promise<ForkQuoteCache> | null = null;

function getAnvilClient(): Promise<RaindexClient> {
	if (clientPromise) return clientPromise;
	clientPromise = (async () => {
		const result = await RaindexClient.new([ANVIL_SETTINGS_YAML]);
		if (result.error || !result.value) {
			throw new Error(
				`forkOrdersStub: RaindexClient.new failed — ${result.error?.readableMsg ?? 'unknown'}`
			);
		}
		return result.value;
	})();
	return clientPromise;
}

const cacheKey = (hash: string, inputLc: string, outputLc: string) =>
	`${hash.toLowerCase()}|${inputLc}|${outputLc}`;

async function getForkTimestamp(): Promise<number> {
	const block = process.env.FORK_BLOCK;
	if (!block) throw new Error('FORK_BLOCK env not set');
	const resp = await fetch('http://127.0.0.1:8545', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_getBlockByNumber',
			params: ['0x' + Number(block).toString(16), false]
		})
	});
	const json = (await resp.json()) as { result?: { timestamp: string } };
	if (!json.result?.timestamp) throw new Error('failed to read fork timestamp from anvil');
	return parseInt(json.result.timestamp, 16);
}

/**
 * Build the fork-quote cache once: one batched getOrders, parallel getQuotes
 * across all orders that pre-date the fork. Subgraph returns LIVE-active
 * orders, many of which may have been created AFTER our fork block — those
 * don't exist in the fork's orderbook contract, so we filter them out by
 * timestampAdded to avoid the obvious "Order does not exist" reverts.
 * Persists for the test-run lifetime.
 */
function buildForkQuoteCache(): Promise<ForkQuoteCache> {
	if (cachePromise) return cachePromise;
	cachePromise = (async () => {
		const client = await getAnvilClient();
		const forkTs = await getForkTimestamp();

		const ordersRes = await client.getOrders(
			[8453],
			{
				owners: [],
				active: true,
				orderbookAddresses: [ORDERBOOK_ADDRESS as `0x${string}`]
			},
			1,
			1000
		);
		if (ordersRes.error || !ordersRes.value) {
			throw new Error(
				`forkOrdersStub: getOrders failed — ${ordersRes.error?.readableMsg ?? 'no value'}`
			);
		}
		const preForkOrders = ordersRes.value.orders.filter((o) => Number(o.timestampAdded) < forkTs);
		console.log(
			`[fork-stub] cache build: ${preForkOrders.length}/${ordersRes.value.orders.length} pre-fork orders (forkTs=${forkTs})`
		);

		// Parallel quote calls (~600ms each serially; ~10x faster batched).
		const cache: ForkQuoteCache = new Map();
		let successCount = 0;
		let failCount = 0;
		await Promise.all(
			preForkOrders.map(async (order) => {
				try {
					const qRes = await order.getQuotes();
					if (qRes.error || !qRes.value) {
						failCount++;
						return;
					}
					const inputs = order.inputsList.items;
					const outputs = order.outputsList.items;
					for (const q of qRes.value) {
						if (!q.data) {
							failCount++;
							continue;
						}
						const inLc = inputs[q.pair?.inputIndex ?? -1]?.token?.address?.toLowerCase();
						const outLc = outputs[q.pair?.outputIndex ?? -1]?.token?.address?.toLowerCase();
						if (!inLc || !outLc) continue;
						cache.set(cacheKey(order.orderHash, inLc, outLc), {
							ratio: q.data.formattedRatio,
							maxOutput: q.data.formattedMaxOutput
						});
						successCount++;
					}
				} catch {
					failCount++;
				}
			})
		);
		console.log(`[fork-stub] cache built: quotes=${successCount} failed=${failCount}`);
		return cache;
	})();
	return cachePromise;
}

/**
 * Substitute fork-derived ioRatio + maxOutput into a LIVE ApiOrdersListResponse.
 * Rows whose order is not on the fork (created after the fork block) or whose
 * quote() reverts on the fork are dropped — the UI handles a sparser
 * orderbook gracefully.
 */
export async function patchOrdersResponseAgainstFork(
	liveResponse: ApiOrdersListResponse
): Promise<ApiOrdersListResponse> {
	if (!liveResponse?.orders?.length) return liveResponse;

	let cache: ForkQuoteCache;
	try {
		cache = await buildForkQuoteCache();
	} catch (err) {
		console.warn('[fork-stub] cache build failed, returning live response unchanged:', err);
		return liveResponse;
	}

	const patched: ApiOrderSummary[] = [];
	for (const liveOrder of liveResponse.orders) {
		const key = cacheKey(
			liveOrder.orderHash,
			liveOrder.inputToken.address.toLowerCase(),
			liveOrder.outputToken.address.toLowerCase()
		);
		const fork = cache.get(key);
		if (!fork) continue;
		patched.push({
			...liveOrder,
			maxOutput: fork.maxOutput,
			ioRatio: fork.ratio
		});
	}
	return { ...liveResponse, orders: patched };
}
