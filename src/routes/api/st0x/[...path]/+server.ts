/**
 * st0x REST API Proxy
 *
 * Proxies requests to the st0x REST API, adding basic auth
 * from server-side environment variables. This keeps credentials
 * out of client-side code.
 */

import { env } from '$env/dynamic/private';
import { checkBotId } from 'botid/server';
import { getLogger, getRequestContext, requestIdOrUuid } from '$lib/server/logger';
import { logSt0xRequestBudget } from '$lib/server/st0xBudgetTelemetry';
import { getCachedSt0xResponse, type CachedSt0xResponse } from '$lib/server/st0xProxyCache';
import { applyRateLimit, rateLimiters } from '$lib/server/rateLimit';
import type { RequestEvent, RequestHandler } from './$types';

const TOKEN_DETAILS_LIST_PATH = 'v2/tokens/details';
const TOKEN_LIST_PATH = 'v2/tokens';
const TOKEN_DETAILS_PATH = /^v2\/tokens\/[^/]+\/details$/;
const WEBSITE_ONLY_CACHE_CONTROL = 'private, no-store';

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
		pattern: /^v2\/tokens$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/details$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/[^/]+\/details$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 300
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/wrap-ratio$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/wrap-ratio\/[^/]+$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/wrap-ratio\/[^/]+\/history$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 60
	},
	{
		method: 'GET',
		pattern: /^v2\/tokens\/[^/]+\/proofs$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 300
	},
	// Order reads use the bounded POST query below. Do not expose the API's
	// per-token GET endpoint as a public authenticated pass-through.
	{ method: 'POST', pattern: /^v2\/orders\/query$/ },
	{
		method: 'GET',
		pattern: /^v2\/trades\/token\/[^/]+$/,
		cache: WEBSITE_ONLY_CACHE_CONTROL,
		originTtlSeconds: 900
	},
	// Per-user endpoints — no shared caching
	{ method: 'GET', pattern: /^v2\/orders\/owner\/[^/]+$/ },
	{ method: 'GET', pattern: /^v2\/trades\/tx\/[^/]+$/ },
	{ method: 'GET', pattern: /^v2\/trades\/(?!taker\/|query$)[^/]+$/ },
	{ method: 'GET', pattern: /^v2\/trades\/taker\/[^/]+$/ },
	{ method: 'POST', pattern: /^v2\/trades\/query$/ },
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

	if (/^v2\/trades\/token\/[^/]+$/.test(pathSuffix)) {
		set('page');
		set('pageSize');
		set('startTime');
		set('endTime');
	} else if (/^v2\/tokens\/[^/]+\/details$/.test(pathSuffix)) {
		set('chainId');
		set('activityLimit');
	} else if (/^v2\/tokens\/[^/]+\/proofs$/.test(pathSuffix)) {
		set('chainId');
	} else if (/^v2\/tokens\/wrap-ratio\/[^/]+\/history$/.test(pathSuffix)) {
		set('chainId');
		set('page');
		set('pageSize');
	} else if (/^v2\/tokens\/wrap-ratio\/[^/]+$/.test(pathSuffix)) {
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

function isSameOriginWebsiteRequest(event: RequestEvent): boolean {
	if (event.isSubRequest) return true;

	const fetchSite = event.request.headers.get('Sec-Fetch-Site');
	if (fetchSite !== 'same-origin') return false;

	const source = event.request.headers.get('Origin') ?? event.request.headers.get('Referer');
	if (!source) return false;

	try {
		return new URL(source).origin === event.url.origin;
	} catch {
		return false;
	}
}

const proxyRequest = async (event: RequestEvent) => {
	const { request, params, url } = event;
	const requestId = requestIdOrUuid(
		getRequestContext()?.request_id ?? request.headers.get('x-request-id')
	);
	if (!isSameOriginWebsiteRequest(event)) {
		return errorResponse(requestId, 403, 'FORBIDDEN', 'Website request required');
	}

	const pathSuffix = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
	const matched = matchProxyRoute(request.method, pathSuffix);
	if (!matched) {
		return errorResponse(requestId, 404, 'NOT_FOUND', 'Proxy route not found');
	}

	const rateLimitResponse = await applyRateLimit(request, rateLimiters.st0xProxy, 'st0x-proxy');
	if (rateLimitResponse) return rateLimitResponse;

	// Server-side SvelteKit fetches cannot complete the browser challenge. They
	// are trusted in-process subrequests; direct requests must pass BotID before
	// we read the private upstream credentials.
	if (!event.isSubRequest) {
		try {
			const verification = await checkBotId();
			if (verification.isBot) {
				getLogger().warn({ request_id: requestId }, 'st0x proxy bot request rejected');
				return errorResponse(requestId, 403, 'FORBIDDEN', 'Website request required');
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown BotID verification error';
			getLogger().error(
				{ error: { message: msg }, request_id: requestId },
				'st0x proxy bot verification failed'
			);
			return errorResponse(
				requestId,
				503,
				'BOT_VERIFICATION_UNAVAILABLE',
				'Website verification is unavailable'
			);
		}
	}

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
