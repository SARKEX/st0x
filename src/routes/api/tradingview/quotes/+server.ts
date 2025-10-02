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

const FALLBACK_COLUMNS = ['close', 'open', 'high', 'low', 'volume', 'change', 'change_percent'];

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

type QuoteResponse = {
	s: string;
	d: unknown[];
};

function parseQuotes(data: QuoteResponse[], columns: string[]) {
	return data.map((item) => {
		const values = Array.isArray(item?.d) ? item.d : [];
		const mapped: Record<string, number | null> = {};
		columns.forEach((column, index) => {
			mapped[column] = coerceNumber(values[index]);
		});

		const close = mapped.close ?? null;
		const change = mapped.change ?? mapped.change_abs ?? null;
		const prevClose =
			close !== null && change !== null ? Number((close - change).toFixed(6)) : null;

		return {
			symbol: item?.s ?? null,
			close,
			open: mapped.open ?? null,
			high: mapped.high ?? null,
			low: mapped.low ?? null,
			volume: mapped.volume ?? null,
			change,
			changeAbs: mapped.change_abs ?? null,
			changePercent: mapped.change_percent ?? null,
			week52High: mapped.high_52week ?? null,
			week52Low: mapped.low_52week ?? null,
			marketCap: mapped.market_cap_basic ?? null,
			prevClose
		};
	});
}

function extractUnknownField(message: unknown): string | null {
	if (!message) return null;
	let text: string | null = null;
	if (typeof message === 'string') {
		text = message;
	} else if (typeof message === 'object') {
		const maybe = (message as { error?: unknown }).error;
		if (typeof maybe === 'string') text = maybe;
	}
	if (!text) return null;
	const match = text.match(/Unknown field "([^"]+)"/i);
	return match?.[1] ?? null;
}

async function fetchQuotesBatch(
	endpoint: string,
	tickers: string[],
	columns: string[],
	fetchFn: typeof fetch
) {
	const body = {
		symbols: {
			tickers,
			query: {
				types: []
			}
		},
		columns
	};

	const response = await fetchFn(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	const text = await response.text();
	let payload: unknown;
	try {
		payload = text ? JSON.parse(text) : null;
	} catch {
		payload = null;
	}

	return {
		ok: response.ok,
		status: response.status,
		message: typeof payload === 'object' && payload !== null ? payload : text || null,
		data: Array.isArray((payload as { data?: QuoteResponse[] } | null)?.data)
			? ((payload as { data?: QuoteResponse[] }).data as QuoteResponse[])
			: []
	};
}

async function requestQuotes(
	endpoint: string,
	tickers: string[],
	fetchFn: typeof fetch,
	primaryColumns: string[],
	secondaryColumns: string[]
) {
	if (tickers.length === 0) return [] as ReturnType<typeof parseQuotes>;

	async function attempt(columns: string[]) {
		let current = [...columns];
		const tried = new Set<string>();
		while (current.length > 0) {
			const res = await fetchQuotesBatch(endpoint, tickers, current, fetchFn);
			if (res.ok) {
				return parseQuotes(res.data, current);
			}
			const unknown = extractUnknownField(res.message);
			if (unknown && current.includes(unknown) && !tried.has(unknown)) {
				tried.add(unknown);
				current = current.filter((col) => col !== unknown);
				continue;
			}
			break;
		}
		return null;
	}

	const primary = await attempt(primaryColumns);
	if (primary) return primary;
	const fallback = await attempt(secondaryColumns);
	if (fallback) return fallback;

	if (tickers.length === 1) {
		console.warn('[tradingview] failed to load quote', {
			ticker: tickers[0]
		});
		return [];
	}

	const results: ReturnType<typeof parseQuotes> = [];
	for (const ticker of tickers) {
		const single = await requestQuotes(
			endpoint,
			[ticker],
			fetchFn,
			primaryColumns,
			secondaryColumns
		);
		results.push(...single);
	}
	return results;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const symbolParam = url.searchParams.get('symbols');
	const marketParam = url.searchParams.get('market');

	const tickers = normalizeSymbols(symbolParam);
	if (tickers.length === 0) {
		return json({ quotes: [] });
	}

	const endpoint = resolveEndpoint(marketParam);

	const quotes = await requestQuotes(endpoint, tickers, fetch, DEFAULT_COLUMNS, FALLBACK_COLUMNS);

	return json({ quotes });
};
