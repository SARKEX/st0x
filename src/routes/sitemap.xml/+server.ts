import type { RequestHandler } from './$types';
import { getSeoAssets } from '$lib/seo/assets';
import { getPublishedDocSlugs } from '$lib/docs/processDocs';

// Served dynamically (NOT prerendered): prerendering forces the server bundle
// to initialize, and $lib/server/auth reads SESSION_SECRET from
// $env/dynamic/private at module load, which is illegal during prerender. This
// endpoint has no runtime dependencies, so it can't 500 — and the s-maxage
// header below lets Vercel's edge cache it anyway. Fixes robots.txt's advertised
// Sitemap URL returning 404.
const SITE = 'https://www.st0x.io';

// `lastmod` for the listed URLs. Bump on meaningful content changes; it tells
// Google which pages are worth recrawling. (Kept a single constant rather than
// per-URL git timestamps to avoid pulling git state into the request path.)
const LASTMOD = '2026-07-15';

// Public, indexable routes. App/auth-gated routes (/dashboard, /trade,
// /strategies, /platform-metrics) are intentionally excluded. Per-asset
// landing pages are enumerated from the token registry so new listings appear
// automatically.
const staticRoutes = ['/', '/faqs', '/terms', '/privacy-policy', '/markets'];

export const GET: RequestHandler = () => {
	const marketRoutes = getSeoAssets().map((a) => `/markets/${a.slug}`);
	const docRoutes = getPublishedDocSlugs().map((slug) => `/docs/${slug}`);
	const routes = [...staticRoutes, ...docRoutes, ...marketRoutes];

	const urls = routes
		.map((path) => `	<url>\n		<loc>${SITE}${path}</loc>\n		<lastmod>${LASTMOD}</lastmod>\n	</url>`)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=0, s-maxage=3600'
		}
	});
};
