import type { PythToken } from '$lib/types';
import type { TradingViewQuote } from './tradingview';

const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';

interface PythPriceData {
	price: number | string;
	conf?: number | string;
	expo: number;
	publish_time?: number | string;
}

interface PythParsedEntry {
	id: string;
	price: PythPriceData | null;
	publish_time?: number | string;
}

interface ApiResponse<T> {
	parsed?: T[];
}

type PricePoint = {
	price: number | null;
	confidence: number | null;
	publishTime: number | null;
};

type TokenWithMarket = PythToken & {
	tradingViewSymbol?: string;
};

const logReference = (tag: string, payload?: unknown) => {
	if (typeof window === 'undefined') return;
	console.log('[pyth-quotes]', tag, payload ?? '');
};

const normaliseWithExpo = (
	value: number | string | undefined,
	expo: number | string | undefined
): number | null => {
	const numericValue = typeof value === 'number' ? value : Number(value);
	const numericExpo = typeof expo === 'number' ? expo : Number(expo);
	if (!Number.isFinite(numericValue) || !Number.isFinite(numericExpo)) return null;
	return numericValue * Math.pow(10, numericExpo);
};

const normalisePrice = (data: PythPriceData | null | undefined): number | null => {
	if (!data) return null;
	return normaliseWithExpo(data.price, data.expo);
};

const normaliseConfidence = (data: PythPriceData | null | undefined): number | null => {
	if (!data) return null;
	return normaliseWithExpo(data.conf, data.expo);
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

const extractPublishTime = (entry: PythParsedEntry | undefined | null): number | null => {
	if (!entry) return null;
	const priceEmbedded = normalisePublishTime(entry.price?.publish_time);
	if (priceEmbedded !== null) return priceEmbedded;
	return normalisePublishTime(entry.publish_time);
};

// Fetch latest prices for multiple feed IDs in a single request
const createEmptyPricePoint = (): PricePoint => ({
	price: null,
	confidence: null,
	publishTime: null
});

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
			normalizedIds.forEach((id) => results.set(id, createEmptyPricePoint()));
			return results;
		}

		const data = (await response.json()) as ApiResponse<PythParsedEntry>;

		// Create a map of results
		data.parsed?.forEach((entry) => {
			const id = normaliseFeedId(entry.id);
			results.set(id, {
				price: normalisePrice(entry?.price),
				confidence: normaliseConfidence(entry?.price),
				publishTime: extractPublishTime(entry)
			});
		});

		// Fill in missing entries with null
			normalizedIds.forEach((id) => {
				if (!results.has(id)) {
					results.set(id, createEmptyPricePoint());
				}
			});

		logReference('batch-latest-success', {
			count: feedIds.length,
			received: data.parsed?.length ?? 0
		});
	} catch (error) {
		logReference('batch-latest-error', { count: feedIds.length, error });
			// Return empty prices for all feeds
			normalizedIds.forEach((id) => results.set(id, createEmptyPricePoint()));
	}

	return results;
}

export async function getLatestPythPrice(feedId: string): Promise<PricePoint> {
	const normalized = normaliseFeedId(feedId);
	const results = await fetchLatestBatch([feedId]);
	return results.get(normalized) ?? createEmptyPricePoint();
}

export async function getPythQuotes(tokens: TokenWithMarket[]): Promise<TradingViewQuote[]> {
	const tokensWithFeed = tokens.filter((token) => token.priceFeedId);
	if (!tokensWithFeed.length) return [];

	const feedIds = tokensWithFeed.map((token) => token.priceFeedId);

	// Fetch current prices from Pyth
	const latestPrices = await fetchLatestBatch(feedIds);
	logReference('pyth-prices-fetched', { count: feedIds.length });

	const results = tokensWithFeed.map((token) => {
		const feedId = normaliseFeedId(token.priceFeedId);
		const latest = latestPrices.get(feedId) ?? createEmptyPricePoint();
		if (latest.publishTime === null) {
			logReference('latest-missing-publish-time', { feedId, latestPrice: latest.price });
		}
		if (latest.price === null) {
			logReference('latest-missing-price', { feedId, publishTime: latest.publishTime });
		}
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
