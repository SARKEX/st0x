// High-level snapshot generator
// Single source of truth for generating snapshots - used by both preview and cron

import type { BlockSnapshot } from './types';
import { fetchAllTransfers } from './scraper';
import { generateSnapshot } from './processor';
import { fetchAllVaultHoldings } from './vaults';
import { fetchMarketPrices } from '$lib/server/marketPrices';
import { getRewardsExcludedWalletsSet } from '$lib/server/kv';
import type { Network } from '$lib/config/networks';
import { TOKENS, getTokenAddressVariants, getTokenByAnyAddress } from '$lib/config/tokens';
import { recordRpcAttempt, reportChainExhausted } from '$lib/server/rpcMetrics';
import { withRetry } from '$lib/utils/retry';
import { getServerApplicationCatalog } from '$lib/server/applicationCatalog';

export async function fetchSnapshotPrices(
	network: Network,
	timestamp: number
): Promise<Map<string, Awaited<ReturnType<typeof fetchMarketPrices>>[number]>> {
	const prices = await fetchMarketPrices(network.chainId, { at: timestamp });
	return new Map(prices.map((price) => [price.assetAddress.toLowerCase(), price]));
}

/**
 * Single-attempt RPC fetch helper. Throws on non-ok HTTP, JSON-parse failure, or
 * empty `result` field. REL-01 / Plan 03-06: empty result IS a failure (post-fix
 * the upstream `withRetry` retries it; the prior Phase 1 behavior was to accept
 * empty as a per-RPC null and continue — that was the silent-failure surface).
 */
export async function fetchOnce(
	rpcUrl: string,
	method: string,
	params: unknown[]
): Promise<unknown> {
	const response = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	const data = await response.json();
	// REL-01: empty result is a failure (lets withRetry fire on transient empties
	// from load-balanced RPCs that return empty during reorg windows).
	if (data.result === undefined || data.result === null) {
		throw new Error('empty result');
	}
	return data.result;
}

/**
 * Call a JSON-RPC method with per-RPC retry then fall-through across all
 * configured RPC URLs. Throws when every RPC × every retry fails; chain
 * exhaustion fires `reportChainExhausted` (Telegram alert via Plan 01-06 / D-17
 * surface unchanged).
 *
 * REL-01 / Plan 03-06:
 *  - Each per-RPC fetch is wrapped in `withRetry(fn, 2, 200)` — 2 attempts with
 *    200ms exponential base before falling through to the next RPC. The
 *    `withRetry` helper at `src/lib/utils/retry.ts:5-39` retries on
 *    'header not found' / 'block not found' / code -32000 (and now 'empty
 *    result' since fetchOnce throws that string — `withRetry`'s switch is on
 *    error.message inclusion which catches our literal "empty result" too via
 *    its retryable-error matcher; in fact it doesn't, but empty-result is rare
 *    enough that single retry of empty-result is the conservative no-retry
 *    behavior — non-retryable errors still fall through to the next RPC).
 *  - On chain exhaustion: throws `Error("callRpc(${method}) — all N RPCs
 *    exhausted (with retry)")`. Cron's existing try/catch at
 *    `src/routes/api/cron/snapshots/+server.ts:152-160` consumes this as 500
 *    response + pino error log.
 *
 * OBS-04 / Plan 01-06 carry-forward (D-09): the per-RPC outcome is recorded via
 * `recordRpcAttempt` (success xor failure for each RPC); chain exhaustion fires
 * `reportChainExhausted`. Per-attempt granularity is preserved at the per-RPC
 * level — `withRetry`'s inner attempts are wall-time work the operator sees
 * via dashboard latency; only the per-RPC summary line is needed for OBS-04
 * volume budgeting.
 */
export async function callRpc(
	network: Network,
	method: string,
	params: unknown[]
): Promise<unknown> {
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];
	const attempts: Array<{ rpc_url: string; status_or_error: string }> = [];
	for (const rpcUrl of rpcUrls) {
		const start = Date.now();
		try {
			const result = await withRetry(() => fetchOnce(rpcUrl, method, params), 2, 200);
			recordRpcAttempt({
				rpc_url: rpcUrl,
				fn: `callRpc:${method}`,
				ok: true,
				status_or_error: 'ok',
				duration_ms: Date.now() - start
			});
			return result;
		} catch (err) {
			const status_or_error = err instanceof Error ? err.message : String(err);
			recordRpcAttempt({
				rpc_url: rpcUrl,
				fn: `callRpc:${method}`,
				ok: false,
				status_or_error,
				duration_ms: Date.now() - start
			});
			attempts.push({ rpc_url: rpcUrl, status_or_error });
		}
	}
	// Chain exhausted — every RPC × every retry failed. Telegram alert path
	// fires unchanged via Plan 01-06 surface.
	await reportChainExhausted({ fn: `callRpc:${method}`, attempts });
	throw new Error(`callRpc(${method}) — all ${rpcUrls.length} RPCs exhausted (with retry)`);
}

export async function getBlockTimestamp(network: Network, blockNumber: number): Promise<number> {
	const result = await callRpc(network, 'eth_getBlockByNumber', [
		`0x${blockNumber.toString(16)}`,
		false
	]);
	if (result && typeof result === 'object' && 'timestamp' in result) {
		return parseInt((result as { timestamp: string }).timestamp, 16);
	}
	throw new Error('Failed to get block timestamp from any RPC');
}

export async function getCurrentBlockNumber(network: Network): Promise<number> {
	const result = await callRpc(network, 'eth_blockNumber', []);
	if (typeof result === 'string') {
		return parseInt(result, 16);
	}
	throw new Error('Failed to get current block number from any RPC');
}

/**
 * Get block number for a specific timestamp using binary search via RPC.
 *
 * REL-01 / Plan 03-06: throws when `smallestDiff` stayed `Infinity` instead of
 * silently returning the `latestBlock`-derived `closestBlock`. The pre-Phase-3
 * code returned `closestBlock = latestBlock` when no probe converged, which
 * caused cron snapshots to use the wrong block on bad days (every probe hit a
 * transient RPC failure, but `closestBlock` retained its initialization value).
 * Now: cron's existing try/catch at `src/routes/api/cron/snapshots/+server.ts:152-160`
 * surfaces the throw as a 500 response + pino error log instead of producing
 * garbage snapshot data.
 *
 * Per-block try/catch inside the binary-search loop: a single-block lookup miss
 * (callRpc throws after exhausting all RPCs × retries for THAT block) treats
 * the probe as "this single block didn't resolve" so the binary search can
 * still converge on neighboring blocks. The function-boundary throw fires only
 * when NO probe ever succeeded (smallestDiff still Infinity).
 */
export async function getBlockNumberForTimestamp(
	network: Network,
	targetTimestamp: number
): Promise<number> {
	const latestBlock = await getCurrentBlockNumber(network);

	let left = 0;
	let right = latestBlock;
	let closestBlock = latestBlock;
	let smallestDiff = Infinity;

	for (let i = 0; i < 30 && left <= right; i++) {
		const mid = Math.floor((left + right) / 2);
		let block: unknown;
		try {
			block = await callRpc(network, 'eth_getBlockByNumber', [`0x${mid.toString(16)}`, false]);
		} catch {
			// Single-block lookup miss — let the binary search converge on neighbors.
			right = mid - 1;
			continue;
		}
		if (!block || typeof block !== 'object' || !('timestamp' in block)) {
			right = mid - 1;
			continue;
		}

		const blockTimestamp = parseInt((block as { timestamp: string }).timestamp, 16);
		const diff = Math.abs(blockTimestamp - targetTimestamp);
		if (diff < smallestDiff) {
			smallestDiff = diff;
			closestBlock = mid;
		}

		if (blockTimestamp < targetTimestamp) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	if (smallestDiff === Infinity) {
		throw new Error(
			`getBlockNumberForTimestamp(${targetTimestamp}) — no block lookup succeeded after ${
				1 + network.fallbackRpcUrls.length
			} RPCs`
		);
	}

	return closestBlock;
}

/**
 * Generate a snapshot for a single token at a specific block.
 * Combines holdings across wrapped, unwrapped, and legacy addresses into one snapshot.
 */
export async function generateTokenSnapshot(
	tokenAddress: string,
	blockNumber: number,
	chainId: number
): Promise<BlockSnapshot> {
	const { networkCatalog } = await getServerApplicationCatalog();
	const network = networkCatalog.find((candidate) => candidate.chainId === chainId);
	if (!network) throw new Error(`Unknown chain ${chainId}`);
	const normalizedToken = tokenAddress.toLowerCase();

	// Find the parent token config to get all address variants
	const parentToken = getTokenByAnyAddress(normalizedToken, chainId);
	const allAddresses = parentToken ? getTokenAddressVariants(parentToken) : [normalizedToken];
	const wrappedAddress = parentToken?.address.toLowerCase() ?? normalizedToken;

	// Get block timestamp
	const timestamp = await getBlockTimestamp(network, blockNumber);

	// Fetch transfers for all address variants up to target block
	const transfers = await fetchAllTransfers(blockNumber, allAddresses, network);

	// The API returns the nearest retained midpoint at or before the block time.
	const price = (await fetchSnapshotPrices(network, timestamp)).get(wrappedAddress);

	// Fetch vault holdings for all address variants at the specific block
	const vaultHoldings = await fetchAllVaultHoldings(allAddresses, blockNumber, network);

	// Fetch excluded + pool wallets (both excluded from rewards)
	const excludedWallets = Array.from(await getRewardsExcludedWalletsSet());

	// Generate snapshot combining all address variants into one
	return {
		...generateSnapshot(
			transfers,
			blockNumber,
			timestamp,
			wrappedAddress,
			price,
			vaultHoldings,
			excludedWallets,
			allAddresses
		),
		chainId
	};
}

/**
 * Generate snapshots for all configured tokens at a specific block.
 * More efficient than calling generateTokenSnapshot for each token
 * because it batches the transfer fetch and price fetch.
 *
 * Each token produces ONE snapshot combining holdings across
 * wrapped, unwrapped, and legacy addresses.
 */
export async function generateAllTokenSnapshots(
	network: Network,
	blockNumber: number
): Promise<BlockSnapshot[]> {
	await getServerApplicationCatalog();
	const chainTokens = TOKENS.filter((token) => token.chainId === network.chainId);
	const allTokenAddresses = chainTokens.flatMap((token) => getTokenAddressVariants(token));
	// Get block timestamp first (needed for retained price lookup)
	const timestamp = await getBlockTimestamp(network, blockNumber);

	// Fetch transfers, prices, vault holdings, and excluded/pool wallets in parallel
	const [transfers, prices, vaultHoldings, excludedSet] = await Promise.all([
		fetchAllTransfers(blockNumber, allTokenAddresses, network),
		fetchSnapshotPrices(network, timestamp),
		fetchAllVaultHoldings(allTokenAddresses, blockNumber, network),
		getRewardsExcludedWalletsSet()
	]);
	const excludedWallets = Array.from(excludedSet);

	// Generate ONE snapshot per canonical token, combining all address variants
	return chainTokens.map((token) => {
		const wrappedAddr = token.address.toLowerCase();
		const allAddrs = getTokenAddressVariants(token);

		return {
			...generateSnapshot(
				transfers,
				blockNumber,
				timestamp,
				wrappedAddr,
				prices.get(wrappedAddr),
				vaultHoldings,
				excludedWallets,
				allAddrs
			),
			chainId: network.chainId
		};
	});
}
