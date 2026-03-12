import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ORDERS_BY_OWNER_BASE = 'https://api.st0x.io/v1/orders/owner';

export const GET: RequestHandler = async ({ params, url }) => {
	const owner = params.owner;
	if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
		return json({ error: 'Invalid owner address' }, { status: 400 });
	}

	const page = url.searchParams.get('page') ?? '1';
	const pageSize = url.searchParams.get('pageSize') ?? '20';

	const auth = env.PRIVATE_ST0X_SWAP_QUOTE_AUTH;
	const headers: Record<string, string> = {
		accept: 'application/json'
	};
	if (typeof auth === 'string' && auth) {
		headers['Authorization'] = `Basic ${auth}`;
	}

	const query = new URLSearchParams({ page, pageSize }).toString();
	const targetUrl = `${ORDERS_BY_OWNER_BASE}/${owner}?${query}`;

	const res = await fetch(targetUrl, { method: 'GET', headers });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		return json(data, { status: res.status });
	}
	return json(data);
};
