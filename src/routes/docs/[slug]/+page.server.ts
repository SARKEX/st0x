import type { EntryGenerator } from './$types';
import { base } from '$app/paths';
import slugFromPath from '$lib/docs/slugFromPath';

export const entries: EntryGenerator = async () => {
	const modules = import.meta.glob('/src/docs/**/*.{md,svx,svelte.md}');
	const slugs: { slug: string }[] = [];

	for (const path of Object.keys(modules)) {
		const adjustedPath = `${base}${path.replace('/src/docs', '')}`;
		const slug = slugFromPath(adjustedPath);
		if (slug) slugs.push({ slug });
	}

	return slugs;
};

export const prerender = false;
