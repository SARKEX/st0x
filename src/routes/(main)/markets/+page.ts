import { getSeoAssets } from '$lib/seo/assets';

// Public, indexable hub linking to every tokenized-asset landing page. Gives
// crawlers a single discoverable entry point into the /markets/* tree and
// concentrates internal links to the individual asset pages.
export const load = () => ({
	assets: getSeoAssets(),
	title: 'Tokenized Stocks, ETFs & Commodities | ST0x Markets',
	description:
		'Browse tokenized stocks, ETFs and commodities on ST0x, with 24/7 on-chain execution and non-custodial settlement on supported networks.'
});
