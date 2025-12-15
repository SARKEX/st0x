import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfToken } from '$lib/server/csrf';

/**
 * Generate a new CSRF token for client-side use
 * Clients should call this before making POST requests to protected endpoints
 */
export const GET: RequestHandler = async () => {
	const token = generateCsrfToken();

	return json({ token });
};
