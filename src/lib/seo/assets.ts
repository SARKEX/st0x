import { TOKENS } from '$lib/config/tokens';
import {
	getInstrumentLabel,
	getInstrumentRiskDisclosure,
	getInstrumentType,
	type InstrumentType
} from '$lib/config/instruments';

/**
 * SEO metadata for a single tokenized asset, derived from the token registry in
 * `$lib/config/tokens`. Powers the public, indexable /markets landing pages.
 */
export interface SeoAsset {
	/** URL slug + underlying ticker, lowercased. e.g. 'nvda' */
	slug: string;
	/** Underlying ticker, uppercased. e.g. 'NVDA' */
	ticker: string;
	/** What kind of instrument the underlying is. e.g. 'commodity-trust' */
	instrumentType: InstrumentType;
	/** Human-readable instrument category. e.g. 'commodity grantor trust' */
	instrumentLabel: string;
	/** Risk disclosure for complex instruments, or null where none is required. */
	riskDisclosure: string | null;
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

	// Only the ticker is taken from the TradingView symbol. The prefix before the
	// colon is TradingView's own namespace, not a listing venue — it renders
	// "AMEX" for NYSE Arca-listed funds, for example — so it must not be
	// published as the underlying's exchange. Listing venues are omitted from the
	// pages until they are sourced and audited separately.
	const rawTicker = tv.includes(':') ? tv.split(':')[1] : tv;
	const ticker = rawTicker?.trim();
	if (!ticker) return null;

	const instrumentType = getInstrumentType(ticker);

	const companyName = token.name
		.replace(/^Wrapped\s+/i, '')
		.replace(/\s+ST0x$/i, '')
		.trim();

	return {
		slug: ticker.toLowerCase(),
		ticker,
		instrumentType,
		instrumentLabel: getInstrumentLabel(instrumentType),
		riskDisclosure: getInstrumentRiskDisclosure(instrumentType),
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
