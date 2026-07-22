import crypto from 'crypto';
import { getKv } from './kv';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_IN_MEMORY_CHALLENGES = 5000;
const ATOMIC_GET_DEL_SCRIPT = `
	local value = redis.call('GET', KEYS[1])
	if value then
		redis.call('DEL', KEYS[1])
	end
	return value
`;

export type SignatureChallengePurpose = 'session_login';

interface SignatureChallengeRecord {
	purpose: SignatureChallengePurpose;
	address: string;
	nonce: string;
	message: string;
	issuedAt: number;
	expiresAt: number;
	context: Record<string, string>;
}

interface ChallengeResponse {
	nonce: string;
	message: string;
	expiresAt: number;
}

interface ChallengeValidationResult {
	valid: boolean;
	message?: string;
	error?: string;
}

const inMemoryChallenges = new Map<string, SignatureChallengeRecord>();

export class ChallengeStorageUnavailableError extends Error {
	constructor(message: string = 'Challenge storage unavailable') {
		super(message);
		this.name = 'ChallengeStorageUnavailableError';
	}
}

function normalizeAddress(address: string): string {
	return address.toLowerCase();
}

function nowMs(): number {
	return Date.now();
}

function generateNonce(): string {
	return crypto.randomBytes(16).toString('hex');
}

function isProductionRuntime(): boolean {
	return process.env.NODE_ENV === 'production';
}

function pruneInMemoryChallenges(now: number = nowMs()): void {
	for (const [key, record] of inMemoryChallenges.entries()) {
		if (record.expiresAt <= now) {
			inMemoryChallenges.delete(key);
		}
	}

	while (inMemoryChallenges.size > MAX_IN_MEMORY_CHALLENGES) {
		const oldestKey = inMemoryChallenges.keys().next().value;
		if (!oldestKey) break;
		inMemoryChallenges.delete(oldestKey);
	}
}

function keyForChallenge(
	purpose: SignatureChallengePurpose,
	address: string,
	nonce: string
): string {
	return `signature_challenge:${purpose}:${address}:${nonce}`;
}

function buildSessionLoginMessage(address: string, nonce: string, issuedAtIso: string): string {
	return `Sign in to st0x.

Wallet: ${address}
Nonce: ${nonce}
Issued At: ${issuedAtIso}

This signature does not authorize any transaction; it only proves wallet ownership for the session cookie. Expires in 5 minutes.`;
}

async function storeChallenge(record: SignatureChallengeRecord): Promise<void> {
	const key = keyForChallenge(record.purpose, record.address, record.nonce);
	const client = await getKv();

	if (client) {
		await client.set(key, JSON.stringify(record), { PX: CHALLENGE_TTL_MS });
		return;
	}

	if (isProductionRuntime()) {
		throw new ChallengeStorageUnavailableError();
	}

	pruneInMemoryChallenges(record.issuedAt);
	inMemoryChallenges.set(key, record);
}

async function consumeChallenge(
	purpose: SignatureChallengePurpose,
	address: string,
	nonce: string
): Promise<SignatureChallengeRecord | null> {
	const key = keyForChallenge(purpose, address, nonce);
	const client = await getKv();

	if (client) {
		let raw: string | null = null;

		// Prefer GETDEL for atomic one-time challenge consumption.
		if ('getDel' in client && typeof client.getDel === 'function') {
			raw = await client.getDel(key);
		} else if ('eval' in client && typeof client.eval === 'function') {
			const result = await client.eval(ATOMIC_GET_DEL_SCRIPT, { keys: [key] });
			raw = typeof result === 'string' ? result : null;
		} else {
			throw new ChallengeStorageUnavailableError(
				'Challenge storage client does not support atomic challenge consumption'
			);
		}

		if (!raw) return null;

		try {
			return JSON.parse(raw) as SignatureChallengeRecord;
		} catch {
			return null;
		}
	}

	if (isProductionRuntime()) {
		throw new ChallengeStorageUnavailableError();
	}

	pruneInMemoryChallenges();
	const record = inMemoryChallenges.get(key);
	if (!record) return null;
	inMemoryChallenges.delete(key);
	return record;
}

function validateChallengeRecord(
	record: SignatureChallengeRecord | null,
	validators: Record<string, string>
): ChallengeValidationResult {
	if (!record) {
		return { valid: false, error: 'Missing or already used challenge' };
	}

	if (record.expiresAt <= nowMs()) {
		return { valid: false, error: 'Challenge expired' };
	}

	for (const [key, expectedValue] of Object.entries(validators)) {
		if ((record.context[key] || '') !== expectedValue) {
			return { valid: false, error: 'Challenge context mismatch' };
		}
	}

	return { valid: true, message: record.message };
}

// SEC-03 / Plan 03-08a: session-login challenge purpose. User POSTs address
// to /api/auth/session/challenge → this function issues a one-time nonce; the
// user signs the returned message; /api/auth/session POST consumes the nonce
// via verifySessionLoginChallenge atomically (one-time Lua GET+DEL). On
// success the session cookie is minted by walletSession.ts.
export async function issueSessionLoginChallenge(address: string): Promise<ChallengeResponse> {
	const normalizedAddress = normalizeAddress(address);
	const nonce = generateNonce();
	const issuedAt = nowMs();
	const issuedAtIso = new Date(issuedAt).toISOString();
	const expiresAt = issuedAt + CHALLENGE_TTL_MS;
	const message = buildSessionLoginMessage(normalizedAddress, nonce, issuedAtIso);

	await storeChallenge({
		purpose: 'session_login',
		address: normalizedAddress,
		nonce,
		message,
		issuedAt,
		expiresAt,
		context: {}
	});

	return { nonce, message, expiresAt };
}

export async function verifySessionLoginChallenge(
	address: string,
	nonce: string
): Promise<ChallengeValidationResult> {
	const normalizedAddress = normalizeAddress(address);
	const record = await consumeChallenge('session_login', normalizedAddress, nonce);
	return validateChallengeRecord(record, {});
}
