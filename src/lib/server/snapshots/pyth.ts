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
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';
import { env } from '$env/dynamic/private';

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
 * Fetch with retry + exponential backoff. Retries transient network and
 * 5xx / 429 responses; throws immediately on 4xx (other than 429) because
 * those are permanent (bad feed id, bad timestamp, etc.).
 */
async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
	let lastError: Error | null = null;
	let lastStatus: number | undefined;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(url);

			if (response.ok) return response;

			lastStatus = response.status;

			// 4xx errors (except 429) are permanent — don't retry.
			if (response.status >= 400 && response.status < 500 && response.status !== 429) {
				const err = new Error(
					`Hermes API permanent error: ${response.status} ${response.statusText}`
				);
				logQueryFailure({
					kind: 'pyth_hermes_failed',
					endpoint: 'hermes',
					attempt,
					maxAttempts,
					status: response.status,
					permanent: true,
					error: err.message
				});
				throw err;
			}

			// 5xx or 429: treat as transient.
			lastError = new Error(
				`Hermes API transient error: ${response.status} ${response.statusText}`
			);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			// Don't retry permanent errors thrown above.
			if (lastError.message.startsWith('Hermes API permanent error')) {
				throw lastError;
			}
		}

		if (attempt < maxAttempts) {
			logQueryFailure({
				kind: 'pyth_hermes_retry',
				endpoint: 'hermes',
				attempt,
				maxAttempts,
				status: lastStatus,
				error: errorMessage(lastError)
			});
			// Exponential backoff with jitter: ~500ms, ~1.1s, ~2.2s
			const base = 500 * 2 ** (attempt - 1);
			const jitter = Math.random() * 200;
			await new Promise((resolve) => setTimeout(resolve, base + jitter));
		}
	}
	logQueryFailure({
		kind: 'pyth_hermes_failed',
		endpoint: 'hermes',
		attempt: maxAttempts,
		maxAttempts,
		status: lastStatus,
		permanent: false,
		error: errorMessage(lastError)
	});
	throw lastError ?? new Error('Hermes API fetch failed after retries');
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

	// Collect tokens that need a non-Pyth price (no feed ID but has fallbackPrice)
	const fallbackTokenAddresses: {
		address: string;
		token: NonNullable<ReturnType<typeof getTokenByAnyAddress>>;
	}[] = [];

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
		} else if (token && typeof token.fallbackPrice === 'number') {
			fallbackTokenAddresses.push({ address: tokenAddress, token });
		}
	}

	// Fetch SPYM price from liquidity-monitor, fall back to hardcoded price
	if (fallbackTokenAddresses.length > 0) {
		let monitorPrice: number | null = null;
		const monitorUrl = env.LIQUIDITY_MONITOR_URL;
		if (monitorUrl) {
			try {
				const res = await fetch(`${monitorUrl.replace(/\/$/, '')}/api/prices/spym`, {
					signal: AbortSignal.timeout(5000)
				});
				if (res.ok) {
					const data = await res.json();
					monitorPrice = data.price ?? null;
				}
			} catch (e) {
				console.warn('[Pyth] liquidity-monitor SPYM fetch failed:', e);
			}
		}

		for (const { address, token } of fallbackTokenAddresses) {
			const price =
				token.symbol === 'wtSPYM' ? monitorPrice ?? token.fallbackPrice! : token.fallbackPrice!;
			results.set(address.toLowerCase(), {
				tokenAddress: address.toLowerCase(),
				tokenSymbol: token.symbol,
				priceFeedId: '',
				price,
				confidence: 0,
				expo: null,
				publishTime: adjustedTimestamp
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

	// Retries transient errors; throws on persistent failure so callers
	// (e.g. snapshot generation) fail-fast instead of poisoning the DB with
	// silent zero/null price snapshots.
	const response = await fetchWithRetry(url);
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

	// Fill in missing tokens with null prices (feed not returned for this timestamp,
	// e.g. outside market hours for a given stock)
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
