import { SvelteComponent } from 'svelte';
import slugFromPath from './slugFromPath';

export const getFiles = () =>
	import.meta.glob<{ default: SvelteComponent; metadata: Record<string, unknown> }>(
		`/src/docs/**/*.{md,svx,svelte.md}`,
		{ eager: true }
	);
export const getCategories = () =>
	import.meta.glob<{ category: string }>(`/src/docs/**/*.json`, {
		eager: true
	});

export const processDocs = (
	docFiles: ReturnType<typeof getFiles>,
	categoryMeta: ReturnType<typeof getCategories>
) => {
	// Getting and sorting the categories
	const categories = Object.entries(categoryMeta)
		.map(([path, meta]) => ({
			slug: path.split('/')[3],
			category: meta.category
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug));

	// Getting and filtering the articles
	const docs = Object.entries(docFiles).map(([path, doc]) => ({
		slug: slugFromPath(path),
		path,
		file: path.split('/').pop() || '',
		categoryPath: path.split('/')[3],
		published: doc.metadata?.published,
		title: doc.metadata?.title,
		...doc.metadata
	}));

	const publishedArticles = docs.filter((article) => article.published);

	// Categorizing and sorting the articles
	const categorisedArticles = categories.map((category) => ({
		...category,
		articles: publishedArticles
			.filter((article) => article.categoryPath === category.slug)
			.sort((a, b) => a.file.localeCompare(b.file))
	}));

	return categorisedArticles;
};
