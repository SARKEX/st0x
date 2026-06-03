// Public API proxy for the rain.strategies manifest. Canonical generation lives at
// /registry/manifest (src/routes/registry/manifest/+server.ts); this endpoint
// re-exposes it under /api/public/ for unauthenticated, open-CORS consumers.
import type { RequestHandler } from './$types';

function absolutizeManifestLine(line: string, origin: string): string {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) return line;

	const parts = trimmed.split(/\s+/);
	// manifest format:
	// - first line: "<settings_path>"
	// - subsequent lines: "<strategy_key> <strategy_path>"
	if (parts.length === 1) {
		return new URL(parts[0], origin).toString();
	}
	if (parts.length >= 2) {
		return `${parts[0]} ${new URL(parts[1], origin).toString()}`;
	}
	return line;
}

export const GET: RequestHandler = async ({ fetch, url }) => {
	let upstream: Response;
	try {
		upstream = await fetch('/registry/manifest', { cache: 'no-store' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[registry/manifest] upstream fetch failed:', message);
		return new Response(`Failed to load registry manifest: ${message}`, {
			status: 502,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}

	if (!upstream.ok) {
		return new Response(`Failed to load registry manifest (${upstream.status})`, {
			status: upstream.status
		});
	}

	const manifestText = await upstream.text();
	const normalized = manifestText
		.split(/\r?\n/)
		.map((line) => absolutizeManifestLine(line, url.origin))
		.join('\n');

	return new Response(normalized, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, no-store, max-age=0, must-revalidate'
		}
	});
};
