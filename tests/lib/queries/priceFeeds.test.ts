import { describe, expect, it } from 'vitest';
import { marketPriceToQuote } from '$lib/queries/priceFeeds';

describe('price feed quote helpers', () => {
	it('adapts a retained midpoint and 24h change for existing dashboard consumers', () => {
		expect(
			marketPriceToQuote('NASDAQ:NVDA', {
				price: 200,
				bid: 199,
				ask: 201,
				source: 'live',
				asOf: 1_784_800_000_000,
				change24hPercent: 1.25
			})
		).toEqual(
			expect.objectContaining({
				symbol: 'NASDAQ:NVDA',
				close: 200,
				changePercent: 1.25
			})
		);
	});
});
