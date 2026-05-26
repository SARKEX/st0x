/**
 * st0x REST API Proxy
 *
 * Proxies requests to the st0x REST API, adding basic auth
 * from server-side environment variables. This keeps credentials
 * out of client-side code.
 */

import { env } from '$env/dynamic/private';
import type { RequestEvent, RequestHandler } from './$types';

function getApiBase(): string {
	const url = env.ST0X_API_URL;
	if (!url) {
		throw new Error('ST0X_API_URL environment variable is not set');
	}
	// Strip trailing slash
	return url.replace(/\/+$/, '');
}

function getAuthHeader(): string {
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!key || !secret) {
		throw new Error('ST0X_API_KEY and ST0X_API_SECRET must be configured');
	}
	return 'Basic ' + btoa(`${key}:${secret}`);
}

/** Vercel CDN TTL for shared token orderbook/trade list responses (~30s max staleness). */
const TOKEN_LIST_EDGE_CACHE = 'public, s-maxage=15, stale-while-revalidate=15';

/** Browsers must not cache orderbook JSON (fetch respects Cache-Control). */
const TOKEN_LIST_BROWSER_CACHE = 'private, no-cache, max-age=0, must-revalidate';

const ALLOWED_PROXY_ROUTES: Array<{
	method: string;
	pattern: RegExp;
	edgeCache?: string;
	browserCache?: string;
}> = [
	{ method: 'GET', pattern: /^health$/ },
	// Token orderbook/trades: CDN-Cache-Control for edge; no browser HTTP cache.
	{
		method: 'GET',
		pattern: /^v1\/orders\/token\/[^/]+$/,
		edgeCache: TOKEN_LIST_EDGE_CACHE,
		browserCache: TOKEN_LIST_BROWSER_CACHE
	},
	{
		method: 'GET',
		pattern: /^v1\/trades\/token\/[^/]+$/,
		edgeCache: TOKEN_LIST_EDGE_CACHE,
		browserCache: TOKEN_LIST_BROWSER_CACHE
	},
	// Per-user endpoints — no shared caching
	{ method: 'GET', pattern: /^v1\/orders\/owner\/[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/(?!taker\/|batch$)[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/taker\/[^/]+$/ },
	{ method: 'POST', pattern: /^v1\/trades\/batch$/ }
];

function matchProxyRoute(
	method: string,
	pathSuffix: string
): { edgeCache?: string; browserCache?: string } | null {
	const route = ALLOWED_PROXY_ROUTES.find(
		(r) => r.method === method && r.pattern.test(pathSuffix)
	);
	return route
		? { edgeCache: route.edgeCache, browserCache: route.browserCache }
		: null;
}

const proxyRequest = async ({ request, params, url }: RequestEvent) => {
	let apiBase: string;
	let authHeader: string;
	try {
		apiBase = getApiBase();
		authHeader = getAuthHeader();
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Proxy configuration error';
		console.error('[st0x-proxy] Config error:', msg);
		return new Response(JSON.stringify({ error: msg }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const pathSuffix = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
	const matched = matchProxyRoute(request.method, pathSuffix);
	if (!matched) {
		return new Response('Not found', { status: 404 });
	}
	const targetUrl = `${apiBase}/${pathSuffix}${url.search}`;

	const headers = new Headers();
	headers.set('Content-Type', 'application/json');
	headers.set('Accept', 'application/json');
	headers.set('Authorization', authHeader);

	const init: RequestInit = {
		method: request.method,
		headers: headers as HeadersInit,
		signal: request.signal
	};

	if (!['GET', 'HEAD'].includes(request.method)) {
		const body = await request.arrayBuffer();
		init.body = body;
	}

	let response: Response;
	try {
		response = await fetch(targetUrl, init);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown upstream error';
		console.error(`[st0x-proxy] Upstream fetch failed (${targetUrl}):`, msg);
		return new Response(JSON.stringify({ error: 'Upstream API unreachable', detail: msg }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const responseHeaders = new Headers();
	responseHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
	if (response.ok) {
		if (matched.browserCache) {
			responseHeaders.set('Cache-Control', matched.browserCache);
		}
		if (matched.edgeCache) {
			// Vercel uses CDN-Cache-Control / Vercel-CDN-Cache-Control for edge; Cache-Control for browsers.
			responseHeaders.set('CDN-Cache-Control', matched.edgeCache);
			responseHeaders.set('Vercel-CDN-Cache-Control', matched.edgeCache);
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders
	});
};

const handleOptions: RequestHandler = async () =>
	new Response(null, {
		headers: {
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
		}
	});

export const GET: RequestHandler = proxyRequest;
export const POST: RequestHandler = proxyRequest;
export const OPTIONS = handleOptions;
