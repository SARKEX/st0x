import crypto from 'crypto';
import { BASIC_AUTH_USER, BASIC_AUTH_PASS } from '$env/static/private';
import { env } from '$env/dynamic/private';

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSessionToken(timestamp: number): string {
	const user = BASIC_AUTH_USER || '';
	const pass = BASIC_AUTH_PASS || '';
	const secret = env.SESSION_SECRET || 'st0x-session-secret-2024';
	const data = `${timestamp}-${user}:${pass}-${secret}`;
	return crypto.createHash('sha256').update(data).digest('hex');
}

export function verifySessionToken(token: string, timestamp: number): boolean {
	const expected = createSessionToken(timestamp);
	const now = Date.now();
	return token === expected && now - timestamp < SESSION_DURATION_MS;
}

export function validateCredentials(username: string, password: string): boolean {
	const user = BASIC_AUTH_USER || '';
	const pass = BASIC_AUTH_PASS || '';
	return Boolean(user) && Boolean(pass) && username === user && password === pass;
}
