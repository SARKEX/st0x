import crypto from 'crypto';
import { getKv } from './kv';

// SEC-03 (CONTEXT D-04a; RESEARCH A2 + Pattern 1): KV-backed session record
// minted at /api/auth/session POST after wallet signature verification.
// 30-day absolute expiry with sliding refresh throttled to 1 KV write per 24h.
// Re-sign happens only on (a) 30-day inactivity (record TTL'd out),
// (b) explicit logout (deleteSession), (c) admin invalidation (KV.del via console),
// (d) cookie clear / device change.
//
// Per D-04b: validation is HMAC/KV-only — never re-prompts wallet signature.

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (D-04a)
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // refresh once per 24h (RESEARCH A2)

export interface WalletSessionRecord {
	walletAddress: string;
	issuedAt: number;
	lastSeenAt: number;
}

function sessionKey(sessionId: string): string {
	return `wallet_session:${sessionId}`;
}

/**
 * Mint a new server-side session record bound to a verified wallet address.
 * Caller is responsible for verifying the wallet signature BEFORE invoking
 * createSession (e.g. via verifyWalletSignature on the REL-02 fallback chain).
 *
 * Returns the random 32-byte CSPRNG sessionId (hex-encoded, 64 chars) — the
 * caller sets it as an HttpOnly + Secure + SameSite=Strict cookie.
 */
export async function createSession(
	walletAddress: string
): Promise<{ sessionId: string; expiresAt: number }> {
	const sessionId = crypto.randomBytes(32).toString('hex'); // 64 hex chars
	const now = Date.now();
	const record: WalletSessionRecord = {
		walletAddress: walletAddress.toLowerCase(),
		issuedAt: now,
		lastSeenAt: now
	};
	const kv = await getKv();
	if (!kv) {
		// Fail closed — server cannot durably remember the session, so a session
		// cookie minted here would be useless. Same posture as
		// ChallengeStorageUnavailableError in signatureChallenge.ts.
		throw new Error('Session storage unavailable');
	}
	await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
	return { sessionId, expiresAt: now + SESSION_TTL_MS };
}

/**
 * Read a session record by id. Returns null when KV is unavailable or the
 * record has expired (Redis TTL handles natural expiry — no manual check).
 */
export async function readSession(sessionId: string): Promise<WalletSessionRecord | null> {
	const kv = await getKv();
	if (!kv) return null;
	const raw = await kv.get(sessionKey(sessionId));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as WalletSessionRecord;
	} catch {
		return null;
	}
}

/**
 * Sliding-refresh helper: if the session record's lastSeenAt is older than
 * REFRESH_THRESHOLD_MS (24h), reset it to now AND extend the KV TTL by another
 * 30 days. Otherwise no-op (caps KV writes to once per 24h per session).
 *
 * Mutates the passed record in place so callers reading walletAddress from it
 * see the fresh lastSeenAt timestamp without an extra round trip.
 */
export async function maybeRefreshSession(
	sessionId: string,
	record: WalletSessionRecord
): Promise<void> {
	const now = Date.now();
	if (now - record.lastSeenAt < REFRESH_THRESHOLD_MS) return;
	const kv = await getKv();
	if (!kv) return;
	record.lastSeenAt = now;
	await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
}

/**
 * Delete the session record (logout / admin invalidation). Caller is also
 * responsible for clearing the 'session' cookie via cookies.delete('session',
 * { path: '/' }) — Pitfall 10 in RESEARCH (path required on delete).
 */
export async function deleteSession(sessionId: string): Promise<void> {
	const kv = await getKv();
	if (!kv) return;
	await kv.del(sessionKey(sessionId));
}
