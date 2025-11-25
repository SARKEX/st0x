import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateAccessCode } from '$lib/server/accessCodes';

export const POST: RequestHandler = async ({ request }) => {
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
