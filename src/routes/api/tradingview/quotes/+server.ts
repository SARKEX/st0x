import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DEFAULT_COLUMNS = [
	'close',
	'open',
	'high',
	'low',
	'volume',
	'change',
	'change_abs',
	'change_percent',
	'high_52week',
	'low_52week',
	'market_cap_basic'
];

function coerceNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const num = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(num) ? num : null;
}

function normalizeSymbols(param: string | null): string[] {
	if (!param) return [];
	return param
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

const MARKET_ENDPOINTS: Record<string, string> = {
	america: 'https://scanner.tradingview.com/america/scan',
	crypto: 'https://scanner.tradingview.com/crypto/scan',
	forex: 'https://scanner.tradingview.com/forex/scan',
	indices: 'https://scanner.tradingview.com/indices/scan',
	futures: 'https://scanner.tradingview.com/futures/scan',
	global: 'https://scanner.tradingview.com/tradingview/scan'
};

function resolveEndpoint(market: string | null): string {
	if (market && MARKET_ENDPOINTS[market]) return MARKET_ENDPOINTS[market];
	return MARKET_ENDPOINTS.america;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const symbolParam = url.searchParams.get('symbols');
	const marketParam = url.searchParams.get('market');

	const tickers = normalizeSymbols(symbolParam);
	if (tickers.length === 0) {
		return json({ quotes: [] });
	}

	const endpoint = resolveEndpoint(marketParam);

	const body = {
		symbols: {
			tickers,
			query: {
				types: []
			}
		},
		columns: DEFAULT_COLUMNS
	};

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		return json({
			error: true,
			status: response.status,
			message: `TradingView quote request failed with status ${response.status}`
		}, { status: response.status });
	}

	const payload = await response.json();
	const data = Array.isArray(payload?.data) ? payload.data : [];

	const quotes = data.map((item: { s: string; d: unknown[] }) => {
		const values = Array.isArray(item?.d) ? item.d : [];
		const [
			close,
			open,
			high,
			low,
			volume,
			change,
			changeAbs,
			changePercent,
			week52High,
			week52Low,
			marketCap
		] = values;

		const closeNum = coerceNumber(close);
		const changeNum = coerceNumber(change);

		return {
			symbol: item?.s ?? null,
			close: closeNum,
			open: coerceNumber(open),
			high: coerceNumber(high),
			low: coerceNumber(low),
			volume: coerceNumber(volume),
			change: changeNum,
			changeAbs: coerceNumber(changeAbs),
			changePercent: coerceNumber(changePercent),
			week52High: coerceNumber(week52High),
			week52Low: coerceNumber(week52Low),
			marketCap: coerceNumber(marketCap),
			prevClose:
				closeNum !== null && changeNum !== null ? Number((closeNum - changeNum).toFixed(6)) : null
		};
	});

	return json({ quotes });
};
