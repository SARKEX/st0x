// Pyth price fetcher for historical timestamps
// Uses Hermes API: /v2/updates/price/{publish_time}

import { TOKENS } from '$lib/config/tokens';

const HERMES_BASE_URL = 'https://hermes.pyth.network/v2/updates/price';

interface PythPriceData {
	price: string;
	conf: string;
	expo: number;
	publish_time: number;
}

interface PythParsedEntry {
	id: string;
	price: PythPriceData;
	ema_price: PythPriceData;
}

interface PythHistoricalResponse {
	binary: {
		encoding: string;
		data: string[];
	};
	parsed: PythParsedEntry[];
}

export interface TokenPrice {
	tokenAddress: string;
	tokenSymbol: string;
	priceFeedId: string;
	price: number | null;
	confidence: number | null;
	expo: number | null;
	publishTime: number | null;
}

const normalizeFeedId = (feedId: string) => feedId.replace(/^0x/, '').toLowerCase();

/**
 * Normalize Pyth price data to a human-readable number
 */
function normalizePrice(priceData: PythPriceData | null): number | null {
	if (!priceData) return null;
	const price = Number(priceData.price);
	const expo = priceData.expo;
	if (!Number.isFinite(price) || !Number.isFinite(expo)) return null;
	return price * Math.pow(10, expo);
}

function normalizeConfidence(priceData: PythPriceData | null): number | null {
	if (!priceData) return null;
	const conf = Number(priceData.conf);
	const expo = priceData.expo;
	if (!Number.isFinite(conf) || !Number.isFinite(expo)) return null;
	return conf * Math.pow(10, expo);
}

/**
 * Fetch historical Pyth prices at a specific Unix timestamp
 * Uses the /v2/updates/price/{publish_time} endpoint
 */
export async function fetchPythPricesAtTimestamp(
	timestamp: number,
	tokenAddresses: string[]
): Promise<Map<string, TokenPrice>> {
	const results = new Map<string, TokenPrice>();

	// Get feed IDs for the requested tokens
	const tokenFeedMap = new Map<string, { address: string; symbol: string; feedId: string }>();

	for (const tokenAddress of tokenAddresses) {
		const token = TOKENS.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
		if (token?.priceFeedId) {
			tokenFeedMap.set(normalizeFeedId(token.priceFeedId), {
				address: tokenAddress.toLowerCase(),
				symbol: token.symbol,
				feedId: token.priceFeedId
			});
		}
	}

	if (tokenFeedMap.size === 0) {
		console.log('[Pyth] No tokens with price feed IDs found');
		return results;
	}

	// Build the query with all feed IDs
	const feedIds = Array.from(tokenFeedMap.keys());
	const idsParams = feedIds.map((id) => `ids[]=${id}`).join('&');
	const url = `${HERMES_BASE_URL}/${timestamp}?${idsParams}`;

	console.log(`[Pyth] Fetching prices at timestamp ${timestamp} for ${feedIds.length} feeds`);

	try {
		const response = await fetch(url);

		if (!response.ok) {
			console.error(`[Pyth] API error: ${response.status} ${response.statusText}`);
			// Return empty prices for all tokens
			for (const [, tokenInfo] of tokenFeedMap) {
				results.set(tokenInfo.address, {
					tokenAddress: tokenInfo.address,
					tokenSymbol: tokenInfo.symbol,
					priceFeedId: tokenInfo.feedId,
					price: null,
					confidence: null,
					expo: null,
					publishTime: null
				});
			}
			return results;
		}

		const data: PythHistoricalResponse = await response.json();

		// Process parsed entries
		for (const entry of data.parsed || []) {
			const normalizedId = normalizeFeedId(entry.id);
			const tokenInfo = tokenFeedMap.get(normalizedId);

			if (tokenInfo) {
				results.set(tokenInfo.address, {
					tokenAddress: tokenInfo.address,
					tokenSymbol: tokenInfo.symbol,
					priceFeedId: tokenInfo.feedId,
					price: normalizePrice(entry.price),
					confidence: normalizeConfidence(entry.price),
					expo: entry.price?.expo ?? null,
					publishTime: entry.price?.publish_time ?? null
				});
			}
		}

		// Fill in missing tokens with null prices
		for (const [, tokenInfo] of tokenFeedMap) {
			if (!results.has(tokenInfo.address)) {
				results.set(tokenInfo.address, {
					tokenAddress: tokenInfo.address,
					tokenSymbol: tokenInfo.symbol,
					priceFeedId: tokenInfo.feedId,
					price: null,
					confidence: null,
					expo: null,
					publishTime: null
				});
			}
		}

		console.log(`[Pyth] Successfully fetched ${results.size} prices`);
	} catch (error) {
		console.error('[Pyth] Error fetching prices:', error);
		// Return empty prices for all tokens
		for (const [, tokenInfo] of tokenFeedMap) {
			results.set(tokenInfo.address, {
				tokenAddress: tokenInfo.address,
				tokenSymbol: tokenInfo.symbol,
				priceFeedId: tokenInfo.feedId,
				price: null,
				confidence: null,
				expo: null,
				publishTime: null
			});
		}
	}

	return results;
}

/**
 * Get token prices as a simple object keyed by token symbol
 */
export async function getTokenPricesAtTimestamp(
	timestamp: number,
	tokenAddresses: string[]
): Promise<Record<string, TokenPrice>> {
	const priceMap = await fetchPythPricesAtTimestamp(timestamp, tokenAddresses);
	const result: Record<string, TokenPrice> = {};

	for (const [address, price] of priceMap) {
		result[address] = price;
	}

	return result;
}
