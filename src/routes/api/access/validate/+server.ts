import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateAccessCode } from '$lib/server/accessCodes';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ request }) => {
	// Rate limiting (prevent code enumeration)
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth, 'validate');
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const { code } = await request.json();

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		const validation = await validateAccessCode(code);

		return json({
			valid: validation.valid,
			reason: validation.reason,
			remaining: validation.remaining
		});
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
