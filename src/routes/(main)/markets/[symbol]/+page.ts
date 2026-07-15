import { error } from '@sveltejs/kit';
import { getSeoAsset } from '$lib/seo/assets';

// Public, indexable landing page for a single tokenized asset. Server-rendered
// (SSR is on by default) so crawlers receive a unique title, description and
// body targeting "tokenized <company> / <ticker>" search intent.
export const load = ({ params }) => {
	const asset = getSeoAsset(params.symbol);
	if (!asset) {
		throw error(404, 'Unknown market');
	}

	const title = `Trade Tokenized ${asset.companyName} (${asset.ticker}) 24/7 | ST0x`;
	const description = `Buy and sell tokenized ${asset.companyName} (${asset.ticker}) on ST0x — a DeFi-native, on-chain token backed 1:1 by the underlying and settled non-custodially. Trade 24/7 on Base.`;

	return { asset, title, description };
};
