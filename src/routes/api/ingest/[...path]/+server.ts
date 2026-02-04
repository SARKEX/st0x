import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

async function handleRequest(path: string, search: string, request: Request): Promise<Response> {
	// Determine if this is a static asset request (array/ contains config.js, recorder.js, etc.)
	const isStatic = path.startsWith('static/') || path.startsWith('array/');
	const targetHost = isStatic ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

	const targetUrl = `https://${targetHost}/${path}${search}`;

	// Forward the request with proper Host header
	const response = await fetch(targetUrl, {
		method: request.method,
		headers: {
			'Host': targetHost,
			'Content-Type': request.headers.get('Content-Type') || 'application/json',
			'User-Agent': request.headers.get('User-Agent') || '',
			'Accept': request.headers.get('Accept') || '*/*',
			'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
			'Origin': request.headers.get('Origin') || ''
		},
		body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined
	});

	// Clone headers and fix Content-Type for JS files
	const headers = new Headers();
	response.headers.forEach((value, key) => {
		// Skip headers that shouldn't be forwarded
		if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
			headers.set(key, value);
		}
	});

	// Fix Content-Type for JS files - this is the main fix for the MIME type issue
	if (path.endsWith('.js') || path.endsWith('/config') || path.endsWith('/flags')) {
		headers.set('Content-Type', 'application/javascript; charset=utf-8');
	}

	// Allow CORS
	headers.set('Access-Control-Allow-Origin', '*');

	const body = await response.arrayBuffer();

	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
