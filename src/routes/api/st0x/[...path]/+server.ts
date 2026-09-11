/**
 * st0x REST API Proxy
 *
 * Proxies requests to the st0x REST API, adding basic auth
 * from server-side environment variables. This keeps credentials
 * out of client-side code.
 */

import { env } from '$env/dynamic/private';
import { getLogger, getRequestContext, requestIdOrUuid } from '$lib/server/logger';
import { logSt0xRequestBudget } from '$lib/server/st0xBudgetTelemetry';
import { getCachedSt0xResponse, type CachedSt0xResponse } from '$lib/server/st0xProxyCache';
import type { RequestEvent, RequestHandler } from './$types';

const TOKEN_DETAILS_LIST_PATH = 'v1/tokens/details';
const TOKEN_LIST_PATH = 'v1/tokens';
const TOKEN_DETAILS_PATH = /^v1\/tokens\/[^/]+\/details$/;

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

const ALLOWED_PROXY_ROUTES: Array<{
	method: string;
	pattern: RegExp;
	cache?: string;
	originTtlSeconds?: number;
}> = [
	{ method: 'GET', pattern: /^health$/ },
	{
		method: 'GET',
		pattern: /^v1\/tokens$/,
		cache: 'public, s-maxage=300, stale-while-revalidate=3600',
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/details$/,
		cache: 'public, s-maxage=300, stale-while-revalidate=3600',
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/[^/]+\/details$/,
		cache: 'public, s-maxage=300, stale-while-revalidate=3600',
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300',
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio\/[^/]+$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300',
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/wrap-ratio\/[^/]+\/history$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=300',
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v1\/tokens\/[^/]+\/proofs$/,
		cache: 'public, s-maxage=300, stale-while-revalidate=3600',
		originTtlSeconds: 300
	},
	// Shared endpoints — same response for all users, cache at Vercel edge
	{
		method: 'GET',
		pattern: /^v1\/orders\/token\/[^/]+$/,
		cache: 'public, s-maxage=60, stale-while-revalidate=120',
		originTtlSeconds: 60
	},
	{ method: 'POST', pattern: /^v1\/orders\/query$/ },
	{
		method: 'GET',
		pattern: /^v1\/trades\/token\/[^/]+$/,
		cache: 'public, s-maxage=900, stale-while-revalidate=3600',
		originTtlSeconds: 900
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

function matchProxyRoute(
	method: string,
	pathSuffix: string
): { cache?: string; originTtlSeconds?: number } | null {
	const route = ALLOWED_PROXY_ROUTES.find((r) => r.method === method && r.pattern.test(pathSuffix));
	return route ? { cache: route.cache, originTtlSeconds: route.originTtlSeconds } : null;
}

function sharedCacheKey(
	apiBase: string,
	pathSuffix: string,
	searchParams: URLSearchParams
): string {
	const canonical = new URLSearchParams();
	const set = (name: string) => {
		const value = searchParams.get(name);
		if (value !== null) canonical.set(name, value);
	};

	if (/^v1\/orders\/token\/[^/]+$/.test(pathSuffix)) {
		set('page');
		set('pageSize');
		set('side');
		set('state');
	} else if (/^v1\/trades\/token\/[^/]+$/.test(pathSuffix)) {
		set('page');
		set('pageSize');
		set('startTime');
		set('endTime');
	} else if (/^v1\/tokens\/[^/]+\/details$/.test(pathSuffix)) {
		set('chainId');
		set('activityLimit');
	} else if (/^v1\/tokens\/[^/]+\/proofs$/.test(pathSuffix)) {
		set('chainId');
	} else if (/^v1\/tokens\/wrap-ratio\/[^/]+\/history$/.test(pathSuffix)) {
		set('chainId');
		set('page');
		set('pageSize');
	} else if (/^v1\/tokens\/wrap-ratio\/[^/]+$/.test(pathSuffix)) {
		set('chainId');
	}

	const query = canonical.toString();
	const normalizedPath = pathSuffix.replace(/0x[0-9a-f]+/gi, (address) => address.toLowerCase());
	return `cache:st0x-proxy:${apiBase}/${normalizedPath}${query ? `?${query}` : ''}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTokenDetailsSummary(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		typeof value.chainId === 'number' &&
		Number.isInteger(value.chainId) &&
		typeof value.address === 'string' &&
		value.address.length > 0 &&
		typeof value.name === 'string' &&
		typeof value.symbol === 'string' &&
		typeof value.decimals === 'number' &&
		Number.isInteger(value.decimals) &&
		typeof value.totalSupply === 'string' &&
		typeof value.holderCount === 'number' &&
		typeof value.transferCount === 'number' &&
		typeof value.bridgedSupply === 'string' &&
		typeof value.depositVolume === 'string' &&
		typeof value.withdrawVolume === 'string' &&
		typeof value.activityVolume === 'string'
	);
}

function isTokenDetails(value: unknown): boolean {
	if (!isTokenDetailsSummary(value) || !isRecord(value)) return false;
	const activity = value.activity;
	return (
		typeof value.sftVaultAddress === 'string' &&
		typeof value.deployTimestamp === 'number' &&
		typeof value.deployer === 'string' &&
		typeof value.admin === 'string' &&
		isRecord(activity) &&
		Array.isArray(activity.deposits) &&
		Array.isArray(activity.withdraws)
	);
}

async function shouldCacheResponse(pathSuffix: string, response: Response): Promise<boolean> {
	if (!response.ok) return false;

	if (
		pathSuffix !== TOKEN_DETAILS_LIST_PATH &&
		pathSuffix !== TOKEN_LIST_PATH &&
		!TOKEN_DETAILS_PATH.test(pathSuffix)
	) {
		return true;
	}

	try {
		const body = (await response.clone().json()) as unknown;
		if (pathSuffix === TOKEN_LIST_PATH) {
			return (
				Array.isArray(body) &&
				body.length > 0 &&
				body.every((token) => {
					if (!token || typeof token !== 'object' || Array.isArray(token)) return false;
					const item = token as Record<string, unknown>;
					return (
						typeof item.address === 'string' &&
						item.address.length > 0 &&
						typeof item.symbol === 'string' &&
						item.symbol.length > 0 &&
						typeof item.decimals === 'number' &&
						Number.isInteger(item.decimals) &&
						item.decimals >= 0
					);
				})
			);
		}
		if (TOKEN_DETAILS_PATH.test(pathSuffix)) return isTokenDetails(body);

		if (!isRecord(body) || !Array.isArray(body.data) || !Array.isArray(body.errors)) return false;
		return body.errors.length === 0 && body.data.every(isTokenDetailsSummary);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown parse error';
		console.warn('[st0x-proxy] Skipping token metadata cache for unreadable response:', msg);
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

	const fetchUpstream = async (shared: boolean): Promise<CachedSt0xResponse> => {
		const upstreamInit = shared ? { ...init, signal: undefined } : init;
		const response = await fetch(targetUrl, upstreamInit);
		logSt0xRequestBudget(pathSuffix, 'general', response);
		const body = await response.text();
		const cacheable = Boolean(
			matched.cache &&
				matched.originTtlSeconds &&
				(await shouldCacheResponse(
					pathSuffix,
					new Response(body, { status: response.status, headers: response.headers })
				))
		);
		return {
			status: response.status,
			statusText: response.statusText,
			contentType: response.headers.get('Content-Type') ?? 'application/json',
			retryAfter: response.headers.get('Retry-After'),
			body,
			cacheable
		};
	};

	let upstream: CachedSt0xResponse;
	try {
		upstream = matched.originTtlSeconds
			? await getCachedSt0xResponse(
					sharedCacheKey(apiBase, pathSuffix, url.searchParams),
					matched.originTtlSeconds,
					() => fetchUpstream(true)
				)
			: await fetchUpstream(false);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown upstream error';
		getLogger().error(
			{ error: { message: msg }, upstream_path: pathSuffix },
			'st0x upstream request failed'
		);
		return errorResponse(requestId, 503, 'UPSTREAM_UNAVAILABLE', 'The trading API is unavailable');
	}

	const responseHeaders = new Headers();
	responseHeaders.set('Content-Type', upstream.contentType);
	responseHeaders.set('X-Request-Id', requestId);
	if (upstream.retryAfter) responseHeaders.set('Retry-After', upstream.retryAfter);
	if (
		upstream.status < 200 ||
		upstream.status >= 300 ||
		(Boolean(matched.cache) && !upstream.cacheable)
	) {
		responseHeaders.set('Cache-Control', 'no-store');
	} else if (matched.cache && upstream.cacheable) {
		responseHeaders.set('Cache-Control', matched.cache);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
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
