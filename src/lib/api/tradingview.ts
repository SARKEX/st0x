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

export type { TradingViewQuote as Quote };
