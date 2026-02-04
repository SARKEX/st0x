import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

export const POST: RequestHandler = async ({ params, url, request }) => {
	return handleRequest(params.path, url.search, request);
};

async function handleRequest(path: string, search: string, request: Request): Promise<Response> {
	// Determine if this is a static asset request
	const isStatic = path.startsWith('static/') || path.includes('/array/');
	const targetHost = isStatic ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

	const targetUrl = `https://${targetHost}/${path}${search}`;

	// Forward the request
	const response = await fetch(targetUrl, {
		method: request.method,
		headers: {
			'Content-Type': request.headers.get('Content-Type') || 'application/json',
			'User-Agent': request.headers.get('User-Agent') || ''
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

	// Fix Content-Type for JS files
	if (path.endsWith('.js') || path.includes('config.js') || path.includes('config')) {
		headers.set('Content-Type', 'application/javascript; charset=utf-8');
	}

	const body = await response.arrayBuffer();

	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
