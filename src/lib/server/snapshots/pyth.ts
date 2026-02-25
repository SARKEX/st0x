// Pyth price fetcher for historical timestamps
// Uses Hermes API: /v2/updates/price/{timestamp}
// Returns the first price update at or after the given timestamp
// See: https://hermes.pyth.network/docs
//
// Note: Pyth stock prices are only available during US market hours.
// If the requested timestamp is outside market hours, we adjust to the
// last market close to get valid price data.

import { getTokenByAnyAddress } from '$lib/config/tokens';
import { getPriceTimestamp } from './marketHours';
import { HERMES_BASE_URL } from '$lib/config/constants';

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

export interface PythPriceResult {
	prices: Map<string, TokenPrice>;
	priceTimestamp: number; // The actual timestamp used for the price query (may differ from requested if outside market hours)
}

/**
 * Fetch Pyth prices at a specific historical timestamp
 * Uses the Hermes API: /v2/updates/price/{timestamp}
 * Returns the first price update at or after the given timestamp
 *
 * Note: If the timestamp is outside US market hours, the timestamp is
 * automatically adjusted to the last market close to ensure valid price data.
 */
export async function fetchPythPricesAtTimestamp(
	timestamp: number,
	tokenAddresses: string[]
): Promise<PythPriceResult> {
	const results = new Map<string, TokenPrice>();

	// Adjust timestamp to last market close if outside market hours
	// This is necessary because Pyth only has stock price data during US market hours
	const adjustedTimestamp = getPriceTimestamp(timestamp);

	// Get feed IDs for the requested tokens
	// Multiple addresses can share the same feed ID (wrapped, unwrapped, legacy all use the same price)
	const tokenFeedMap = new Map<
		string,
		{ addresses: { address: string; symbol: string }[]; feedId: string }
	>();

	for (const tokenAddress of tokenAddresses) {
		const token = getTokenByAnyAddress(tokenAddress);
		if (token?.priceFeedId) {
			const normalizedId = normalizeFeedId(token.priceFeedId);
			if (!tokenFeedMap.has(normalizedId)) {
				tokenFeedMap.set(normalizedId, {
					addresses: [],
					feedId: token.priceFeedId
				});
			}
			tokenFeedMap.get(normalizedId)!.addresses.push({
				address: tokenAddress.toLowerCase(),
				symbol: token.symbol
			});
		}
	}

	if (tokenFeedMap.size === 0) {
		console.log('[Pyth] No tokens with price feed IDs found');
		return { prices: results, priceTimestamp: adjustedTimestamp };
	}

	// Helper to set results for all addresses sharing a feed
	const setResultsForFeed = (
		feedInfo: { addresses: { address: string; symbol: string }[]; feedId: string },
		price: number | null,
		confidence: number | null,
		expo: number | null,
		publishTime: number | null
	) => {
		for (const addr of feedInfo.addresses) {
			results.set(addr.address, {
				tokenAddress: addr.address,
				tokenSymbol: addr.symbol,
				priceFeedId: feedInfo.feedId,
				price,
				confidence,
				expo,
				publishTime
			});
		}
	};

	// Build the query with all feed IDs
	// Hermes API uses ids[]= format for multiple feeds
	const feedIds = Array.from(tokenFeedMap.keys());
	const idsParams = feedIds.map((id) => `ids[]=${id}`).join('&');

	const url = `${HERMES_BASE_URL}/${adjustedTimestamp}?${idsParams}`;
	console.log(
		`[Pyth] Fetching prices at timestamp ${adjustedTimestamp} for ${feedIds.length} feeds`
	);

	try {
		const response = await fetch(url);

		if (!response.ok) {
			console.error(`[Pyth] Hermes API error: ${response.status} ${response.statusText}`);
			// Return empty prices for all tokens
			for (const [, feedInfo] of tokenFeedMap) {
				setResultsForFeed(feedInfo, null, null, null, null);
			}
			return { prices: results, priceTimestamp: adjustedTimestamp };
		}

		const data: PythHistoricalResponse = await response.json();

		// Process parsed entries — fan out to all addresses sharing each feed ID
		for (const entry of data.parsed || []) {
			const normalizedId = normalizeFeedId(entry.id);
			const feedInfo = tokenFeedMap.get(normalizedId);

			if (feedInfo) {
				setResultsForFeed(
					feedInfo,
					normalizePrice(entry.price),
					normalizeConfidence(entry.price),
					entry.price?.expo ?? null,
					entry.price?.publish_time ?? null
				);
			}
		}

		// Fill in missing tokens with null prices
		for (const [, feedInfo] of tokenFeedMap) {
			for (const addr of feedInfo.addresses) {
				if (!results.has(addr.address)) {
					results.set(addr.address, {
						tokenAddress: addr.address,
						tokenSymbol: addr.symbol,
						priceFeedId: feedInfo.feedId,
						price: null,
						confidence: null,
						expo: null,
						publishTime: null
					});
				}
			}
		}

		const successCount = Array.from(results.values()).filter((r) => r.price !== null).length;
		console.log(`[Pyth] Successfully fetched ${successCount}/${results.size} prices`);
	} catch (error) {
		console.error('[Pyth] Error fetching prices:', error);
		// Return empty prices for all tokens
		for (const [, feedInfo] of tokenFeedMap) {
			setResultsForFeed(feedInfo, null, null, null, null);
		}
	}

	return { prices: results, priceTimestamp: adjustedTimestamp };
}

/**
 * Get token prices as a simple object keyed by token symbol
 */
export async function getTokenPricesAtTimestamp(
	timestamp: number,
	tokenAddresses: string[]
): Promise<{ prices: Record<string, TokenPrice>; priceTimestamp: number }> {
	const { prices: priceMap, priceTimestamp } = await fetchPythPricesAtTimestamp(
		timestamp,
		tokenAddresses
	);
	const result: Record<string, TokenPrice> = {};

	for (const [address, price] of priceMap) {
		result[address] = price;
	}

	return { prices: result, priceTimestamp };
}
