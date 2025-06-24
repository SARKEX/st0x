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

if (import.meta.vitest) {
	const { it, expect } = import.meta.vitest;

	const mockComponent = import.meta.glob<{
		default: SvelteComponent;
	}>('$lib/test/MockComponent.svelte', { eager: true })['/src/lib/test/MockComponent.svelte']
		.default;

	it('correctly processes the docs', () => {
		const docFiles = {
			'/src/docs/10-some-category/10-some-article.md': {
				default: mockComponent,
				metadata: { published: true, title: 'Some Article', category: 'General' }
			},
			'/src/docs/10-some-category/20-another-article.svelte.md': {
				default: mockComponent,
				metadata: { published: true, title: 'Another Article', category: 'General' }
			}
		};

		const result = processDocs(docFiles, {
			'/src/docs/10-some-category/metadata.json': { category: 'General' },
			'/src/docs/20-another-category/metadata.json': { category: 'General' }
		});

		expect(result).toEqual([
			{
				slug: '10-some-category',
				category: 'General',
				articles: [
					{
						slug: 'some-article',
						path: '/src/docs/10-some-category/10-some-article.md',
						file: '10-some-article.md',
						category: 'General',
						categoryPath: '10-some-category',
						published: true,
						title: 'Some Article'
					},
					{
						slug: 'another-article',
						path: '/src/docs/10-some-category/20-another-article.svelte.md',
						file: '20-another-article.svelte.md',
						category: 'General',
						categoryPath: '10-some-category',
						published: true,
						title: 'Another Article'
					}
				]
			},
			{
				slug: '20-another-category',
				category: 'General',
				articles: []
			}
		]);
	});
}
