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
import { getPythQuotes } from '$lib/services/pyth';
import { getPrice } from '$lib/getPrice';
import type { SgTrade } from '@rainlanguage/orderbook';
import type { DomainFetcher, PollingOptions } from '$lib/data/polling-cache';
import { EvmToken } from 'sushi/evm';
import { evmChainIds } from 'sushi/evm';

export type DomainKey = 'vaultSnapshot' | 'orderbookQuotes' | 'priceFeeds' | 'tradeActivity' | 'pendingTrades';

export interface TradeMetricPayload {
        trades: SgTrade[];
        range: { from: number; to: number };
}

export interface OrderbookQuoteCache {
        summary: Record<string, TokenPriceSummary>;
        quotes: ProcessedQuote[];
}

export interface PendingTradePayload {
        trades: SgTrade[];
        range: { from: number; to: number };
}

export interface DomainPayloads {
        vaultSnapshot: OffchainAssetReceiptVault[];
        orderbookQuotes: OrderbookQuoteCache;
        priceFeeds: TradingViewQuote[];
        tradeActivity: TradeMetricPayload;
        pendingTrades: PendingTradePayload;
}

type DomainDefinition<K extends DomainKey> = PollingOptions<DomainPayloads[K]>;

type DefinitionMap = { [K in DomainKey]: DomainDefinition<K> };

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
                const tokens = TOKENS.filter((token) => token.chainId === network.chainId && token.priceFeedId);
                if (!tokens.length) {
                        return [];
                }
                const pythQuotes = await getPythQuotes(tokens);

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

const tradeActivityFetcher: DomainFetcher<TradeMetricPayload> = async (network: Network) => {
        try {
                const now = Math.floor(Date.now() / 1000);
                const monthAgo = now - 30 * 24 * 60 * 60;
                const trades = await getTrades(monthAgo, now, network);
                return {
                        trades,
                        range: { from: monthAgo, to: now }
                } satisfies TradeMetricPayload;
        } catch (error) {
                console.error(`Failed to fetch trade activity for ${network.displayName}:`, error);
                return {
                        trades: [],
                        range: { from: 0, to: 0 }
                } satisfies TradeMetricPayload;
        }
};

const pendingTradesFetcher: DomainFetcher<PendingTradePayload> = async (network: Network) => {
        try {
                const now = Math.floor(Date.now() / 1000);
                const tenMinutesAgo = now - 10 * 60;
                const trades = await getTrades(tenMinutesAgo, now, network);
                return {
                        trades,
                        range: { from: tenMinutesAgo, to: now }
                } satisfies PendingTradePayload;
        } catch (error) {
                console.error(`Failed to fetch pending trades for ${network.displayName}:`, error);
                return {
                        trades: [],
                        range: { from: 0, to: 0 }
                } satisfies PendingTradePayload;
        }
};

export const DOMAIN_DEFINITIONS: DefinitionMap = {
        vaultSnapshot: {
                refreshInterval: 60_000,  // 1 minute
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
                refreshInterval: 300_000,  // 5 minutes
                autoPause: true,
                fetcher: tradeActivityFetcher
        },
        pendingTrades: {
                refreshInterval: 5_000,  // Poll every 5 seconds for pending trades
                autoPause: true,  // Stop polling when no subscribers
                browserOnly: true,
                fetcher: pendingTradesFetcher
        }
};
