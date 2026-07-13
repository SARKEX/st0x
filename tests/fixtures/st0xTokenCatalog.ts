import type { CategorizedToken } from '../../src/lib/config/tokens';

const symbols = ['IAU', 'NVDA', 'AMZN', 'TSLA', 'MSTR', 'COIN', 'SPYM'];

export const TEST_ST0X_TOKENS: CategorizedToken[] = symbols.map((symbol, index) => ({
	chainId: 8453,
	address: `0x${String(index + 1).padStart(40, '0')}`,
	unwrappedAddress: `0x${String(index + 101).padStart(40, '0')}`,
	symbol: `wt${symbol}`,
	decimals: 18,
	name: `Wrapped ${symbol} ST0x`,
	logoUrl: `https://example.com/${symbol}.png`,
	priceFeedId: `0x${String(index + 1).padStart(64, '0')}`,
	category: 'ST0x',
	tradingViewSymbol: `NASDAQ:${symbol}`,
	tradingViewMarket: 'america'
}));
