import type { RequestHandler } from './$types';

// Served dynamically (NOT prerendered): prerendering forces the server bundle
// to initialize, and $lib/server/auth reads SESSION_SECRET from
// $env/dynamic/private at module load, which is illegal during prerender. This
// endpoint has no runtime dependencies, so it can't 500 — and the s-maxage
// header below lets Vercel's edge cache it anyway. Fixes robots.txt's advertised
// Sitemap URL returning 404.
const SITE = 'https://www.st0x.io';

// Public, indexable routes that exist on this branch. App/auth-gated routes
// (/dashboard, /trade, /strategies, /platform-metrics) are intentionally excluded.
const ROUTES = ['/', '/faqs', '/docs', '/terms', '/privacy-policy'];

export const GET: RequestHandler = () => {
	const urls = ROUTES.map(
		(path) => `	<url>\n		<loc>${SITE}${path}</loc>\n		<changefreq>weekly</changefreq>\n	</url>`
	).join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=0, s-maxage=3600'
		}
	});
};
