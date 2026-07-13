import type { Network } from '$lib/config/network';
import type { PythToken } from '$lib/types';
import type { TradingViewQuote } from './tradingview';
import { HERMES_BASE_URL } from '$lib/config/constants';

interface PythPriceData {
	price: number | string;
	expo: number;
	conf?: number | string;
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
	fallbackPrice?: number;
};

const logReference = (tag: string, payload?: unknown) => {
	if (typeof window === 'undefined' || !process.env.DEV) return;
	console.log('[pyth-quotes]', tag, payload ?? '');
};

const normalisePrice = (data: PythPriceData | null | undefined): number | null => {
	if (!data) return null;
	const price = typeof data.price === 'number' ? data.price : Number(data.price);
	const expo = typeof data.expo === 'number' ? data.expo : Number(data.expo);
	if (!Number.isFinite(price) || !Number.isFinite(expo)) return null;
	return price * Math.pow(10, expo);
};

const normaliseConfidence = (data: PythPriceData | null | undefined): number | null => {
	if (!data) return null;
	const confidence = typeof data.conf === 'number' ? data.conf : Number(data.conf);
	const expo = typeof data.expo === 'number' ? data.expo : Number(data.expo);
	if (!Number.isFinite(confidence) || !Number.isFinite(expo)) return null;
	return confidence * Math.pow(10, expo);
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
			normalizedIds.forEach((id) =>
				results.set(id, { price: null, confidence: null, publishTime: null })
			);
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
				results.set(id, { price: null, confidence: null, publishTime: null });
			}
		});

		logReference('batch-latest-success', {
			count: feedIds.length,
			received: data.parsed?.length ?? 0
		});
	} catch (error) {
		logReference('batch-latest-error', { count: feedIds.length, error });
		// Return empty prices for all feeds
		normalizedIds.forEach((id) =>
			results.set(id, { price: null, confidence: null, publishTime: null })
		);
	}

	return results;
}

const networkSnapshotPromises = new Map<number, Promise<OracleSnapshot[]>>();

async function resolveNetworkSnapshots(tokens: TokenWithMarket[], networkId: number) {
	if (!tokens.length) return [];

	const existing = networkSnapshotPromises.get(networkId);
	if (existing) return existing;

	const promise = getOracleSnapshots(tokens).finally(() => {
		networkSnapshotPromises.delete(networkId);
	});

	networkSnapshotPromises.set(networkId, promise);
	return promise;
}

export async function getPythQuotes(
	tokens: TokenWithMarket[],
	network?: Network
): Promise<TradingViewQuote[]> {
	const tokensWithPriceSource = tokens.filter(
		(token) => token.priceFeedId || typeof token.fallbackPrice === 'number'
	);
	if (!tokensWithPriceSource.length) return [];

	const snapshots = await (network
		? resolveNetworkSnapshots(tokensWithPriceSource, network.id)
		: getOracleSnapshots(tokensWithPriceSource));
	logReference('pyth-prices-fetched', { count: snapshots.length });

	const snapshotMap = new Map(
		snapshots.map((snapshot) => [normaliseFeedId(snapshot.feedId), snapshot])
	);

	const results = tokensWithPriceSource.map((token) => {
		const feedId = token.priceFeedId ? normaliseFeedId(token.priceFeedId) : '';
		const latest = feedId ? snapshotMap.get(feedId) : undefined;
		const fallbackPrice = typeof token.fallbackPrice === 'number' ? token.fallbackPrice : null;
		if (latest?.publishTime === null) {
			logReference('latest-missing-publish-time', { feedId, latestPrice: latest?.price });
		}
		if (latest?.price === null) {
			logReference('latest-missing-price', { feedId, publishTime: latest?.publishTime });
		}
		return {
			symbol: token.tradingViewSymbol ?? token.symbol ?? null,
			close: latest?.price ?? fallbackPrice,
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

export interface OracleSnapshot {
	feedId: string;
	price: number | null;
	confidence: number | null;
	publishTime: number | null;
	token: TokenWithMarket;
}

export async function getOracleSnapshots(tokens: TokenWithMarket[]): Promise<OracleSnapshot[]> {
	const tokensWithFeed = tokens.filter((token) => token.priceFeedId);
	const feedIds = tokensWithFeed.map((token) => token.priceFeedId);
	const latestPrices = feedIds.length
		? await fetchLatestBatch(feedIds)
		: new Map<string, PricePoint>();

	return tokens.flatMap((token) => {
		if (!token.priceFeedId && typeof token.fallbackPrice === 'number') {
			return [
				{
					feedId: '',
					price: token.fallbackPrice,
					confidence: 0,
					publishTime: null,
					token
				}
			];
		}
		if (!token.priceFeedId) return [];

		const feedId = normaliseFeedId(token.priceFeedId);
		const latest =
			latestPrices.get(feedId) ??
			({ price: null, confidence: null, publishTime: null } satisfies PricePoint);
		return [
			{
				feedId,
				price: latest.price,
				confidence: latest.confidence,
				publishTime: latest.publishTime,
				token
			}
		];
	});
}

export async function getNetworkOracleSnapshots(tokens: TokenWithMarket[], network: Network) {
	return resolveNetworkSnapshots(tokens, network.id);
}
