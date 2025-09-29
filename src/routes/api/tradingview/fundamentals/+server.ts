import { json } from '@sveltejs/kit';
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

function coerceNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const num = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(num) ? num : null;
}

const MARKET_ENDPOINTS: Record<string, string> = {
	america: 'https://scanner.tradingview.com/america/scan',
	crypto: 'https://scanner.tradingview.com/crypto/scan',
	indices: 'https://scanner.tradingview.com/indices/scan',
	futures: 'https://scanner.tradingview.com/futures/scan',
	global: 'https://scanner.tradingview.com/tradingview/scan'
};

function resolveEndpoint(market: string | null): string {
	if (market && MARKET_ENDPOINTS[market]) return MARKET_ENDPOINTS[market];
	return MARKET_ENDPOINTS.america;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const symbol = url.searchParams.get('symbol');
	const marketParam = url.searchParams.get('market');

	if (!symbol) {
		return json({ fundamentals: null });
	}

	const endpoint = resolveEndpoint(marketParam);

	const body = {
		symbols: {
			tickers: [symbol],
			query: {
				types: []
			}
		},
		columns: FUNDAMENTAL_COLUMNS
	};

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});

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
