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

const ALLOWED_PROXY_ROUTES: Array<{ method: string; pattern: RegExp; cache?: string }> = [
	{ method: 'GET', pattern: /^health$/ },
	{ method: 'GET', pattern: /^v1\/tokens$/ },
	// Shared endpoints — same response for all users, cache at Vercel edge
	{
		method: 'GET',
		pattern: /^v1\/orders\/token\/[^/]+$/,
		cache: 'public, s-maxage=5, stale-while-revalidate=120'
	},
	{
		method: 'GET',
		pattern: /^v1\/trades\/token\/[^/]+$/,
		cache: 'public, s-maxage=5, stale-while-revalidate=120'
	},
	// Per-user endpoints — no shared caching
	{ method: 'GET', pattern: /^v1\/orders\/owner\/[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/(?!taker\/|query$)[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/taker\/[^/]+$/ },
	{ method: 'POST', pattern: /^v1\/trades\/query$/ },
	{ method: 'POST', pattern: /^v1\/swap\/quote$/ },
	{ method: 'POST', pattern: /^v1\/swap\/calldata$/ }
];

function matchProxyRoute(method: string, pathSuffix: string): { cache?: string } | null {
	const route = ALLOWED_PROXY_ROUTES.find((r) => r.method === method && r.pattern.test(pathSuffix));
	return route ? { cache: route.cache } : null;
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
	if (matched.cache && response.ok) {
		responseHeaders.set('Cache-Control', matched.cache);
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
