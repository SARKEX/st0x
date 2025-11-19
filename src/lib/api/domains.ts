import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { TradingViewQuote } from '$lib/api/tradingview';
import type { Network } from '$lib/config/network';
import {
	TOKENS,
	CRYPTO_TOKENS,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from '$lib/config/network';
import { getSfts, getTrades } from '$lib/api/subgraph';
import {
	fetchAndQuotePaymentTokenOrders,
	buildTokenPriceMap,
	type TokenPriceSummary,
	type ProcessedQuote
} from '$lib/api/orders';
import { getNetworkOracleSnapshots, getPythQuotes, type OracleSnapshot } from '$lib/api/pyth';
import type { SgTrade } from '@rainlanguage/orderbook';
import type { DomainFetcher, PollingOptions } from '$lib/stores/polling';

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
	const allTokens = [...TOKENS, ...CRYPTO_TOKENS];
	return allTokens.filter((token) => token.chainId === network.chainId && token.priceFeedId);
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
		const quotes = await fetchAndQuotePaymentTokenOrders(network.id);
		const paymentToken =
			getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
		if (!paymentToken?.address) {
			return { summary: {}, quotes } satisfies OrderbookQuoteCache;
		}
		const map = buildTokenPriceMap(quotes, paymentToken.address);
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
		return pythQuotes;
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
