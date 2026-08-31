import { getSeoAssets } from '$lib/seo/assets';

// Public, indexable hub linking to every tokenized-asset landing page. Gives
// crawlers a single discoverable entry point into the /markets/* tree and
// concentrates internal links to the individual asset pages.
export const load = () => ({
	assets: getSeoAssets(),
	title: 'Tokenized Stocks, ETFs & Commodities | ST0x',
	description:
		'Browse ST0x tokenized stocks, ETFs and commodities issued on Base, with token information and on-chain metrics.'
});
