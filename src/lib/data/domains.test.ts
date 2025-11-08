import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Network } from '$lib/network';


const {
	network,
	networkWithoutUsdc,
	mockTokens,
	networkModule,
	settlementToken,
	mockGetSfts,
	mockGetTrades,
	mockFetchOrders,
	mockBuildTokenMap,
	mockGetPythQuotes,
	mockGetOracleSnapshots,
	mockGetPrice
} = vi.hoisted(() => {
	const network = { id: 1, chainId: 100, displayName: 'Test Network' } as unknown as Network;
	const networkWithoutUsdc = { id: 2, chainId: 100, displayName: 'No USDC' } as unknown as Network;

	const mockTokens = [
		{
			chainId: network.chainId,
			address: '0xToken1',
			symbol: 'AAA',
			decimals: 18,
			name: 'Token AAA',
			priceFeedId: 'feed-aaa'
		},
		{
			chainId: network.chainId,
			address: '0xToken2',
			symbol: 'BBB',
			decimals: 18,
			name: 'Token BBB',
			priceFeedId: 'feed-bbb'
		}
	];

	const settlementToken = {
		chainId: network.chainId,
		address: '0xUSDC',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		priceFeedId: 'usdc-feed',
		logoUrl: '/images/USDC.png'
	};

	const defaultSettlementTokens: Record<number, typeof settlementToken> = {
		[network.id]: settlementToken
	};
	const settlementTokensByNetwork: Record<number, Array<typeof settlementToken>> = {
		[network.id]: [settlementToken]
	};

	const networkModule = {
		TOKENS: mockTokens,
		DEFAULT_SETTLEMENT_TOKENS: defaultSettlementTokens,
		SETTLEMENT_TOKENS_BY_NETWORK: settlementTokensByNetwork,
		getDefaultSettlementTokenForNetwork: vi.fn((chainId: number) => {
			return defaultSettlementTokens[chainId];
		}),
		DEFAULT_SETTLEMENT_TOKENS: defaultSettlementTokens,
		SETTLEMENT_TOKENS_BY_NETWORK: settlementTokensByNetwork,
		getDefaultSettlementTokenForNetwork: vi.fn((chainId: number) => {
			return defaultSettlementTokens[chainId];
		})
	};

	return {
		network,
		networkWithoutUsdc,
		mockTokens,
		networkModule,
		settlementToken,
		mockGetSfts: vi.fn(),
		mockGetTrades: vi.fn(),
		mockFetchOrders: vi.fn(),
		mockBuildTokenMap: vi.fn(),
		mockGetPythQuotes: vi.fn(),
		mockGetOracleSnapshots: vi.fn(),
		mockGetPrice: vi.fn()
	};
});

vi.mock('$lib/network', () => networkModule);
vi.mock('$lib/query', () => ({
	getSfts: mockGetSfts,
	getTrades: mockGetTrades
}));
vi.mock('$lib/utils/quote', () => ({
	fetchAndQuoteSettlementTokenOrders: mockFetchOrders,
	buildTokenPriceMap: mockBuildTokenMap
}));
vi.mock('$lib/services/pyth', () => ({
	getPythQuotes: mockGetPythQuotes,
	getNetworkOracleSnapshots: mockGetOracleSnapshots
}));
vi.mock('$lib/getPrice', () => ({
	getPrice: mockGetPrice
}));
vi.mock('sushi/evm', () => ({
	EvmToken: class MockEvmToken {
		constructor(public config: unknown) {}
	},
	evmChainIds: {
		[network.chainId]: 1
	}
}));

import { DOMAIN_DEFINITIONS } from './domains';

describe('domain fetchers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
		networkModule.DEFAULT_SETTLEMENT_TOKENS[network.id] = settlementToken;
		networkModule.SETTLEMENT_TOKENS_BY_NETWORK[network.id] = [settlementToken];
		networkModule.DEFAULT_SETTLEMENT_TOKENS[network.id] = settlementToken;
		networkModule.SETTLEMENT_TOKENS_BY_NETWORK[network.id] = [settlementToken];
		networkModule.getDefaultSettlementTokenForNetwork.mockImplementation((chainId: number) =>
			networkModule.DEFAULT_SETTLEMENT_TOKENS[chainId]
		);
		networkModule.getDefaultSettlementTokenForNetwork.mockImplementation((chainId: number) =>
			networkModule.DEFAULT_SETTLEMENT_TOKENS[chainId]
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('fetches vault snapshots and returns an empty array on error', async () => {
		const vaultFetcher = DOMAIN_DEFINITIONS.vaultSnapshot.fetcher;
		const data = [{ id: '1' }];
		mockGetSfts.mockResolvedValue(data);

		const result = await vaultFetcher(network);
		expect(mockGetSfts).toHaveBeenCalledWith(network);
		expect(result).toEqual(data);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockGetSfts.mockRejectedValueOnce(new Error('boom'));
		const fallback = await vaultFetcher(network);
		expect(fallback).toEqual([]);
		consoleSpy.mockRestore();
	});

	it('builds a summary map for orderbook quotes and handles missing settlement token', async () => {
		const orderbookFetcher = DOMAIN_DEFINITIONS.orderbookQuotes.fetcher;
		const quotes = [{ id: 'q1' }];
		const summaryValue = { midPrice: 1.23 };
		mockFetchOrders.mockResolvedValue(quotes);
		mockBuildTokenMap.mockReturnValue(new Map([['0xToken1', summaryValue]]));

		const result = await orderbookFetcher(network);
		expect(mockFetchOrders).toHaveBeenCalledWith(network.id);
		expect(mockBuildTokenMap).toHaveBeenCalledWith(quotes, settlementToken.address);
		expect(result.summary).toEqual({ '0xtoken1': summaryValue });
		expect(result.quotes).toBe(quotes);

		const noUsdcResult = await orderbookFetcher(networkWithoutUsdc);
		expect(mockFetchOrders).toHaveBeenLastCalledWith(networkWithoutUsdc.id);
		expect(mockBuildTokenMap).toHaveBeenCalledTimes(1);
		expect(noUsdcResult.summary).toEqual({});
		expect(noUsdcResult.quotes).toBe(quotes);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockFetchOrders.mockRejectedValueOnce(new Error('failure'));
		const fallback = await orderbookFetcher(network);
		expect(fallback).toEqual({ summary: {}, quotes: [] });
		consoleSpy.mockRestore();
	});

	it('merges price feeds with sushi fallbacks', async () => {
		const priceFeedFetcher = DOMAIN_DEFINITIONS.priceFeeds.fetcher;
		const pythQuote = {
			symbol: 'AAA',
			close: 10,
			open: 10,
			high: 10,
			low: 10,
			volume: 0,
			marketCap: 0,
			percentChange: 0,
			changePercent: 0,
			change: 0,
			changeAbs: 0,
			prevClose: 10,
			week52High: 10,
			week52Low: 10
		};
		mockGetPythQuotes.mockResolvedValue([pythQuote]);
		mockGetPrice.mockResolvedValue('123.45');

		const result = await priceFeedFetcher(network);
		expect(mockGetPythQuotes).toHaveBeenCalledWith(mockTokens, network);
		expect(mockGetPrice).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual(pythQuote);
		const fallbackQuote = result[1];
		expect(fallbackQuote.symbol).toBe('BBB');
		expect(fallbackQuote.close).toBe(123.45);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockGetPythQuotes.mockRejectedValueOnce(new Error('oops'));
		const fallback = await priceFeedFetcher(network);
		expect(fallback).toEqual([]);
		consoleSpy.mockRestore();
	});

	it('transforms oracle snapshots into a keyed record', async () => {
		const oracleFetcher = DOMAIN_DEFINITIONS.oracleQuotes.fetcher;
		mockGetOracleSnapshots.mockResolvedValue([
			{
				feedId: 'feed-one',
				token: { address: '0xToken1' },
				price: 100,
				confidence: 1,
				publishTime: 123
			},
			{
				feedId: 'feed-two',
				token: { address: undefined },
				price: null,
				confidence: null,
				publishTime: null
			}
		]);

		const result = await oracleFetcher(network);
		expect(result['0xtoken1']).toEqual({
			feedId: 'feed-one',
			tokenAddress: '0xToken1',
			price: 100,
			confidence: 1,
			publishTime: 123
		});
		expect(result['feed-two']).toEqual({
			feedId: 'feed-two',
			tokenAddress: undefined,
			price: null,
			confidence: null,
			publishTime: null
		});
	});

	it('fetches trade windows and handles failures', async () => {
		const pendingFetcher = DOMAIN_DEFINITIONS.pendingTrades.fetcher;
		const tradeFetcher = DOMAIN_DEFINITIONS.tradeActivity.fetcher;
		mockGetTrades.mockResolvedValueOnce(['pending-trade']);
		const pending = await pendingFetcher(network);
		expect(mockGetTrades).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), network);
		const [from, to] = mockGetTrades.mock.calls[0];
		expect(to - from).toBe(600);
		expect(pending.trades).toEqual(['pending-trade']);
		expect(pending.range.to).toBe(Math.floor(Date.now() / 1000));
		expect(pending.range.from).toBe(pending.range.to - 600);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockGetTrades.mockRejectedValueOnce(new Error('no trades'));
		const fallback = await tradeFetcher(network);
		expect(fallback).toEqual({ trades: [], range: { from: 0, to: 0 } });
		consoleSpy.mockRestore();
	});
});
