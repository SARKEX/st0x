/**
 * st0x REST API Proxy
 *
 * Proxies requests to the st0x REST API, adding basic auth
 * from server-side environment variables. This keeps credentials
 * out of client-side code.
 */

import { env } from '$env/dynamic/private';
import { getLogger, getRequestContext, requestIdOrUuid } from '$lib/server/logger';
import type { RequestEvent, RequestHandler } from './$types';

const TOKEN_DETAILS_LIST_PATH = 'v1/tokens/details';

function errorResponse(requestId: string, status: number, code: string, message: string): Response {
	return new Response(
		JSON.stringify({
			request_id: requestId,
			error: { code, message }
		}),
		{
			status,
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
				'Cache-Control': 'no-store'
			}
		}
	);
}

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
	{
		method: 'GET',
		pattern: /^v1\/tokens\/details$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/[^/]+\/details$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio\/[^/]+$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio\/[^/]+\/history$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/[^/]+\/proofs$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300'
	},
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
	{ method: 'GET', pattern: /^v1\/trades\/tx\/[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/(?!taker\/|query$)[^/]+$/ },
	{ method: 'GET', pattern: /^v1\/trades\/taker\/[^/]+$/ },
	{ method: 'POST', pattern: /^v1\/trades\/query$/ },
	{ method: 'POST', pattern: /^v1\/swap\/quote$/ },
	{ method: 'POST', pattern: /^v1\/swap\/calldata$/ },
	{ method: 'POST', pattern: /^v2\/swap\/quote$/ },
	{ method: 'POST', pattern: /^v2\/swap\/calldata$/ }
];

function matchProxyRoute(method: string, pathSuffix: string): { cache?: string } | null {
	const route = ALLOWED_PROXY_ROUTES.find((r) => r.method === method && r.pattern.test(pathSuffix));
	return route ? { cache: route.cache } : null;
}

async function shouldCacheResponse(pathSuffix: string, response: Response): Promise<boolean> {
	if (!response.ok) return false;

	if (pathSuffix !== TOKEN_DETAILS_LIST_PATH) return true;

	try {
		const body = (await response.clone().json()) as { errors?: unknown };
		return !Array.isArray(body.errors) || body.errors.length === 0;
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown parse error';
		console.warn('[st0x-proxy] Skipping token details cache for unreadable response:', msg);
		return false;
	}
}

const proxyRequest = async ({ request, params, url }: RequestEvent) => {
	const requestId = requestIdOrUuid(
		getRequestContext()?.request_id ?? request.headers.get('x-request-id')
	);
	let apiBase: string;
	let authHeader: string;
	try {
		apiBase = getApiBase();
		authHeader = getAuthHeader();
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Proxy configuration error';
		getLogger().error({ error: { message: msg } }, 'st0x proxy configuration error');
		return errorResponse(requestId, 503, 'UPSTREAM_UNAVAILABLE', 'The trading API is unavailable');
	}

	const pathSuffix = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
	const matched = matchProxyRoute(request.method, pathSuffix);
	if (!matched) {
		return errorResponse(requestId, 404, 'NOT_FOUND', 'Proxy route not found');
	}
	const targetUrl = `${apiBase}/${pathSuffix}${url.search}`;

	const headers = new Headers();
	headers.set('Content-Type', 'application/json');
	headers.set('Accept', 'application/json');
	headers.set('Authorization', authHeader);
	headers.set('X-Request-Id', requestId);

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
		getLogger().error(
			{ error: { message: msg }, upstream_path: pathSuffix },
			'st0x upstream request failed'
		);
		return errorResponse(requestId, 503, 'UPSTREAM_UNAVAILABLE', 'The trading API is unavailable');
	}

	const responseHeaders = new Headers();
	responseHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
	for (const headerName of ['x-request-id', 'retry-after']) {
		const value = response.headers.get(headerName);
		if (value) responseHeaders.set(headerName, value);
	}
	if (!response.ok) {
		responseHeaders.set('Cache-Control', 'no-store');
	} else if (matched.cache && (await shouldCacheResponse(pathSuffix, response))) {
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
