// Per-page SEO metadata. The root layout reads `$page.data.title` /
// `$page.data.description` and falls back to site defaults when absent, so
// returning them here gives this page a unique, indexable title + description.
export const load = () => ({
	title: 'ST0x FAQs — Tokenized Securities, Custody & Wrapping',
	description:
		'Information about ST0x tokenized securities, issuance, self-custodied wallets, wrapped vault shares and token wrapping.'
});
