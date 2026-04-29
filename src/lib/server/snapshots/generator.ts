// High-level snapshot generator
// Single source of truth for generating snapshots - used by both preview and cron

import type { BlockSnapshot } from './types';
import { fetchAllTransfers, ALL_TOKEN_ADDRESSES } from './scraper';
import { generateSnapshot } from './processor';
import { fetchPythPricesAtTimestamp } from './pyth';
import { fetchAllVaultHoldings } from './vaults';
import { getRewardsExcludedWalletsSet } from '$lib/server/kv';
import { networks } from '$lib/config/networks';
import { TOKENS, getTokenAddressVariants, getTokenByAnyAddress } from '$lib/config/tokens';
import { recordRpcAttempt, reportChainExhausted } from '$lib/server/rpcMetrics';

const RPC_URLS = [networks[0].rpcUrl, ...networks[0].fallbackRpcUrls];

/**
 * Call a JSON-RPC method with fallback across all configured RPC URLs.
 * Returns null if all RPCs fail, or the result field from the first successful response.
 *
 * Phase 1 / OBS-04 instrumentation (D-09): every attempt emits a structured pino line
 * via recordRpcAttempt; chain exhaustion (every iteration failed for a single logical
 * call) fires reportChainExhausted (error-level pino + Slack alert).
 *
 * Pitfall 3 / REL-01 fence: visibility ONLY. The single-attempt-per-RPC behavior is
 * preserved verbatim. The empty-result `continue` semantics (success with `null`
 * result counts as a per-RPC failure here, but the function returns null only if
 * EVERY RPC fails or returns empty) survive; REL-01 in Phase 3 will treat empty as
 * a failure across the chain. The silent latestBlock fallback in
 * getBlockNumberForTimestamp is also REL-01 territory and is NOT touched here.
 */
async function callRpc(method: string, params: unknown[]): Promise<unknown | null> {
	const attempts: Array<{ rpc_url: string; status_or_error: string }> = [];
	for (const rpcUrl of RPC_URLS) {
		const start = Date.now();
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
			});
			if (!response.ok) {
				const status_or_error = `HTTP ${response.status}`;
				recordRpcAttempt({
					rpc_url: rpcUrl,
					fn: `callRpc:${method}`,
					ok: false,
					status_or_error,
					duration_ms: Date.now() - start
				});
				attempts.push({ rpc_url: rpcUrl, status_or_error });
				continue;
			}
			const data = await response.json();
			if (data.result) {
				recordRpcAttempt({
					rpc_url: rpcUrl,
					fn: `callRpc:${method}`,
					ok: true,
					status_or_error: 'ok',
					duration_ms: Date.now() - start
				});
				return data.result;
			}
			// Empty result — Phase 1 still treats as success-with-null; REL-01 in
			// Phase 3 will treat as failure. For OBS-04 visibility we record it as a
			// per-attempt failure so the operator sees empty-result rates in logs.
			recordRpcAttempt({
				rpc_url: rpcUrl,
				fn: `callRpc:${method}`,
				ok: false,
				status_or_error: 'empty result',
				duration_ms: Date.now() - start
			});
			attempts.push({ rpc_url: rpcUrl, status_or_error: 'empty result' });
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
			continue;
		}
	}
	// Chain exhausted — every attempt failed (HTTP error, exception, or empty result).
	await reportChainExhausted({ fn: `callRpc:${method}`, attempts });
	return null;
}

export async function getBlockTimestamp(blockNumber: number): Promise<number> {
	const result = await callRpc('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false]);
	if (result && typeof result === 'object' && 'timestamp' in result) {
		return parseInt((result as { timestamp: string }).timestamp, 16);
	}
	throw new Error('Failed to get block timestamp from any RPC');
}

export async function getCurrentBlockNumber(): Promise<number> {
	const result = await callRpc('eth_blockNumber', []);
	if (typeof result === 'string') {
		return parseInt(result, 16);
	}
	throw new Error('Failed to get current block number from any RPC');
}

/**
 * Get block number for a specific timestamp using binary search via RPC
 */
export async function getBlockNumberForTimestamp(targetTimestamp: number): Promise<number> {
	const latestBlock = await getCurrentBlockNumber();

	let left = 0;
	let right = latestBlock;
	let closestBlock = latestBlock;
	let smallestDiff = Infinity;

	for (let i = 0; i < 30 && left <= right; i++) {
		const mid = Math.floor((left + right) / 2);
		const block = await callRpc('eth_getBlockByNumber', [`0x${mid.toString(16)}`, false]);
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

	return closestBlock;
}

/**
 * Generate a snapshot for a single token at a specific block.
 * Combines holdings across wrapped, unwrapped, and legacy addresses into one snapshot.
 */
export async function generateTokenSnapshot(
	tokenAddress: string,
	blockNumber: number
): Promise<BlockSnapshot> {
	const normalizedToken = tokenAddress.toLowerCase();

	// Find the parent token config to get all address variants
	const parentToken = getTokenByAnyAddress(normalizedToken);
	const allAddresses = parentToken ? getTokenAddressVariants(parentToken) : [normalizedToken];
	const wrappedAddress = parentToken?.address.toLowerCase() ?? normalizedToken;

	// Get block timestamp
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch transfers for all address variants up to target block
	const transfers = await fetchAllTransfers(blockNumber, allAddresses);

	// Fetch Pyth price at block timestamp (only need the wrapped address price)
	const { prices, priceTimestamp } = await fetchPythPricesAtTimestamp(timestamp, [wrappedAddress]);
	const price = prices.get(wrappedAddress);

	// Fetch vault holdings for all address variants at the specific block
	const vaultHoldings = await fetchAllVaultHoldings(allAddresses, blockNumber);

	// Fetch excluded + pool wallets (both excluded from rewards)
	const excludedWallets = Array.from(await getRewardsExcludedWalletsSet());

	// Generate snapshot combining all address variants into one
	return generateSnapshot(
		transfers,
		blockNumber,
		timestamp,
		wrappedAddress,
		price,
		vaultHoldings,
		excludedWallets,
		priceTimestamp,
		allAddresses
	);
}

/**
 * Generate snapshots for all configured tokens at a specific block.
 * More efficient than calling generateTokenSnapshot for each token
 * because it batches the transfer fetch and price fetch.
 *
 * Each token produces ONE snapshot combining holdings across
 * wrapped, unwrapped, and legacy addresses.
 */
export async function generateAllTokenSnapshots(blockNumber: number): Promise<BlockSnapshot[]> {
	// Get block timestamp first (needed for Pyth price lookup)
	const timestamp = await getBlockTimestamp(blockNumber);

	// Fetch transfers, prices, vault holdings, and excluded/pool wallets in parallel
	const [transfers, { prices, priceTimestamp }, vaultHoldings, excludedSet] = await Promise.all([
		fetchAllTransfers(blockNumber, ALL_TOKEN_ADDRESSES),
		fetchPythPricesAtTimestamp(timestamp, ALL_TOKEN_ADDRESSES),
		fetchAllVaultHoldings(ALL_TOKEN_ADDRESSES, blockNumber),
		getRewardsExcludedWalletsSet()
	]);
	const excludedWallets = Array.from(excludedSet);

	// Generate ONE snapshot per canonical token, combining all address variants
	return TOKENS.map((token) => {
		const wrappedAddr = token.address.toLowerCase();
		const allAddrs = getTokenAddressVariants(token);

		return generateSnapshot(
			transfers,
			blockNumber,
			timestamp,
			wrappedAddr,
			prices.get(wrappedAddr),
			vaultHoldings,
			excludedWallets,
			priceTimestamp,
			allAddrs
		);
	});
}
