const BASE_URL = 'https://www.alphavantage.co/query';

type AlphaError = { error: 'API_LIMIT'; message: string };

async function alphaRequest(
	func: string,
	params: Record<string, string>,
	apiKey?: string
): Promise<unknown | AlphaError> {
	const search = new URLSearchParams({
		function: func,
		...(apiKey ? { apikey: apiKey } : {}),
		...params
	});
	const url = `${BASE_URL}?${search.toString()}`;
	const res = await fetch(url);
	const data = await res.json();
	if (data?.Information || data?.Note) {
		return { error: 'API_LIMIT', message: data.Information || data.Note } as AlphaError;
	}
	return data;
}

export function getGlobalQuote(symbol: string, apiKey?: string) {
	return alphaRequest('GLOBAL_QUOTE', { symbol }, apiKey);
}

export function getOverview(symbol: string, apiKey?: string) {
	return alphaRequest('OVERVIEW', { symbol }, apiKey);
}

export function getDaily(symbol: string, apiKey?: string, outputsize?: 'compact' | 'full') {
	const params: Record<string, string> = { symbol };
	if (outputsize) params.outputsize = outputsize;
	return alphaRequest('TIME_SERIES_DAILY', params, apiKey);
}

export function getIntraday(
	symbol: string,
	interval: string,
	apiKey?: string,
	outputsize?: 'compact' | 'full'
) {
	const params: Record<string, string> = {
		symbol,
		interval
	};
	if (outputsize) params.outputsize = outputsize;
	return alphaRequest('TIME_SERIES_INTRADAY', params, apiKey);
}

export function getMACD(symbol: string, interval: string, apiKey?: string, series_type = 'close') {
	return alphaRequest('MACD', { symbol, interval, series_type }, apiKey);
}

export function getRSI(
	symbol: string,
	interval: string,
	time_period = 14,
	series_type: 'close' | 'open' | 'high' | 'low' = 'close',
	apiKey?: string
) {
	return alphaRequest(
		'RSI',
		{ symbol, interval, time_period: String(time_period), series_type },
		apiKey
	);
}

export function getOBV(symbol: string, interval: string, apiKey?: string) {
	return alphaRequest('OBV', { symbol, interval }, apiKey);
}
