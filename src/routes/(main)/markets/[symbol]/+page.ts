import { error, redirect } from '@sveltejs/kit';
import { getSeoAsset } from '$lib/seo/assets';

// Public, indexable landing page for a single tokenized asset. Server-rendered
// (SSR is on by default) so crawlers receive a unique title, description and
// body targeting "tokenized <company> / <ticker>" search intent.
export const load = ({ params }) => {
	const asset = getSeoAsset(params.symbol);
	if (!asset) {
		throw error(404, 'Unknown market');
	}
	if (params.symbol !== asset.slug) {
		throw redirect(308, `/markets/${asset.slug}`);
	}

	const title = `Trade Tokenized ${asset.companyName} (${asset.ticker}) 24/7 | ST0x`;
	const description = `Buy and sell tokenized ${asset.companyName} (${asset.ticker}) on ST0x with 24/7 on-chain execution and non-custodial settlement on Base.`;

	return { asset, title, description };
};
