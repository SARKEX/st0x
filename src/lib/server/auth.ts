import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// SEC-02: fail-closed at module load in production when SESSION_SECRET is missing.
// Mirrors the CRON_SECRET precedent at src/routes/api/cron/snapshots/+server.ts:42-49,
// but throws at module-top so a missing secret crashes the lambda at cold start
// (visible in Vercel Logs immediately) rather than silently using a known/committed
// dev fallback that any repo reader could forge.
if (!dev && !env.SESSION_SECRET) {
	throw new Error('[auth] SESSION_SECRET required in production');
}
const SESSION_SECRET = env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSessionToken(timestamp: number): string {
	const user = env.BASIC_AUTH_USER || '';
	const pass = env.BASIC_AUTH_PASS || '';
	const data = `${timestamp}-${user}:${pass}-${SESSION_SECRET}`;
	return crypto.createHash('sha256').update(data).digest('hex');
}

export function verifySessionToken(token: string, timestamp: number): boolean {
	const now = Date.now();

	// Check timestamp validity first (non-sensitive check)
	if (now - timestamp >= SESSION_DURATION_MS) {
		return false;
	}

	const expected = createSessionToken(timestamp);

	// Use constant-time comparison to prevent timing attacks
	// Both tokens should be hex strings of the same length (SHA256 = 64 chars)
	if (token.length !== expected.length) {
		return false;
	}

	return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function validateCredentials(username: string, password: string): boolean {
	const user = env.BASIC_AUTH_USER || '';
	const pass = env.BASIC_AUTH_PASS || '';

	if (!user || !pass) return false;

	// Use constant-time comparison to prevent timing attacks
	// Both strings must be same length for timingSafeEqual
	const userMatch =
		username.length === user.length &&
		crypto.timingSafeEqual(Buffer.from(username, 'utf8'), Buffer.from(user, 'utf8'));
	const passMatch =
		password.length === pass.length &&
		crypto.timingSafeEqual(Buffer.from(password, 'utf8'), Buffer.from(pass, 'utf8'));

	return userMatch && passMatch;
}
