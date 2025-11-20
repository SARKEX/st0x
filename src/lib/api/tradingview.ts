export interface TradingViewQuote {
	symbol: string | null;
	close: number | null;
	open: number | null;
	high: number | null;
	low: number | null;
	volume: number | null;
	change: number | null;
	changeAbs: number | null;
	changePercent: number | null;
	week52High: number | null;
	week52Low: number | null;
	marketCap: number | null;
	prevClose: number | null;
}

export interface TradingViewFundamentals {
	symbol: string | null;
	peRatio: number | null;
	forwardPe: number | null;
	pegRatio: number | null;
	priceToBook: number | null;
	marketCap: number | null;
	eps: number | null;
	dividendYield: number | null;
	beta: number | null;
	week52High: number | null;
	week52Low: number | null;
	profitMargin: number | null;
	returnOnEquity: number | null;
}

export interface TradingViewTechnicals {
	symbol: string | null;
	macd: number | null;
	macdSignal: number | null;
	macdHistogram: number | null;
	rsi: number | null;
	obv: number | null;
}

function createQueryString(params: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value) {
			search.set(key, value);
		}
	}
	return search.toString();
}

export async function getQuotes(symbols: string[], market?: string) {
	if (!symbols.length) return [] as TradingViewQuote[];
	const query = createQueryString({
		symbols: symbols.join(','),
		market
	});
	const data = await fetchJson<{ quotes: TradingViewQuote[] }>(
		`/api/tradingview/quotes?${query}`
	);
	return data.quotes ?? [];
}

export async function getQuote(symbol: string, market?: string) {
	const quotes = await getQuotes([symbol], market);
	return quotes[0] ?? null;
}

export async function getFundamentals(symbol: string, market?: string) {
	const query = createQueryString({ symbol, market });
	const data = await fetchJson<{ fundamentals: TradingViewFundamentals | null }>(
		`/api/tradingview/fundamentals?${query}`
	);
	return data.fundamentals;
}

export async function getTechnicals(symbol: string, market?: string) {
	const query = createQueryString({ symbol, market });
	const data = await fetchJson<{ technicals: TradingViewTechnicals | null }>(
		`/api/tradingview/technicals?${query}`
	);
	return data.technicals;
}

export type { TradingViewQuote as Quote };
import { fetchJson } from '$lib/clients/http';
