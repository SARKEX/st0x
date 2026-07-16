import { TOKENS } from '$lib/config/tokens';

/**
 * SEO metadata for a single tokenized asset, derived from the token registry in
 * `$lib/config/tokens`. Powers the public, indexable /markets landing pages.
 */
export interface SeoAsset {
	/** URL slug + underlying ticker, lowercased. e.g. 'nvda' */
	slug: string;
	/** Underlying ticker, uppercased. e.g. 'NVDA' */
	ticker: string;
	/** Listing venue of the underlying. e.g. 'NASDAQ' */
	exchange: string;
	/** Human-friendly underlying name. e.g. 'NVIDIA Corporation' */
	companyName: string;
	/** On-chain token symbol. e.g. 'wtNVDA' */
	tokenSymbol: string;
	/** Token logo path under /static. */
	logoUrl?: string;
	/** On-chain token address (used to link into the trade app). */
	address: string;
}

function toSeoAsset(token: (typeof TOKENS)[number]): SeoAsset | null {
	const tv = token.tradingViewSymbol;
	if (!tv) return null;

	const [exchange, rawTicker] = tv.includes(':') ? tv.split(':') : ['', tv];
	const ticker = rawTicker?.trim();
	if (!ticker) return null;

	const companyName = token.name
		.replace(/^Wrapped\s+/i, '')
		.replace(/\s+ST0x$/i, '')
		.trim();

	return {
		slug: ticker.toLowerCase(),
		ticker,
		exchange: exchange ?? '',
		companyName,
		tokenSymbol: token.symbol,
		logoUrl: token.logoUrl,
		address: token.address
	};
}

/** All tokenized-security assets that should have a public landing page. */
export function getSeoAssets(): SeoAsset[] {
	const assets = TOKENS.filter((t) => t.category === 'ST0x')
		.map(toSeoAsset)
		.filter((a): a is SeoAsset => a !== null);

	// De-duplicate by slug (keep first) and sort alphabetically by ticker.
	const seen = new Set<string>();
	return assets
		.filter((a) => (seen.has(a.slug) ? false : (seen.add(a.slug), true)))
		.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function getSeoAsset(slug: string): SeoAsset | undefined {
	const target = slug.toLowerCase();
	return getSeoAssets().find((a) => a.slug === target);
}
