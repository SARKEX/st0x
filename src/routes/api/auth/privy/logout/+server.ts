import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateCsrfToken, getCsrfTokenFromRequest } from '$lib/server/csrf';

export const POST: RequestHandler = async ({ request }) => {
	// CSRF protection - validate token from header
	const csrfToken = getCsrfTokenFromRequest(request);
	if (!csrfToken || !validateCsrfToken(csrfToken)) {
		return json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
	}

	// Server-side logout is mostly a no-op since we use client-side token storage
	// The client will clear its local storage
	// If we add server-side sessions in the future, clear them here

	return json({ success: true });
};
