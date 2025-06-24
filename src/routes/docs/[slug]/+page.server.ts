import type { EntryGenerator } from './$types';
import { base } from '$app/paths';
import slugFromPath from '$lib/docs/slugFromPath';

export const entries: EntryGenerator = () => {
	const modules = import.meta.glob(`/src/docs/**/*.{md,svx,svelte.md}`);

	const paths: { slug: string }[] = [];

	for (const path of Object.keys(modules)) {
		const adjustedPath = `${base}${path.replace('/src/docs', '')}`;
		paths.push({ slug: slugFromPath(adjustedPath) || '' });
	}

	return paths;
};

export const prerender = true;
