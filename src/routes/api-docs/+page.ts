// SEO metadata for this route. The root layout reads `title`/`description` from
// `$page.data` and renders them as the single source of title + meta description,
// avoiding duplicate tags from an inline <svelte:head>.
export const load = () => ({
	title: 'API Documentation | st0x',
	description: 'st0x Public API documentation for rewards, RocketBoost, and wallet data.'
});
