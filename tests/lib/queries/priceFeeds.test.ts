import { describe, expect, it } from 'vitest';
import type { TradingViewQuote } from '$lib/api/tradingview';
import { replaceQuoteBySymbol } from '$lib/queries/priceFeeds';
import { tokensWithPriceSource } from '$lib/queries/oracleQuotes';
import { networks } from '$lib/config/network';

function quote(symbol: string, close: number): TradingViewQuote {
	return {
		symbol,
		close,
		open: null,
		high: null,
		low: null,
		volume: null,
		change: null,
		changeAbs: null,
		changePercent: null,
		week52High: null,
		week52Low: null,
		marketCap: null,
		prevClose: null
	};
}

describe('price feed sources', () => {
	it('includes Pyth and fallback-backed Base tokens', () => {
		const base = networks.find((network) => network.chainId === 8453) ?? null;
		const symbols = tokensWithPriceSource(base).map((token) => token.symbol);

		expect(symbols).toEqual(
			expect.arrayContaining(['wtCEG', 'wtTSM', 'wtASML', 'wtDRAM', 'wtSKHY', 'wtSPCX'])
		);
	});

	it('uses the refreshed configured fallback prices', () => {
		const base = networks.find((network) => network.chainId === 8453) ?? null;
		const fallbackPrices = Object.fromEntries(
			tokensWithPriceSource(base)
				.filter((token) => ['wtDRAM', 'wtSKHY', 'wtSPCX'].includes(token.symbol))
				.map((token) => [token.symbol, token.fallbackPrice])
		);

		expect(fallbackPrices).toEqual({ wtDRAM: 63.04, wtSKHY: 149, wtSPCX: 145.3 });
	});

	it('replaces the SPYM fallback with the live monitor quote', () => {
		const quotes = replaceQuoteBySymbol(
			[quote('NASDAQ:NVDA', 200), quote('AMEX:SPYM', 82.5)],
			quote('AMEX:SPYM', 88.6)
		);

		expect(quotes).toEqual([quote('NASDAQ:NVDA', 200), quote('AMEX:SPYM', 88.6)]);
	});

	it('keeps the fallback when the live monitor quote is unavailable', () => {
		const quotes = [quote('AMEX:SPYM', 82.5)];

		expect(replaceQuoteBySymbol(quotes, null)).toBe(quotes);
	});
});
