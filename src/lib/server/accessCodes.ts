import crypto from 'crypto';
import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';
import { getKv, kvGet, kvSet, kvDel, KV_KEYS } from './kv';
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

interface AccessCodeValidation {
	valid: boolean;
	reason?: string;
	remaining?: number;
}

export const REGISTRATION_SERVICE_UNAVAILABLE_ERROR = 'Registration service unavailable';

// In-memory fallback for development
const devStore = {
	codes: new Map<string, AccessCode>(),
	wallets: new Map<string, RegisteredWallet>(),
	codeWallets: new Map<string, string[]>()
};

// SEC-05: rejection-sampled CSPRNG pick from a fixed alphabet.
// `limit = floor(256/N)*N` discards bytes that would otherwise bias indices on
// alphabets where N does not divide 256 evenly (RESEARCH §Pitfall 9). For the
// 32-char access-code alphabet limit = 256 exactly, so no rejection actually
// occurs — but the helper shape stays uniform with referrals.ts (31-char).
function pickFromAlphabet(alphabet: string): string {
	const n = alphabet.length;
	const limit = Math.floor(256 / n) * n;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const byte = crypto.randomBytes(1)[0];
		if (byte < limit) return alphabet[byte % n];
	}
}

// Generate a random code in format ST0X-XXXX-XXXX
export function generateAccessCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0, O, 1, I)
	const randomPart = (length: number) =>
		Array.from({ length }, () => pickFromAlphabet(chars)).join('');
	return `ST0X-${randomPart(4)}-${randomPart(4)}`;
}

// Create the message that users need to sign
export function createSignMessage(address: string, code: string): string {
	return `Sign to verify wallet ownership for st0x rewards.

Wallet: ${address}
Access Code: ${code}
Timestamp: ${Date.now()}`;
}

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

// === Access Code Management ===

export async function createAccessCode(
	code: string | null,
	maxUses: number | null,
	expiresAt: string | null,
	label: string | null,
	createdBy: string
): Promise<AccessCode> {
	const finalCode = (code?.trim() || generateAccessCode()).toUpperCase();

	const accessCode: AccessCode = {
		code: finalCode,
		maxUses,
		currentUses: 0,
		expiresAt,
		createdAt: new Date().toISOString(),
		createdBy,
		label
	};

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(finalCode), accessCode);
		// Add to list of all codes
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		if (!allCodes.includes(finalCode)) {
			allCodes.push(finalCode);
			await kvSet(KV_KEYS.allCodes(), allCodes);
		}
	} else {
		devStore.codes.set(finalCode, accessCode);
	}

	return accessCode;
}

export async function getAccessCode(code: string): Promise<AccessCode | null> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<AccessCode>(KV_KEYS.accessCode(normalizedCode));
	}
	return devStore.codes.get(normalizedCode) || null;
}

export async function validateAccessCode(
	code: string
): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
	const accessCode = await getAccessCode(code);

	if (!accessCode) {
		return { valid: false, reason: 'Invalid access code' };
	}

	return getAccessCodeValidation(accessCode);
}

export async function incrementCodeUsage(code: string): Promise<void> {
	const normalizedCode = code.trim().toUpperCase();
	const accessCode = await getAccessCode(normalizedCode);

	if (!accessCode) return;

	accessCode.currentUses += 1;

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(normalizedCode), accessCode);
	} else {
		devStore.codes.set(normalizedCode, accessCode);
	}
}

export async function updateAccessCode(
	code: string,
	updates: {
		maxUses?: number | null;
		expiresAt?: string | null;
		label?: string | null;
	}
): Promise<AccessCode | null> {
	const normalizedCode = code.trim().toUpperCase();
	const accessCode = await getAccessCode(normalizedCode);

	if (!accessCode) return null;

	// Apply updates
	if ('maxUses' in updates) {
		accessCode.maxUses = updates.maxUses ?? null;
	}
	if ('expiresAt' in updates) {
		accessCode.expiresAt = updates.expiresAt ?? null;
	}
	if ('label' in updates) {
		accessCode.label = updates.label ?? null;
	}

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.accessCode(normalizedCode), accessCode);
	} else {
		devStore.codes.set(normalizedCode, accessCode);
	}

	return accessCode;
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

export async function deleteAccessCode(code: string): Promise<boolean> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		await kvDel(KV_KEYS.accessCode(normalizedCode));
		// Remove from all codes list
		const allCodes = (await kvGet<string[]>(KV_KEYS.allCodes())) || [];
		const filtered = allCodes.filter((c: string) => c !== normalizedCode);
		await kvSet(KV_KEYS.allCodes(), filtered);
		return true;
	}

	return devStore.codes.delete(normalizedCode);
}

// === Wallet Management ===

export async function isWalletRegistered(address: string): Promise<boolean> {
	const normalizedAddress = address.toLowerCase();

	const kv = await getKv();
	if (kv) {
		const wallet = await kvGet<RegisteredWallet>(KV_KEYS.wallet(normalizedAddress));
		return wallet !== null;
	}

	// In production, fail open when Redis is unavailable rather than treating
	// all wallets as unregistered (devStore is always empty on Vercel).
	// This prevents redirect loops when Redis has connection issues.
	if (process.env.NODE_ENV === 'production') {
		console.warn(
			'[accessCodes] Redis unavailable, failing open for wallet check:',
			normalizedAddress
		);
		return true;
	}

	return devStore.wallets.has(normalizedAddress);
}

export async function getWalletInfo(address: string): Promise<RegisteredWallet | null> {
	const normalizedAddress = address.toLowerCase();

	const kv = await getKv();
	if (kv) {
		return await kvGet<RegisteredWallet>(KV_KEYS.wallet(normalizedAddress));
	}
	return devStore.wallets.get(normalizedAddress) || null;
}

export async function registerWallet(address: string, code: string): Promise<RegisteredWallet> {
	const normalizedAddress = address.toLowerCase();
	const normalizedCode = code.trim().toUpperCase();

	const wallet: RegisteredWallet = {
		address: normalizedAddress,
		accessCode: normalizedCode,
		registeredAt: new Date().toISOString()
	};

	const kv = await getKv();
	if (kv) {
		await kvSet(KV_KEYS.wallet(normalizedAddress), wallet);
		// Add to code's wallet list for analytics
		const codeWallets = (await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode))) || [];
		if (!codeWallets.includes(normalizedAddress)) {
			codeWallets.push(normalizedAddress);
			await kvSet(KV_KEYS.codeWallets(normalizedCode), codeWallets);
		}
	} else {
		devStore.wallets.set(normalizedAddress, wallet);
		const existing = devStore.codeWallets.get(normalizedCode) || [];
		if (!existing.includes(normalizedAddress)) {
			existing.push(normalizedAddress);
			devStore.codeWallets.set(normalizedCode, existing);
		}
	}

	// Increment code usage
	await incrementCodeUsage(normalizedCode);

	return wallet;
}

export async function getWalletsByCode(code: string): Promise<string[]> {
	const normalizedCode = code.trim().toUpperCase();

	const kv = await getKv();
	if (kv) {
		return (await kvGet<string[]>(KV_KEYS.codeWallets(normalizedCode))) || [];
	}
	return devStore.codeWallets.get(normalizedCode) || [];
}

// === Full Registration Flow ===

export interface RegistrationResult {
	success: boolean;
	error?: string;
	wallet?: RegisteredWallet;
}

export async function processRegistration(
	address: string,
	code: string,
	signature: `0x${string}`,
	message: string
): Promise<RegistrationResult> {
	// 1. Verify signature
	const signatureValid = await verifyWalletSignature(address, message, signature);
	if (!signatureValid) {
		return { success: false, error: 'Signature verification failed' };
	}

	const kv = await getKv();
	if (!kv) {
		if (process.env.NODE_ENV === 'production') {
			return { success: false, error: REGISTRATION_SERVICE_UNAVAILABLE_ERROR };
		}
		return processRegistrationInMemory(address, code);
	}

	return processRegistrationWithRedis(address, code);
}

function getAccessCodeValidation(accessCode: AccessCode): AccessCodeValidation {
	// Check expiration
	if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
		return { valid: false, reason: 'Access code has expired' };
	}

	// Check usage limit
	if (accessCode.maxUses !== null && accessCode.currentUses >= accessCode.maxUses) {
		return { valid: false, reason: 'Access code has reached maximum uses' };
	}

	const remaining =
		accessCode.maxUses !== null ? accessCode.maxUses - accessCode.currentUses : undefined;

	return { valid: true, remaining };
}

function parseAccessCodeJson(raw: string): AccessCode | null {
	try {
		return JSON.parse(raw) as AccessCode;
	} catch {
		return null;
	}
}

function parseCodeWalletsJson(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

async function processRegistrationWithRedis(
	address: string,
	code: string
): Promise<RegistrationResult> {
	const normalizedAddress = address.toLowerCase();
	const normalizedCode = code.trim().toUpperCase();
	const walletKey = KV_KEYS.wallet(normalizedAddress);
	const codeKey = KV_KEYS.accessCode(normalizedCode);
	const codeWalletsKey = KV_KEYS.codeWallets(normalizedCode);
	const kv = await getKv();

	if (!kv) {
		if (process.env.NODE_ENV === 'production') {
			return { success: false, error: REGISTRATION_SERVICE_UNAVAILABLE_ERROR };
		}
		return processRegistrationInMemory(address, code);
	}

	for (let attempt = 0; attempt < 5; attempt++) {
		const isolated = kv.duplicate();
		await isolated.connect();
		try {
			await isolated.watch([walletKey, codeKey, codeWalletsKey]);

			const [existingWalletRaw, accessCodeRaw, codeWalletsRaw] = await Promise.all([
				isolated.get(walletKey),
				isolated.get(codeKey),
				isolated.get(codeWalletsKey)
			]);

			if (existingWalletRaw) {
				return { success: false, error: 'Wallet is already registered' };
			}

			if (!accessCodeRaw) {
				return { success: false, error: 'Invalid access code' };
			}

			const accessCode = parseAccessCodeJson(accessCodeRaw);
			if (!accessCode) {
				return { success: false, error: 'Invalid access code data' };
			}

			const validation = getAccessCodeValidation(accessCode);
			if (!validation.valid) {
				return { success: false, error: validation.reason };
			}

			const wallet: RegisteredWallet = {
				address: normalizedAddress,
				accessCode: normalizedCode,
				registeredAt: new Date().toISOString()
			};

			const codeWallets = parseCodeWalletsJson(codeWalletsRaw);
			if (!codeWallets.includes(normalizedAddress)) {
				codeWallets.push(normalizedAddress);
			}

			accessCode.currentUses += 1;

			const tx = isolated.multi();
			tx.set(walletKey, JSON.stringify(wallet));
			tx.set(codeKey, JSON.stringify(accessCode));
			tx.set(codeWalletsKey, JSON.stringify(codeWallets));

			const txResult = await tx.exec();
			if (txResult) {
				return { success: true, wallet };
			}
		} finally {
			await isolated.disconnect();
		}
	}

	return {
		success: false,
		error: 'Registration conflicted with another request. Please retry.'
	};
}

function processRegistrationInMemory(address: string, code: string): RegistrationResult {
	const normalizedAddress = address.toLowerCase();
	const normalizedCode = code.trim().toUpperCase();

	if (devStore.wallets.has(normalizedAddress)) {
		return { success: false, error: 'Wallet is already registered' };
	}

	const accessCode = devStore.codes.get(normalizedCode);
	if (!accessCode) {
		return { success: false, error: 'Invalid access code' };
	}

	const validation = getAccessCodeValidation(accessCode);
	if (!validation.valid) {
		return { success: false, error: validation.reason };
	}

	const wallet: RegisteredWallet = {
		address: normalizedAddress,
		accessCode: normalizedCode,
		registeredAt: new Date().toISOString()
	};

	devStore.wallets.set(normalizedAddress, wallet);
	const existing = devStore.codeWallets.get(normalizedCode) || [];
	if (!existing.includes(normalizedAddress)) {
		existing.push(normalizedAddress);
		devStore.codeWallets.set(normalizedCode, existing);
	}

	accessCode.currentUses += 1;
	devStore.codes.set(normalizedCode, accessCode);

	return { success: true, wallet };
}
