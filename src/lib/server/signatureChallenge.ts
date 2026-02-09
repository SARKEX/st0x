import crypto from 'crypto';
import { getKv } from './kv';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type SignatureChallengePurpose =
	| 'access_register'
	| 'referral_join'
	| 'referral_update_nickname';

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

function normalizeAddress(address: string): string {
	return address.toLowerCase();
}

function nowMs(): number {
	return Date.now();
}

function generateNonce(): string {
	return crypto.randomBytes(16).toString('hex');
}

function keyForChallenge(
	purpose: SignatureChallengePurpose,
	address: string,
	nonce: string
): string {
	return `signature_challenge:${purpose}:${address}:${nonce}`;
}

function buildAccessRegistrationMessage(
	address: string,
	accessCode: string,
	nonce: string,
	issuedAtIso: string
): string {
	return `Sign to verify wallet ownership for st0x rewards.

Wallet: ${address}
Access Code: ${accessCode}
Nonce: ${nonce}
Issued At: ${issuedAtIso}`;
}

function buildReferralJoinMessage(address: string, nonce: string, issuedAtIso: string): string {
	return `Sign to join the st0x referral programme.

Wallet: ${address}
Nonce: ${nonce}
Issued At: ${issuedAtIso}`;
}

function buildReferralNicknameUpdateMessage(
	address: string,
	nickname: string,
	nonce: string,
	issuedAtIso: string
): string {
	return `Sign to update your st0x referral nickname.

Wallet: ${address}
New Nickname: ${nickname}
Nonce: ${nonce}
Issued At: ${issuedAtIso}`;
}

async function storeChallenge(record: SignatureChallengeRecord): Promise<void> {
	const key = keyForChallenge(record.purpose, record.address, record.nonce);
	const client = await getKv();

	if (client) {
		await client.set(key, JSON.stringify(record), { PX: CHALLENGE_TTL_MS });
		return;
	}

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
		} else {
			raw = await client.get(key);
			if (raw) {
				await client.del(key);
			}
		}

		if (!raw) return null;

		try {
			return JSON.parse(raw) as SignatureChallengeRecord;
		} catch {
			return null;
		}
	}

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

export async function issueAccessRegistrationChallenge(
	address: string,
	accessCode: string
): Promise<ChallengeResponse> {
	const normalizedAddress = normalizeAddress(address);
	const normalizedCode = accessCode.trim().toUpperCase();
	const nonce = generateNonce();
	const issuedAt = nowMs();
	const issuedAtIso = new Date(issuedAt).toISOString();
	const expiresAt = issuedAt + CHALLENGE_TTL_MS;

	const message = buildAccessRegistrationMessage(
		normalizedAddress,
		normalizedCode,
		nonce,
		issuedAtIso
	);

	await storeChallenge({
		purpose: 'access_register',
		address: normalizedAddress,
		nonce,
		message,
		issuedAt,
		expiresAt,
		context: { accessCode: normalizedCode }
	});

	return { nonce, message, expiresAt };
}

export async function verifyAccessRegistrationChallenge(
	address: string,
	nonce: string,
	accessCode: string
): Promise<ChallengeValidationResult> {
	const normalizedAddress = normalizeAddress(address);
	const normalizedCode = accessCode.trim().toUpperCase();
	const record = await consumeChallenge('access_register', normalizedAddress, nonce);
	return validateChallengeRecord(record, { accessCode: normalizedCode });
}

export async function issueReferralJoinChallenge(address: string): Promise<ChallengeResponse> {
	const normalizedAddress = normalizeAddress(address);
	const nonce = generateNonce();
	const issuedAt = nowMs();
	const issuedAtIso = new Date(issuedAt).toISOString();
	const expiresAt = issuedAt + CHALLENGE_TTL_MS;
	const message = buildReferralJoinMessage(normalizedAddress, nonce, issuedAtIso);

	await storeChallenge({
		purpose: 'referral_join',
		address: normalizedAddress,
		nonce,
		message,
		issuedAt,
		expiresAt,
		context: {}
	});

	return { nonce, message, expiresAt };
}

export async function verifyReferralJoinChallenge(
	address: string,
	nonce: string
): Promise<ChallengeValidationResult> {
	const normalizedAddress = normalizeAddress(address);
	const record = await consumeChallenge('referral_join', normalizedAddress, nonce);
	return validateChallengeRecord(record, {});
}

export async function issueReferralNicknameUpdateChallenge(
	address: string,
	nickname: string
): Promise<ChallengeResponse> {
	const normalizedAddress = normalizeAddress(address);
	const normalizedNickname = nickname.trim();
	const nonce = generateNonce();
	const issuedAt = nowMs();
	const issuedAtIso = new Date(issuedAt).toISOString();
	const expiresAt = issuedAt + CHALLENGE_TTL_MS;
	const message = buildReferralNicknameUpdateMessage(
		normalizedAddress,
		normalizedNickname,
		nonce,
		issuedAtIso
	);

	await storeChallenge({
		purpose: 'referral_update_nickname',
		address: normalizedAddress,
		nonce,
		message,
		issuedAt,
		expiresAt,
		context: { nickname: normalizedNickname }
	});

	return { nonce, message, expiresAt };
}

export async function verifyReferralNicknameUpdateChallenge(
	address: string,
	nonce: string,
	nickname: string
): Promise<ChallengeValidationResult> {
	const normalizedAddress = normalizeAddress(address);
	const normalizedNickname = nickname.trim();
	const record = await consumeChallenge('referral_update_nickname', normalizedAddress, nonce);
	return validateChallengeRecord(record, { nickname: normalizedNickname });
}
