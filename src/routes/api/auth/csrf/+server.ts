import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfToken } from '$lib/server/csrf';

export const GET: RequestHandler = async () => {
	const token = generateCsrfToken();
	return json({ token });
};
