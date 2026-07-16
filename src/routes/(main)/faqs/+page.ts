// Per-page SEO metadata. The root layout reads `$page.data.title` /
// `$page.data.description` and falls back to site defaults when absent, so
// returning them here gives this page a unique, indexable title + description.
export const load = () => ({
	title: 'ST0x FAQs — Tokenized Stocks, Custody, Liquidity & Fees',
	description:
		'How ST0x works: 24/7 on-chain trading of tokenized stocks and ETFs, non-custodial settlement, wrapped vault shares, liquidity, wallet access and fees.'
});
