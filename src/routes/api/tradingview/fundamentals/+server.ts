import { json } from '@sveltejs/kit';
import {
	buildTradingViewScanBody,
	coerceTradingViewNumber as coerceNumber,
	postTradingViewScan,
	resolveMarketEndpoint
} from '$lib/server/tradingview';
import type { RequestHandler } from './$types';

const FUNDAMENTAL_COLUMNS = [
	'price_earnings_ttm',
	'forward_pe_1_year',
	'peg_ratio',
	'price_to_book_ttm',
	'market_cap_basic',
	'earnings_per_share_basic_ttm',
	'dividends_yield',
	'beta_1_year',
	'high_52week',
	'low_52week',
	'profit_margin',
	'return_on_equity'
];

export const GET: RequestHandler = async ({ url, fetch }) => {
	const symbol = url.searchParams.get('symbol');
	const marketParam = url.searchParams.get('market');

	if (!symbol) {
		return json({ fundamentals: null });
	}

	const endpoint = resolveMarketEndpoint(marketParam);
	const response = await postTradingViewScan(
		endpoint,
		fetch,
		buildTradingViewScanBody([symbol], FUNDAMENTAL_COLUMNS)
	);

	if (!response.ok) {
		return json({ fundamentals: null });
	}

	const payload = await response.json();
	const data = Array.isArray(payload?.data) ? payload.data : [];
	const first = data[0];

	if (!first || !Array.isArray(first?.d)) {
		return json({ fundamentals: null });
	}

	const [
		peRatio,
		forwardPe,
		pegRatio,
		priceToBook,
		marketCap,
		eps,
		dividendYield,
		beta,
		week52High,
		week52Low,
		profitMargin,
		returnOnEquity
	] = first.d;

	return json({
		fundamentals: {
			symbol: first?.s ?? symbol,
			peRatio: coerceNumber(peRatio),
			forwardPe: coerceNumber(forwardPe),
			pegRatio: coerceNumber(pegRatio),
			priceToBook: coerceNumber(priceToBook),
			marketCap: coerceNumber(marketCap),
			eps: coerceNumber(eps),
			dividendYield: coerceNumber(dividendYield),
			beta: coerceNumber(beta),
			week52High: coerceNumber(week52High),
			week52Low: coerceNumber(week52Low),
			profitMargin: coerceNumber(profitMargin),
			returnOnEquity: coerceNumber(returnOnEquity)
		}
	});
};
