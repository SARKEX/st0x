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
import type { SgTrade } from '@rainlanguage/orderbook';
import type { DomainFetcher, PollingOptions } from '$lib/data/polling-cache';

export type DomainKey = 'vaultSnapshot' | 'orderbookQuotes' | 'priceFeeds' | 'tradeActivity';

export interface TradeMetricPayload {
        trades: SgTrade[];
        range: { from: number; to: number };
}

export interface OrderbookQuoteCache {
        summary: Record<string, TokenPriceSummary>;
        quotes: ProcessedQuote[];
}

export interface DomainPayloads {
        vaultSnapshot: OffchainAssetReceiptVault[];
        orderbookQuotes: OrderbookQuoteCache;
        priceFeeds: TradingViewQuote[];
        tradeActivity: TradeMetricPayload;
}

type DomainDefinition<K extends DomainKey> = PollingOptions<DomainPayloads[K]>;

type DefinitionMap = { [K in DomainKey]: DomainDefinition<K> };

const vaultSnapshotFetcher: DomainFetcher<OffchainAssetReceiptVault[]> = async (network) => {
        return (await getSfts(network)) ?? [];
};

const orderbookFetcher: DomainFetcher<OrderbookQuoteCache> = async (network) => {
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
};

const priceFeedFetcher: DomainFetcher<TradingViewQuote[]> = async (network) => {
        const tokens = TOKENS.filter((token) => token.chainId === network.chainId && token.priceFeedId);
        if (!tokens.length) {
                return [];
        }
        return getPythQuotes(tokens);
};

const tradeActivityFetcher: DomainFetcher<TradeMetricPayload> = async (network: Network) => {
        const now = Math.floor(Date.now() / 1000);
        const monthAgo = now - 30 * 24 * 60 * 60;
        const trades = await getTrades(monthAgo, now, network);
        return {
                trades,
                range: { from: monthAgo, to: now }
        } satisfies TradeMetricPayload;
};

export const DOMAIN_DEFINITIONS: DefinitionMap = {
        vaultSnapshot: {
                refreshInterval: 120_000,
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
                refreshInterval: 600_000,
                autoPause: true,
                fetcher: tradeActivityFetcher
        }
};
