import slugFromPath from '$lib/docs/slugFromPath.js';
import { error } from '@sveltejs/kit';
import { base } from '$app/paths';

export const load = async ({ params }) => {
	const basePath = base;
	const modules = import.meta.glob(`/src/docs/**/*.{md,svx,svelte.md}`);

	let match: { path?: string; resolver?: App.MdsvexResolver } = {};

	for (const [path, resolver] of Object.entries(modules)) {
		const adjustedPath = `${basePath}${path.replace('/src/docs', '')}`;
		if (slugFromPath(adjustedPath) === params.slug) {
			match = { path, resolver: resolver as unknown as App.MdsvexResolver };
			break;
		}
	}

	const post = await match?.resolver?.();

	if (!post || !post.metadata?.published) {
		throw error(404); // Couldn't resolve the post
	}

	return {
		component: post.default,
		frontmatter: post.metadata
	};
};
