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

	const title = `Tokenized ${asset.companyName} (${asset.ticker}) | ST0x`;
	const description = `Learn about tokenized ${asset.companyName} (${asset.ticker}) on ST0x — on-chain exposure to the underlying ${asset.instrumentLabel} on Base.`;

	return { asset, title, description };
};
