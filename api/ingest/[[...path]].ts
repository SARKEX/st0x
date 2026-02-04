import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
	runtime: 'edge'
};

export default async function handler(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace('/ingest', '');

	// Determine if this is a static asset request
	const isStatic = path.startsWith('/static/') || path.includes('/array/');
	const targetHost = isStatic ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

	const targetUrl = `https://${targetHost}${path}${url.search}`;

	// Forward the request
	const response = await fetch(targetUrl, {
		method: request.method,
		headers: {
			...Object.fromEntries(request.headers.entries()),
			host: targetHost
		},
		body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
	});

	// Clone headers and fix Content-Type for JS files
	const headers = new Headers(response.headers);

	if (path.endsWith('.js') || path.includes('/config.js')) {
		headers.set('Content-Type', 'application/javascript');
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
