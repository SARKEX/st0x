import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { TradingViewQuote } from '$lib/services/tradingview';
import type { Network } from '$lib/network';
import { TOKENS, USDC_TOKENS } from '$lib/network';
import { getSfts, getTrades } from '$lib/query';
import {
	fetchAndQuoteUSDCOrders,
	buildTokenPriceMap,
	type TokenPriceSummary,
	type ProcessedQuote
} from '$lib/utils/quote';
import { getNetworkOracleSnapshots, getPythQuotes, type OracleSnapshot } from '$lib/services/pyth';
import { getPrice } from '$lib/getPrice';
import type { SgTrade } from '@rainlanguage/orderbook';
import type { DomainFetcher, PollingOptions } from '$lib/data/polling-cache';
import { EvmToken } from 'sushi/evm';
import { evmChainIds } from 'sushi/evm';

export type DomainKey =
	| 'vaultSnapshot'
	| 'orderbookQuotes'
	| 'priceFeeds'
	| 'tradeActivity'
	| 'pendingTrades'
	| 'oracleQuotes';

interface TradeWindowPayload {
	trades: SgTrade[];
	range: { from: number; to: number };
}

export type TradeMetricPayload = TradeWindowPayload;

export interface OrderbookQuoteCache {
	summary: Record<string, TokenPriceSummary>;
	quotes: ProcessedQuote[];
}

export type PendingTradePayload = TradeWindowPayload;

export interface OracleQuote {
	feedId: string;
	tokenAddress: string;
	price: number | null;
	confidence: number | null;
	publishTime: number | null;
}

export interface DomainPayloads {
	vaultSnapshot: OffchainAssetReceiptVault[];
	orderbookQuotes: OrderbookQuoteCache;
	priceFeeds: TradingViewQuote[];
	tradeActivity: TradeMetricPayload;
	pendingTrades: PendingTradePayload;
	oracleQuotes: Record<string, OracleQuote>;
}

type DomainDefinition<K extends DomainKey> = PollingOptions<DomainPayloads[K]>;

type DefinitionMap = { [K in DomainKey]: DomainDefinition<K> };

function getTokensWithPriceFeed(network: Network) {
	return TOKENS.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}

const vaultSnapshotFetcher: DomainFetcher<OffchainAssetReceiptVault[]> = async (network) => {
	try {
		return (await getSfts(network)) ?? [];
	} catch (error) {
		console.error(`Failed to fetch vault snapshots for ${network.displayName}:`, error);
		return [];
	}
};

const orderbookFetcher: DomainFetcher<OrderbookQuoteCache> = async (network) => {
	try {
		const quotes = await fetchAndQuoteUSDCOrders(network.id);
		const usdc = USDC_TOKENS[network.id]?.address;
		if (!usdc) {
			return { summary: {}, quotes } satisfies OrderbookQuoteCache;
		}
		const map = buildTokenPriceMap(quotes, usdc);
		const summary: Record<string, TokenPriceSummary> = {};
		for (const [address, value] of map.entries()) {
			summary[address.toLowerCase()] = value;
		}
		return { summary, quotes } satisfies OrderbookQuoteCache;
	} catch (error) {
		console.error(`Failed to fetch orderbook quotes for ${network.displayName}:`, error);
		return { summary: {}, quotes: [] } satisfies OrderbookQuoteCache;
	}
};

const priceFeedFetcher: DomainFetcher<TradingViewQuote[]> = async (network) => {
	try {
		const tokens = getTokensWithPriceFeed(network);
		if (!tokens.length) {
			return [];
		}
		const pythQuotes = await getPythQuotes(tokens, network);

		// Enrich with Sushi API prices as fallback for tokens without Pyth data
		const pricesWithSushi: TradingViewQuote[] = [];
		for (const quote of pythQuotes) {
			pricesWithSushi.push(quote);
		}

		// Try to fetch Sushi prices for any tokens missing from Pyth
		try {
			const usdc = USDC_TOKENS[network.id];
			if (usdc && evmChainIds[network.chainId]) {
				for (const token of tokens) {
					const hasPythData = pythQuotes.some((q) => q.symbol === token.symbol);
					if (!hasPythData) {
						try {
							const priceStr = await getPrice(
								new EvmToken({
									chainId: evmChainIds[network.chainId],
									address: token.address as `0x${string}`,
									symbol: token.symbol || '',
									name: token.name || token.symbol || '',
									decimals: token.decimals || 18
								}),
								new EvmToken({
									chainId: evmChainIds[network.chainId],
									address: usdc.address as `0x${string}`,
									symbol: usdc.symbol || 'USDC',
									name: usdc.name || 'USDC',
									decimals: usdc.decimals || 6
								})
							);
							const price = parseFloat(priceStr) || 0;
							pricesWithSushi.push({
								symbol: token.symbol || '',
								close: price,
								open: price,
								high: price,
								low: price,
								volume: 0,
								marketCap: 0,
								percentChange: 0,
								changePercent: 0,
								change: 0,
								changeAbs: 0,
								prevClose: price,
								week52High: price,
								week52Low: price
							} as TradingViewQuote);
						} catch (e) {
							// Skip tokens that fail in Sushi API
							console.debug(`Sushi price fetch failed for ${token.symbol}:`, e);
						}
					}
				}
			}
		} catch (e) {
			// Continue with Pyth data if Sushi enrichment fails
			console.debug(`Sushi API enrichment failed:`, e);
		}

		return pricesWithSushi;
	} catch (error) {
		console.error(`Failed to fetch price feeds for ${network.displayName}:`, error);
		return [];
	}
};

const oracleQuoteFetcher: DomainFetcher<Record<string, OracleQuote>> = async (network: Network) => {
	try {
		const tokens = getTokensWithPriceFeed(network);
		if (!tokens.length) {
			return {};
		}
		const snapshots = await getNetworkOracleSnapshots(tokens, network);
		const records: Record<string, OracleQuote> = {};
		snapshots.forEach((snapshot: OracleSnapshot) => {
			const address = snapshot.token.address?.toLowerCase?.() ?? snapshot.feedId;
			records[address] = {
				feedId: snapshot.feedId,
				tokenAddress: snapshot.token.address,
				price: snapshot.price,
				confidence: snapshot.confidence,
				publishTime: snapshot.publishTime
			};
		});
		return records;
	} catch (error) {
		console.error(`Failed to fetch oracle quotes for ${network.displayName}:`, error);
		return {};
	}
};

function createTradeFetcher(
	windowSeconds: number,
	label: string
): DomainFetcher<TradeWindowPayload> {
	return async (network: Network) => {
		try {
			const now = Math.floor(Date.now() / 1000);
			const from = now - windowSeconds;
			const trades = await getTrades(from, now, network);
			return {
				trades,
				range: { from, to: now }
			} satisfies TradeWindowPayload;
		} catch (error) {
			console.error(`Failed to fetch ${label} for ${network.displayName}:`, error);
			return {
				trades: [],
				range: { from: 0, to: 0 }
			} satisfies TradeWindowPayload;
		}
	};
}

const tradeActivityFetcher = createTradeFetcher(30 * 24 * 60 * 60, 'trade activity');
const pendingTradesFetcher = createTradeFetcher(10 * 60, 'pending trades');

export const DOMAIN_DEFINITIONS: DefinitionMap = {
	vaultSnapshot: {
		refreshInterval: 60_000, // 1 minute
		autoPause: false,
		fetcher: vaultSnapshotFetcher
	},
	orderbookQuotes: {
		refreshInterval: 15_000,
		autoPause: true,
		browserOnly: true,
		fetcher: orderbookFetcher
	},
	priceFeeds: {
		refreshInterval: 300_000,
		autoPause: false,
		fetcher: priceFeedFetcher
	},
	tradeActivity: {
		refreshInterval: 300_000, // 5 minutes
		autoPause: true,
		fetcher: tradeActivityFetcher
	},
	pendingTrades: {
		refreshInterval: 5_000, // Poll every 5 seconds for pending trades
		autoPause: true, // Stop polling when no subscribers
		browserOnly: true,
		fetcher: pendingTradesFetcher
	},
	oracleQuotes: {
		refreshInterval: 15_000,
		autoPause: true,
		fetcher: oracleQuoteFetcher
	}
};
