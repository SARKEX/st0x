import { getSeoAssets } from '$lib/seo/assets';

// Public, indexable hub linking to every tokenized-asset landing page. Gives
// crawlers a single discoverable entry point into the /markets/* tree and
// concentrates internal links to the individual asset pages.
export const load = () => ({
	assets: getSeoAssets(),
	title: 'Tokenized Stocks, ETFs & Commodities | ST0x Markets',
	description:
		'Browse every tokenized asset on ST0x — stocks, ETFs and commodities, each backed 1:1 and traded 24/7 on-chain, non-custodially, on Base.'
});
