import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ORDERS_BY_TOKEN_BASE = 'https://api.st0x.io/v1/orders/token';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = params.token;
	if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
		return json({ error: 'Invalid token address' }, { status: 400 });
	}

	const side = url.searchParams.get('side') ?? 'input';
	const page = url.searchParams.get('page') ?? '1';
	const pageSize = url.searchParams.get('pageSize') ?? '20';

	const auth = env.PRIVATE_ST0X_SWAP_QUOTE_AUTH;
	const headers: Record<string, string> = {
		accept: 'application/json'
	};
	if (typeof auth === 'string' && auth) {
		headers['Authorization'] = `Basic ${auth}`;
	}

	const query = new URLSearchParams({ side, page, pageSize }).toString();
	const targetUrl = `${ORDERS_BY_TOKEN_BASE}/${token}?${query}`;

	const res = await fetch(targetUrl, { method: 'GET', headers });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		return json(data, { status: res.status });
	}
	return json(data);
};
