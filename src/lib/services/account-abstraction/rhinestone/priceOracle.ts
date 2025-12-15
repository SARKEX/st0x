/**
 * Price Oracle for Gas Cost Estimation
 *
 * Fetches real-time token prices (ETH, USDC, etc.) for accurate gas cost conversion.
 * Uses Pyth Network as primary source with caching.
 */

import { fetchLatestPrices, type HermesEntry } from '$lib/clients/pyth';

// =============================================================================
// Constants
// =============================================================================

// Pyth price feed IDs
const PYTH_FEED_IDS = {
	ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
	USDC_USD: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
	USDT_USD: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b'
} as const;

// Cache duration (30 seconds for prices)
const PRICE_CACHE_DURATION_MS = 30000;

// Default prices as fallback
const DEFAULT_PRICES = {
	ETH: 2500,
	USDC: 1,
	USDT: 1
} as const;

// =============================================================================
// Types
// =============================================================================

export interface TokenPrice {
	symbol: string;
	priceUsd: number;
	confidence: number;
	timestamp: number;
}

interface CachedPrice {
	price: TokenPrice;
	fetchedAt: number;
}

// =============================================================================
// Price Oracle Class
// =============================================================================

export class PriceOracle {
	private cache: Map<string, CachedPrice> = new Map();

	/**
	 * Parse Pyth price data to USD price
	 */
	private parsePythPrice(entry: HermesEntry): number | null {
		if (!entry.price) return null;

		const price =
			typeof entry.price.price === 'string' ? parseFloat(entry.price.price) : entry.price.price;
		const expo = entry.price.expo;

		// Price = price * 10^expo
		return price * Math.pow(10, expo);
	}

	/**
	 * Check if cached price is still valid
	 */
	private isCacheValid(symbol: string): boolean {
		const cached = this.cache.get(symbol);
		if (!cached) return false;
		return Date.now() - cached.fetchedAt < PRICE_CACHE_DURATION_MS;
	}

	/**
	 * Fetch ETH price from Pyth
	 */
	async getEthPrice(): Promise<TokenPrice> {
		// Check cache first
		if (this.isCacheValid('ETH')) {
			return this.cache.get('ETH')!.price;
		}

		try {
			const prices = await fetchLatestPrices([PYTH_FEED_IDS.ETH_USD]);
			const ethEntry = prices.get(PYTH_FEED_IDS.ETH_USD.replace('0x', '').toLowerCase());

			if (ethEntry) {
				const priceUsd = this.parsePythPrice(ethEntry);
				if (priceUsd !== null) {
					const tokenPrice: TokenPrice = {
						symbol: 'ETH',
						priceUsd,
						confidence: ethEntry.price?.conf
							? Number(ethEntry.price.conf) * Math.pow(10, ethEntry.price.expo)
							: 0,
						timestamp: Date.now()
					};

					this.cache.set('ETH', { price: tokenPrice, fetchedAt: Date.now() });
					return tokenPrice;
				}
			}
		} catch (error) {
			console.warn(
				'Failed to fetch ETH price from Pyth:',
				error instanceof Error ? error.message : 'Unknown'
			);
		}

		// Return default price on failure
		return {
			symbol: 'ETH',
			priceUsd: DEFAULT_PRICES.ETH,
			confidence: 0,
			timestamp: Date.now()
		};
	}

	/**
	 * Fetch multiple token prices
	 */
	async getTokenPrices(symbols: string[]): Promise<Map<string, TokenPrice>> {
		const result = new Map<string, TokenPrice>();
		const feedIds: string[] = [];
		const symbolToFeedId: Map<string, string> = new Map();

		// Build feed ID list and check cache
		for (const symbol of symbols) {
			if (this.isCacheValid(symbol)) {
				result.set(symbol, this.cache.get(symbol)!.price);
				continue;
			}

			const feedId = PYTH_FEED_IDS[`${symbol}_USD` as keyof typeof PYTH_FEED_IDS];
			if (feedId) {
				feedIds.push(feedId);
				symbolToFeedId.set(feedId.replace('0x', '').toLowerCase(), symbol);
			} else {
				// Use default for unknown tokens
				result.set(symbol, {
					symbol,
					priceUsd: DEFAULT_PRICES[symbol as keyof typeof DEFAULT_PRICES] || 1,
					confidence: 0,
					timestamp: Date.now()
				});
			}
		}

		// Fetch missing prices from Pyth
		if (feedIds.length > 0) {
			try {
				const prices = await fetchLatestPrices(feedIds);

				for (const [feedId, entry] of prices) {
					const symbol = symbolToFeedId.get(feedId);
					if (symbol) {
						const priceUsd = this.parsePythPrice(entry);
						if (priceUsd !== null) {
							const tokenPrice: TokenPrice = {
								symbol,
								priceUsd,
								confidence: entry.price?.conf
									? Number(entry.price.conf) * Math.pow(10, entry.price.expo)
									: 0,
								timestamp: Date.now()
							};

							result.set(symbol, tokenPrice);
							this.cache.set(symbol, { price: tokenPrice, fetchedAt: Date.now() });
						}
					}
				}
			} catch (error) {
				console.warn(
					'Failed to fetch prices from Pyth:',
					error instanceof Error ? error.message : 'Unknown'
				);
			}
		}

		// Fill in defaults for any missing symbols
		for (const symbol of symbols) {
			if (!result.has(symbol)) {
				result.set(symbol, {
					symbol,
					priceUsd: DEFAULT_PRICES[symbol as keyof typeof DEFAULT_PRICES] || 1,
					confidence: 0,
					timestamp: Date.now()
				});
			}
		}

		return result;
	}

	/**
	 * Convert gas cost in wei to USDC
	 */
	async convertGasToUSDC(gasCostWei: bigint): Promise<bigint> {
		const ethPrice = await this.getEthPrice();

		// Convert wei to ETH (18 decimals -> 0 decimals)
		const gasCostInEth = Number(gasCostWei) / 1e18;

		// Convert ETH to USD, then to USDC decimals (6)
		const costInUsd = gasCostInEth * ethPrice.priceUsd;
		const costInUsdc = BigInt(Math.ceil(costInUsd * 1e6));

		return costInUsdc;
	}

	/**
	 * Update price from external source (e.g., Rhinestone response)
	 */
	updatePrice(symbol: string, priceUsd: number): void {
		const tokenPrice: TokenPrice = {
			symbol,
			priceUsd,
			confidence: 0, // Unknown confidence from external source
			timestamp: Date.now()
		};

		this.cache.set(symbol, { price: tokenPrice, fetchedAt: Date.now() });
	}

	/**
	 * Get cached price without fetching
	 */
	getCachedPrice(symbol: string): TokenPrice | null {
		if (this.isCacheValid(symbol)) {
			return this.cache.get(symbol)!.price;
		}
		return null;
	}

	/**
	 * Clear the price cache
	 */
	clearCache(): void {
		this.cache.clear();
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let priceOracleInstance: PriceOracle | null = null;

/**
 * Get the price oracle singleton
 */
export function getPriceOracle(): PriceOracle {
	if (!priceOracleInstance) {
		priceOracleInstance = new PriceOracle();
	}
	return priceOracleInstance;
}
