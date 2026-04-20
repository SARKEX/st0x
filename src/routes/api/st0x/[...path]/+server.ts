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

const proxyRequest = async ({ request, params, url }: RequestEvent) => {
	const apiBase = getApiBase();
	const pathSuffix = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
	const targetUrl = `${apiBase}/${pathSuffix}${url.search}`;

	const headers = new Headers();
	headers.set('Content-Type', 'application/json');
	headers.set('Accept', 'application/json');
	headers.set('Authorization', getAuthHeader());

	const init: RequestInit = {
		method: request.method,
		headers: headers as HeadersInit,
		signal: request.signal
	};

	if (!['GET', 'HEAD'].includes(request.method)) {
		const body = await request.arrayBuffer();
		init.body = body;
	}

	const response = await fetch(targetUrl, init);

	const responseHeaders = new Headers();
	responseHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/json');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders
	});
};

const handleOptions: RequestHandler = async () =>
	new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
		}
	});

export const GET: RequestHandler = proxyRequest;
export const POST: RequestHandler = proxyRequest;
export const OPTIONS = handleOptions;
