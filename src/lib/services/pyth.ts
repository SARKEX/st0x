import type { PythToken } from '$lib/types';
import type { TradingViewQuote } from './tradingview';

const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';

interface PythPriceData {
	price: number | string;
	expo: number;
}

interface PythParsedEntry {
	id: string;
	price: PythPriceData | null;
	publish_time: number | string;
}

interface ApiResponse<T> {
	parsed?: T[];
}

type PricePoint = {
	price: number | null;
	publishTime: number | null;
};

type TokenWithMarket = PythToken & {
	tradingViewSymbol?: string;
};

const logReference = (tag: string, payload?: unknown) => {
	if (typeof window === 'undefined') return;
	console.log('[pyth-quotes]', tag, payload ?? '');
};

const normalisePrice = (data: PythPriceData | null | undefined): number | null => {
	if (!data) return null;
	const price = typeof data.price === 'number' ? data.price : Number(data.price);
	const expo = typeof data.expo === 'number' ? data.expo : Number(data.expo);
	if (!Number.isFinite(price) || !Number.isFinite(expo)) return null;
	return price * Math.pow(10, expo);
};

const normalisePublishTime = (raw: number | string | undefined): number | null => {
	if (typeof raw === 'number') return raw;
	if (typeof raw === 'string') {
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const normaliseFeedId = (feedId: string) => feedId.replace(/^0x/, '').toLowerCase();

// Fetch latest prices for multiple feed IDs in a single request
async function fetchLatestBatch(feedIds: string[]): Promise<Map<string, PricePoint>> {
	const normalizedIds = feedIds.map(normaliseFeedId);
	const idsParams = normalizedIds.map((id) => `ids[]=${id}`).join('&');
	const url = `${HERMES_BASE_URL}/latest?${idsParams}`;

	const results = new Map<string, PricePoint>();

	try {
		const response = await fetch(url);
		if (!response.ok) {
			logReference('batch-latest-fail', { count: feedIds.length, status: response.status });
			// Return empty prices for all feeds
			normalizedIds.forEach((id) => results.set(id, { price: null, publishTime: null }));
			return results;
		}

		const data = (await response.json()) as ApiResponse<PythParsedEntry>;

		// Create a map of results
		data.parsed?.forEach((entry) => {
			const id = normaliseFeedId(entry.id);
			results.set(id, {
				price: normalisePrice(entry?.price),
				publishTime: normalisePublishTime(entry?.publish_time)
			});
		});

		// Fill in missing entries with null
		normalizedIds.forEach((id) => {
			if (!results.has(id)) {
				results.set(id, { price: null, publishTime: null });
			}
		});

		logReference('batch-latest-success', {
			count: feedIds.length,
			received: data.parsed?.length ?? 0
		});
	} catch (error) {
		logReference('batch-latest-error', { count: feedIds.length, error });
		// Return empty prices for all feeds
		normalizedIds.forEach((id) => results.set(id, { price: null, publishTime: null }));
	}

	return results;
}

const calculateChange = (current: number | null, previous: number | null) => {
	if (current === null || previous === null || previous === 0) {
		return { change: null, changePercent: null };
	}
	const change = current - previous;
	const changePercent = (change / previous) * 100;
	return { change, changePercent };
};

export async function getPythQuotes(tokens: TokenWithMarket[]): Promise<TradingViewQuote[]> {
	const tokensWithFeed = tokens.filter((token) => token.priceFeedId);
	if (!tokensWithFeed.length) return [];

	const feedIds = tokensWithFeed.map((token) => token.priceFeedId);

	// Fetch current prices from Pyth
	const latestPrices = await fetchLatestBatch(feedIds);
	logReference('pyth-prices-fetched', { count: feedIds.length });

	// Map Pyth prices to results (without historical data - Pyth doesn't support stock historicals)
	const results = tokensWithFeed.map((token) => {
		const feedId = normaliseFeedId(token.priceFeedId);
		const latest = latestPrices.get(feedId) ?? { price: null, publishTime: null };

		return {
			symbol: token.tradingViewSymbol ?? token.symbol ?? null,
			close: latest.price,
			open: null,
			high: null,
			low: null,
			volume: null,
			change: null,
			changeAbs: null,
			changePercent: null,
			week52High: null,
			week52Low: null,
			marketCap: null,
			prevClose: null
		};
	});

	return results;
}

export type { PricePoint as PythSnapshot };
