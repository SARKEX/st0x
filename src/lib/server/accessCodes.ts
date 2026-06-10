import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';
import { getKv, kvGet, KV_KEYS } from './kv';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { networks } from '$lib/config/networks';
import { recordRpcAttempt, reportChainExhausted } from '$lib/server/rpcMetrics';

// SEC-01 / Phase 3 D-02: Same Alchemy key on both sides per D-02 (single key, single
// rotation event). REL-02 (Plan 03-07) now wraps this in viem's fallback([...])
// transport using the same RPC_URLS shape as src/lib/server/snapshots/generator.ts:14
// (single source of truth in networks.ts). D-02b: module-load throw mirrors the
// CRON_SECRET pattern at src/routes/api/cron/snapshots/+server.ts:45 — fires at cold
// start in production, surfaces in Vercel Logs immediately rather than at first request.
const PRIMARY_RPC_URL = env.BASE_RPC_URL;
if (!dev && !PRIMARY_RPC_URL) {
	throw new Error('[accessCodes] BASE_RPC_URL required in production');
}

// REL-02 / Plan 03-07: viem fallback Transport — same RPC_URLS shape as generator.ts:14.
// PRIMARY_RPC_URL is prepended only when set (production); in dev we fall through to
// networks[0].fallbackRpcUrls (which already starts with https://base-rpc.publicnode.com,
// the prior dev fallback URL).
const RPC_URLS = (PRIMARY_RPC_URL ? [PRIMARY_RPC_URL] : []).concat(networks[0].fallbackRpcUrls);

// Create a public client for Base network for signature verification.
// Supports ECDSA (EOA), EIP-1271 (Smart Contracts), and EIP-6492 (Undeployed).
//
// RESEARCH Pattern 3 + Pitfall 7 (multiplicative-retry trap): viem's fallback transport
// already retries each underlying http() transport `retryCount` times with `retryDelay`
// backoff before falling through to the next URL — do NOT add an outer retry wrapper
// (the helper at $lib/utils/retry.ts is reserved for callers without an inner retry
// primitive, e.g. generator.ts:callRpc). `rank: false` keeps deterministic ordering
// (primary first); per-RPC ranking would reorder by latency, which is incompatible
// with our preference for the paid Alchemy endpoint as the first attempt.
const basePublicClient = createPublicClient({
	chain: base,
	transport: fallback(
		RPC_URLS.map((url) => http(url)),
		{ retryCount: 2, retryDelay: 200, rank: false }
	)
});

// Types
export interface AccessCode {
	code: string;
	maxUses: number | null; // null = unlimited
	currentUses: number;
	expiresAt: string | null; // ISO timestamp, null = never expires
	createdAt: string;
	createdBy: string;
	label: string | null;
}

export interface RegisteredWallet {
	address: string;
	accessCode: string;
	registeredAt: string;
}

// In-memory fallback for development
const devStore = {
	codes: new Map<string, AccessCode>(),
	wallets: new Map<string, RegisteredWallet>(),
	codeWallets: new Map<string, string[]>()
};

// Verify a wallet signature
// Supports: ECDSA (EOA), EIP-1271 (Smart Contract Wallets), EIP-6492 (Undeployed Counterfactual)
//
// OBS-04 instrumentation (D-09 + Plan 03-07): the `rpc_url` label is the synthetic
// stable identifier `'fallback-chain-base'` — single per-call instrumentation per
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
	signature: `0x${string}`
): Promise<boolean> {
	const start = Date.now();
	try {
		// viem's publicClient.verifyMessage handles all signature types:
		// - ECDSA for EOA wallets
		// - EIP-1271 for deployed smart contract wallets (Safe, AA wallets)
		// - EIP-6492 for undeployed counterfactual wallets
		const valid = await basePublicClient.verifyMessage({
			address: address as `0x${string}`,
			message,
			signature
		});
		recordRpcAttempt({
			rpc_url: 'fallback-chain-base',
			fn: 'verifyWalletSignature',
			ok: true,
			status_or_error: valid ? 'verified' : 'mismatch',
			duration_ms: Date.now() - start
		});
		return valid;
	} catch (error) {
		const status_or_error = error instanceof Error ? error.message : 'Unknown verification error';
		recordRpcAttempt({
			rpc_url: 'fallback-chain-base',
			fn: 'verifyWalletSignature',
			ok: false,
			status_or_error,
			duration_ms: Date.now() - start
		});
		// REL-02: viem fallback transport exhausted all RPCs (each retried retryCount
		// times). Surface a chain-exhausted event for OBS-04 alerting.
		await reportChainExhausted({
			fn: 'verifyWalletSignature',
			attempts: [{ rpc_url: 'fallback-chain-base', status_or_error }]
		});
		console.error('[accessCodes] Signature verification failed:', {
			message: status_or_error
		});
		return false;
	}
}

// === Read-only access-code + wallet lookups (admin analytics) ===

export async function getAccessCode(code: string): Promise<AccessCode | null> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<AccessCode>(KV_KEYS.accessCode(normalizedCode));
	}
	return devStore.codes.get(normalizedCode) || null;
}

export async function listAccessCodes(): Promise<AccessCode[]> {
	const kv = await getKv();
	if (kv) {
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		const codes: AccessCode[] = [];
		for (const code of allCodes) {
			const accessCode = await getAccessCode(code);
			if (accessCode) {
				codes.push(accessCode);
			}
		}
		return codes;
	}
	return Array.from(devStore.codes.values());
}

export async function getWalletInfo(address: string): Promise<RegisteredWallet | null> {
	const normalizedAddress = address.toLowerCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<RegisteredWallet>(KV_KEYS.wallet(normalizedAddress));
	}
	return devStore.wallets.get(normalizedAddress) || null;
}

export async function getWalletsByCode(code: string): Promise<string[]> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return (await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode))) || [];
	}
	return devStore.codeWallets.get(normalizedCode) || [];
}
