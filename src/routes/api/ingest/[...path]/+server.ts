import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};

async function handleRequest(path: string, search: string, request: Request): Promise<Response> {
	// Only /static/* goes to assets CDN, everything else (including array/) to main API
	const isStatic = path.startsWith('static/');
	const targetHost = isStatic ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

	const targetUrl = `https://${targetHost}/${path}${search}`;

	// Get request body for POST requests
	let requestBody: string | undefined;
	if (request.method === 'POST') {
		requestBody = await request.text();
	}

	// Forward the request with proper headers
	const response = await fetch(targetUrl, {
		method: request.method,
		headers: {
			Host: targetHost,
			'Content-Type': request.headers.get('Content-Type') || 'application/json',
			'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0'
		},
		body: requestBody
	});

	// Handle 204 No Content - Response can't have a body
	if (response.status === 204) {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*'
			}
		});
	}

	// Clone response headers
	const headers = new Headers();
	response.headers.forEach((value, key) => {
		const lower = key.toLowerCase();
		if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lower)) {
			headers.set(key, value);
		}
	});

	// Fix Content-Type for JS files
	if (path.endsWith('.js')) {
		headers.set('Content-Type', 'application/javascript; charset=utf-8');
	}

	headers.set('Access-Control-Allow-Origin', '*');

	const responseBody = await response.arrayBuffer();

	return new Response(responseBody, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
