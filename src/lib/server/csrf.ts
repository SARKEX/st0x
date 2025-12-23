import { randomBytes, createHmac } from 'crypto';
import { env } from '$env/dynamic/private';

// CSRF token expiry time (30 minutes)
const TOKEN_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
	const secret = env.SESSION_SECRET || 'default-secret-for-development';
	const timestamp = Date.now().toString();
	const random = randomBytes(16).toString('hex');
	const data = `${timestamp}:${random}`;

	const hmac = createHmac('sha256', secret);
	hmac.update(data);
	const signature = hmac.digest('hex');

	return `${data}:${signature}`;
}

/**
 * Validate a CSRF token
 */
export function validateCsrfToken(token: string): boolean {
	try {
		const secret = env.SESSION_SECRET || 'default-secret-for-development';
		const parts = token.split(':');

		if (parts.length !== 3) {
			return false;
		}

		const [timestamp, random, signature] = parts;
		const data = `${timestamp}:${random}`;

		// Check expiry
		const tokenTime = parseInt(timestamp, 10);
		if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_EXPIRY_MS) {
			return false;
		}

		// Verify signature
		const hmac = createHmac('sha256', secret);
		hmac.update(data);
		const expectedSignature = hmac.digest('hex');

		return signature === expectedSignature;
	} catch {
		return false;
	}
}

/**
 * Get CSRF token from request header
 */
export function getCsrfTokenFromRequest(request: Request): string | null {
	return request.headers.get('x-csrf-token');
}
