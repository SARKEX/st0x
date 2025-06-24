const slugFromPath = (path: string) =>
	path
		.match(/([\w-]+)\.(svelte\.md|md|svx)/i)?.[1]
		.split('-')
		.slice(1)
		.join('-') ?? null;

export default slugFromPath;

// if (import.meta.vitest) {
// 	const { it, expect } = import.meta.vitest;

// 	it('should return the slug from a path', () => {
// 		expect(slugFromPath('src/docs/10-some-article.md')).toEqual('some-article');
// 		expect(slugFromPath('src/docs/20-some-article.svelte.md')).toEqual('some-article');
// 		expect(slugFromPath('src/docs/30-some-article.svx')).toEqual('some-article');

// 		expect(slugFromPath('src/docs/category/40-some.svx')).toEqual('some');
// 		expect(slugFromPath('src/docs/category/50-some-article.svx')).toEqual('some-article');
// 	});

// 	it('wont match the wrong file types', () => {
// 		expect(slugFromPath('src/docs/10-some-article.txt')).toEqual(null);
// 		expect(slugFromPath('src/docs/20-some-article.svelte')).toEqual(null);
// 		expect(slugFromPath('src/docs/30-some-article.ts')).toEqual(null);
// 	});

// 	it('should return null for invalid paths', () => {
// 		expect(slugFromPath('src/docs/10-some-article')).toEqual(null);
// 		expect(slugFromPath('src/docs/20-some-article.')).toEqual(null);
// 		expect(slugFromPath('src/docs/30-some-article.')).toEqual(null);
// 	});
// }
