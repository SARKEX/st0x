import type { PythToken } from '$lib/types';
import type { TradingViewQuote } from './tradingview';

const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';
const TARGET_LOOKBACK_SECONDS = 60 * 60 * 24; // 24 hours
const HISTORY_WINDOW_SECONDS = 60 * 45; // ±45 minutes around target to increase hit rate
const REQUEST_CHUNK_SIZE = 25;
const HISTORY_INTERVAL_SECONDS = 900; // 15 minutes

interface PythPriceData {
	price: number | string;
	expo: number;
}

interface PythParsedEntry {
	id: string;
	price: PythPriceData | null;
	publish_time: number | string;
}

interface PythApiResponse {
	parsed?: PythParsedEntry[];
}

type PricePoint = {
	price: number | null;
	publishTime: number | null;
};

type Snapshot = {
	latest: PricePoint;
	reference: PricePoint;
};

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function normalisePrice(priceData: PythPriceData | null | undefined): number | null {
	if (!priceData) return null;
	const price = typeof priceData.price === 'number' ? priceData.price : Number(priceData.price);
	const expo = typeof priceData.expo === 'number' ? priceData.expo : Number(priceData.expo);
	if (!Number.isFinite(price) || !Number.isFinite(expo)) return null;
	return price * Math.pow(10, expo);
}

function normalisePublishTime(raw: number | string | undefined): number | null {
	if (typeof raw === 'number') return raw;
	if (typeof raw === 'string') {
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

async function fetchParsedEntries(url: string): Promise<PythParsedEntry[]> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.warn(`[pyth] request failed: ${response.status} ${response.statusText}`);
			return [];
		}
		const data = (await response.json()) as PythApiResponse;
		return Array.isArray(data?.parsed) ? data.parsed : [];
	} catch (error) {
		console.warn('[pyth] request error', error);
		return [];
	}
}

function buildLatestUrl(ids: string[]): string {
	const params = new URLSearchParams();
	ids.forEach((id) => params.append('ids[]', id));
	return `${HERMES_BASE_URL}/latest?${params.toString()}`;
}

function buildHistoryUrl(ids: string[], startTime: number, endTime: number): string {
	const params = new URLSearchParams();
	ids.forEach((id) => params.append('ids[]', id));
	params.set('start_time', Math.max(0, Math.floor(startTime)).toString());
	params.set('end_time', Math.max(0, Math.floor(endTime)).toString());
	params.set('interval', HISTORY_INTERVAL_SECONDS.toString());
	return `${HERMES_BASE_URL}/time-series?${params.toString()}`;
}

async function fetchLatestPrices(feedIds: string[]): Promise<Map<string, PricePoint>> {
	const result = new Map<string, PricePoint>();
	const chunks = chunkArray(feedIds, REQUEST_CHUNK_SIZE);
	const responses = await Promise.all(chunks.map((chunk) => fetchParsedEntries(buildLatestUrl(chunk))));
	for (const entries of responses) {
		for (const entry of entries) {
			const key = entry.id?.toLowerCase();
			if (!key) continue;
			const price = normalisePrice(entry.price);
			const publishTime = normalisePublishTime(entry.publish_time);
			result.set(key, { price, publishTime });
		}
	}
	return result;
}

async function fetchHistoricalPrices(
	feedIds: string[],
	targetTime: number
): Promise<Map<string, PricePoint>> {
	const result = new Map<string, PricePoint>();
	const start = targetTime - HISTORY_WINDOW_SECONDS;
	const end = targetTime + HISTORY_WINDOW_SECONDS;
	const chunks = chunkArray(feedIds, REQUEST_CHUNK_SIZE);
	const responses = await Promise.all(
		chunks.map((chunk) => fetchParsedEntries(buildHistoryUrl(chunk, start, end)))
	);
	for (const entries of responses) {
		for (const entry of entries) {
			const key = entry.id?.toLowerCase();
			if (!key) continue;
			const price = normalisePrice(entry.price);
			const publishTime = normalisePublishTime(entry.publish_time);
			if (price === null || publishTime === null) continue;
			const existing = result.get(key);
			if (!existing) {
				result.set(key, { price, publishTime });
				continue;
			}
			const currentDistance = Math.abs((existing.publishTime ?? targetTime) - targetTime);
			const newDistance = Math.abs(publishTime - targetTime);
			if (newDistance < currentDistance) {
				result.set(key, { price, publishTime });
			}
		}
	}
	return result;
}

function buildSnapshots(
	feedIds: string[],
	latestMap: Map<string, PricePoint>,
	historyMap: Map<string, PricePoint>
): Record<string, Snapshot> {
	const snapshots: Record<string, Snapshot> = {};
	for (const id of feedIds) {
		const key = id.toLowerCase();
		snapshots[key] = {
			latest: latestMap.get(key) ?? { price: null, publishTime: null },
			reference: historyMap.get(key) ?? { price: null, publishTime: null }
		};
	}
	return snapshots;
}

function calculateChange(current: number | null, previous: number | null) {
	if (current === null || previous === null || previous === 0) {
		return { change: null, changePercent: null };
	}
	const change = current - previous;
	const changePercent = (change / previous) * 100;
	return { change, changePercent };
}

export async function getPythQuotes(tokens: PythToken[]): Promise<TradingViewQuote[]> {
	const tokensWithFeed = tokens.filter((token) => token.priceFeedId);
	if (!tokensWithFeed.length) return [];

	const uniqueFeedIds = Array.from(
		new Set(tokensWithFeed.map((token) => token.priceFeedId.toLowerCase()))
	);

	const now = Math.floor(Date.now() / 1000);
	const targetTime = now - TARGET_LOOKBACK_SECONDS;

	const [latestMap, historyMap] = await Promise.all([
		fetchLatestPrices(uniqueFeedIds),
		fetchHistoricalPrices(uniqueFeedIds, targetTime)
	]);

	const snapshots = buildSnapshots(uniqueFeedIds, latestMap, historyMap);

	return tokensWithFeed.map<TradingViewQuote>((token) => {
		const feedKey = token.priceFeedId.toLowerCase();
		const snapshot = snapshots[feedKey];
		const latestPrice = snapshot?.latest.price ?? null;
		const previousPrice = snapshot?.reference.price ?? null;
		const { change, changePercent } = calculateChange(latestPrice, previousPrice);

		const symbol = (token as { tradingViewSymbol?: string }).tradingViewSymbol ?? token.symbol ?? null;

		return {
			symbol,
			close: latestPrice,
			open: null,
			high: null,
			low: null,
			volume: null,
			change,
			changeAbs: change === null ? null : Math.abs(change),
			changePercent,
			week52High: null,
			week52Low: null,
			marketCap: null,
			prevClose: previousPrice
		};
	});
}

export type { Snapshot as PythSnapshot };
