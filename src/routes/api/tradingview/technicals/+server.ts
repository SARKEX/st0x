import { json } from '@sveltejs/kit';
import {
	buildTradingViewScanBody,
	coerceTradingViewNumber as coerceNumber,
	postTradingViewScan,
	resolveMarketEndpoint
} from '$lib/server/tradingview';
import type { RequestHandler } from './$types';

const TECHNICAL_COLUMNS = ['MACD.macd', 'MACD.signal', 'MACD.histogram', 'RSI', 'OBV'];

export const GET: RequestHandler = async ({ url, fetch }) => {
	const symbol = url.searchParams.get('symbol');
	const marketParam = url.searchParams.get('market');

	if (!symbol) {
		return json({ technicals: null });
	}

	const endpoint = resolveMarketEndpoint(marketParam);
	const response = await postTradingViewScan(
		endpoint,
		fetch,
		buildTradingViewScanBody([symbol], TECHNICAL_COLUMNS)
	);

	if (!response.ok) {
		return json({ technicals: null });
	}

	const payload = await response.json();
	const data = Array.isArray(payload?.data) ? payload.data : [];
	const first = data[0];

	if (!first || !Array.isArray(first?.d)) {
		return json({ technicals: null });
	}

	const [macd, macdSignal, macdHistogram, rsi, obv] = first.d;

	return json({
		technicals: {
			symbol: first?.s ?? symbol,
			macd: coerceNumber(macd),
			macdSignal: coerceNumber(macdSignal),
			macdHistogram: coerceNumber(macdHistogram),
			rsi: coerceNumber(rsi),
			obv: coerceNumber(obv)
		}
	});
};
