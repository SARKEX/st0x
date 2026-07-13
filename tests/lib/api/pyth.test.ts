import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOracleSnapshots, getPythQuotes } from '$lib/api/pyth';
import type { CategorizedToken } from '$lib/config/tokens';

const fallbackToken: CategorizedToken = {
	chainId: 8453,
	address: '0x0000000000000000000000000000000000000001',
	symbol: 'wtFALLBACK',
	decimals: 18,
	name: 'Wrapped Fallback Asset',
	priceFeedId: '',
	fallbackPrice: 42.5,
	category: 'ST0x',
	tradingViewSymbol: 'NASDAQ:FALLBACK'
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Pyth fallback prices', () => {
	it('returns configured fallback quotes without calling Hermes', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const quotes = await getPythQuotes([fallbackToken]);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(quotes).toEqual([
			expect.objectContaining({
				symbol: 'NASDAQ:FALLBACK',
				close: 42.5
			})
		]);
	});

	it('exposes fallback prices through oracle snapshots', async () => {
		const snapshots = await getOracleSnapshots([fallbackToken]);

		expect(snapshots).toEqual([
			expect.objectContaining({
				feedId: '',
				price: 42.5,
				confidence: 0,
				publishTime: null,
				token: fallbackToken
			})
		]);
	});
});
