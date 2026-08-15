import { createPublicClient, defineChain, fallback, http } from 'viem';
import type { Network } from '$lib/config/networks';
import { recordRpcAttempt, reportChainExhausted } from '$lib/server/rpcMetrics';

// SEC-01 / Phase 3 D-02: Same Alchemy key on both sides per D-02 (single key, single
// rotation event). REL-02 (Plan 03-07) now wraps this in viem's fallback([...])
// transport using the same RPC_URLS shape as src/lib/server/snapshots/generator.ts:14
// (single source of truth in networks.ts). D-02b: module-load throw mirrors the
// CRON_SECRET pattern at src/routes/api/cron/snapshots/+server.ts:45 — fires at cold
// start in production, surfaces in Vercel Logs immediately rather than at first request.
// RESEARCH Pattern 3 + Pitfall 7 (multiplicative-retry trap): viem's fallback transport
// already retries each underlying http() transport `retryCount` times with `retryDelay`
// backoff before falling through to the next URL — do NOT add an outer retry wrapper
// (the helper at $lib/utils/retry.ts is reserved for callers without an inner retry
// primitive, e.g. generator.ts:callRpc). `rank: false` keeps deterministic ordering
// (primary first); per-RPC ranking would reorder by latency, which is incompatible
// with our preference for the paid Alchemy endpoint as the first attempt.
// Verify a wallet signature for session login.
// Supports: ECDSA (EOA), EIP-1271 (Smart Contract Wallets), EIP-6492 (Undeployed Counterfactual)
//
// OBS-04 instrumentation (D-09 + Plan 03-07): the `rpc_url` label is the synthetic
// stable identifier `fallback-chain-{chainId}` — single per-call instrumentation per
// RESEARCH §"Pattern 3" + Open Question 4. viem's fallback transport handles the
// per-transport retry / fall-through internally; per-RPC granularity in OBS-04 logs
// is deferred to Phase 4 (custom wrapped Transport with per-attempt instrumentation).
//
// RESEARCH Pitfall 7 (do not wrap): verifyMessage is NOT wrapped in any outer retry
// helper — viem's fallback transport already retries each url retryCount times
// before falling through; an outer wrap would multiply retries (N transports ×
// M retryCount × K outer-retries).
export async function verifyWalletSignature(
	address: string,
	message: string,
	signature: `0x${string}`,
	network: Network
): Promise<boolean> {
	const metricChain = `fallback-chain-${network.chainId}`;
	const client = createPublicClient({
		chain: defineChain({
			id: network.chainId,
			name: network.displayName,
			nativeCurrency: {
				name: network.currencySymbol,
				symbol: network.currencySymbol,
				decimals: 18
			},
			rpcUrls: { default: { http: [network.rpcUrl, ...network.fallbackRpcUrls] } }
		}),
		transport: fallback(
			[network.rpcUrl, ...network.fallbackRpcUrls].map((url) => http(url)),
			{ retryCount: 2, retryDelay: 200, rank: false }
		)
	});
	const start = Date.now();
	try {
		// viem's publicClient.verifyMessage handles all signature types:
		// - ECDSA for EOA wallets
		// - EIP-1271 for deployed smart contract wallets (Safe, AA wallets)
		// - EIP-6492 for undeployed counterfactual wallets
		const valid = await client.verifyMessage({
			address: address as `0x${string}`,
			message,
			signature
		});
		recordRpcAttempt({
			rpc_url: metricChain,
			fn: 'verifyWalletSignature',
			ok: true,
			status_or_error: valid ? 'verified' : 'mismatch',
			duration_ms: Date.now() - start
		});
		return valid;
	} catch (error) {
		const status_or_error = error instanceof Error ? error.message : 'Unknown verification error';
		recordRpcAttempt({
			rpc_url: metricChain,
			fn: 'verifyWalletSignature',
			ok: false,
			status_or_error,
			duration_ms: Date.now() - start
		});
		// REL-02: viem fallback transport exhausted all RPCs (each retried retryCount
		// times). Surface a chain-exhausted event for OBS-04 alerting.
		await reportChainExhausted({
			fn: 'verifyWalletSignature',
			attempts: [{ rpc_url: metricChain, status_or_error }]
		});
		console.error('[accessCodes] Signature verification failed:', {
			message: status_or_error
		});
		return false;
	}
}
