import type { EntryGenerator, PageServerLoad } from './$types';
import { base } from '$app/paths';
import { error } from '@sveltejs/kit';
import slugFromPath from '$lib/docs/slugFromPath';

// A server-rendered mdsvex doc component exposes Svelte 4's `.render()`.
type SsrComponent = {
	render: (props?: Record<string, unknown>) => { html: string; head: string };
};
type DocModule = {
	default: SsrComponent;
	metadata?: { title?: string; published?: boolean };
};

const modules = import.meta.glob<DocModule>('/src/docs/**/*.{md,svx,svelte.md}');

export const entries: EntryGenerator = async () => {
	const slugs: { slug: string }[] = [];
	for (const path of Object.keys(modules)) {
		const adjustedPath = `${base}${path.replace('/src/docs', '')}`;
		const slug = slugFromPath(adjustedPath);
		if (slug) slugs.push({ slug });
	}
	return slugs;
};

// Server-rendered (SSR) so crawlers receive the full doc HTML plus a real
// <title> and meta description — previously this route set `ssr = false` and
// shipped an empty shell to Googlebot. NOT prerendered: build-time prerender
// initializes the server bundle, and $lib/server/auth reads SESSION_SECRET at
// module load, which is unavailable during prerender (the same constraint that
// keeps sitemap.xml dynamic). SSR at request time is safe — the secret exists at
// runtime — and the response is edge-cached via the header below.
export const prerender = false;

function htmlToText(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	let match: DocModule | undefined;

	for (const [path, resolver] of Object.entries(modules)) {
		const adjustedPath = `${base}${path.replace('/src/docs', '')}`;
		if (slugFromPath(adjustedPath) === params.slug) {
			match = await resolver();
			break;
		}
	}

	if (!match || !match.metadata?.published) {
		throw error(404, 'Documentation page not found');
	}

	// Render the doc component to an HTML string. Unlike returning the component
	// itself (which is not serializable and forced the old `ssr = false`), a
	// string survives SSR + client hydration.
	const { html } = match.default.render();
	const heading = match.metadata.title ?? 'Documentation';
	const title = `${heading} — ST0x Docs`;
	const description = htmlToText(html).slice(0, 155);

	// Edge-cache the rendered doc — content is static per deploy.
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=3600' });

	return { slug: params.slug, heading, title, description };
};
