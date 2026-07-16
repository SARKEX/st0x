/**
 * TEMP public proxy: translates Raindex SDK v6 GraphQL (`raindex`) to the
 * still-live Goldsky `orderbook` schema. Remove when the renamed subgraph URL
 * is wired into `src/lib/clients/raindex.ts`.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxyRaindexSubgraphCompat } from '$lib/server/raindexSubgraphCompat';

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json') && !contentType.includes('application/graphql')) {
		throw error(415, 'Expected application/json GraphQL body');
	}

	const body = await request.text();
	if (!body) throw error(400, 'Empty body');

	const { status, body: responseBody } = await proxyRaindexSubgraphCompat(body);
	return new Response(responseBody, {
		status,
		headers: { 'content-type': 'application/json' }
	});
};
