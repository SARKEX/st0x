const slugFromPath = (path: string) =>
	path
		.match(/([\w-]+)\.(svelte\.md|md|svx)/i)?.[1]
		.split('-')
		.slice(1)
		.join('-') ?? null;

export default slugFromPath;
