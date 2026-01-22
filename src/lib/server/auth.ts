import crypto from 'crypto';
import { env } from '$env/dynamic/private';

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSessionToken(timestamp: number): string {
	const user = env.BASIC_AUTH_USER || '';
	const pass = env.BASIC_AUTH_PASS || '';
	const secret = env.SESSION_SECRET || 'st0x-session-secret-2024';
	const data = `${timestamp}-${user}:${pass}-${secret}`;
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
	return Boolean(user) && Boolean(pass) && username === user && password === pass;
}
