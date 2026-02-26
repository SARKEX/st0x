import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const SWAP_QUOTE_URL = 'https://api.st0x.io/v1/swap/quote';

export const POST: RequestHandler = async ({ request }) => {
	const auth = env.PRIVATE_ST0X_SWAP_QUOTE_AUTH;
	const headers: Record<string, string> = {
		accept: 'application/json',
		'Content-Type': 'application/json'
	};
	if (typeof auth === 'string' && auth) {
		headers['Authorization'] = `Basic ${auth}`;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const res = await fetch(SWAP_QUOTE_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		return json(data, { status: res.status });
	}
	return json(data);
};
