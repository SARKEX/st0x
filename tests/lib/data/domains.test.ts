import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Network } from '$lib/config/network';

const {
	network,
	mockTokens,
	networkModule,
	mockGetSfts,
	mockGetTrades,
	mockGetOracleSnapshots
} = vi.hoisted(() => {
	const network = { id: 1, chainId: 100, displayName: 'Test Network' } as unknown as Network;

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

	const networkModule = {
		TOKENS: mockTokens,
		CRYPTO_TOKENS: []
	};

	return {
		network,
		mockTokens,
		networkModule,
		mockGetSfts: vi.fn(),
		mockGetTrades: vi.fn(),
		mockGetOracleSnapshots: vi.fn()
	};
});

vi.mock('$lib/config/network', () => networkModule);
vi.mock('$lib/api/subgraph', () => ({
	getSfts: mockGetSfts,
	getTrades: mockGetTrades
}));
vi.mock('$lib/api/pyth', () => ({
	getNetworkOracleSnapshots: mockGetOracleSnapshots
}));

import { DOMAIN_DEFINITIONS } from '$lib/api/domains';

describe('domain fetchers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
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
		const fallback = await pendingFetcher(network);
		expect(fallback).toEqual({ trades: [], range: { from: 0, to: 0 } });
		consoleSpy.mockRestore();
	});
});
