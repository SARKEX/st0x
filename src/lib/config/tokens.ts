import { arbitrum, base } from '@wagmi/core/chains';
import type { PythToken } from '$lib/types';

// Payment tokens mapped by chain
export const PAYMENT_TOKENS_BY_NETWORK: Record<number, PythToken[]> = {
	8453: [
		{
			chainId: 8453,
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			decimals: 6,
			name: 'USD Coin',
			logoUrl: '/images/USDC.png',
			priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
		} as PythToken
	]
};

export const DEFAULT_PAYMENT_TOKENS: Record<number, PythToken> = Object.fromEntries(
	Object.entries(PAYMENT_TOKENS_BY_NETWORK).map(([chainId, tokens]) => [
		Number(chainId),
		tokens[0] as PythToken
	])
);

export function getPaymentTokensForNetwork(chainId: number): PythToken[] {
	return PAYMENT_TOKENS_BY_NETWORK[chainId] ?? [];
}

export function getDefaultPaymentTokenForNetwork(chainId: number): PythToken | undefined {
	const [first] = getPaymentTokensForNetwork(chainId);
	return first;
}

// Token categories
export type TokenCategory = 'ST0x' | 'CRYPTO';

export interface LimitOrder {
	orderHash: string;
	type: 'Buy' | 'Sell';
}

// Extended token interface with category
export interface CategorizedToken extends PythToken {
	category: TokenCategory;
	logoUrl?: string;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
	limitOrders?: LimitOrder[];
}

export const TOKENS: CategorizedToken[] = [
	{
		chainId: base.id,
		address: '0x7271a3c91bb6070ed09333b84a815949d4f16d14',
		symbol: 'tNVDA',
		decimals: 18,
		name: 'NVIDIA Corporation ST0x',
		logoUrl: '/images/NVDA.png',
		priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:NVDA',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x466cb2e46fa1afc0ab5e22274b34d0391db18efd',
		symbol: 'tAMZN',
		decimals: 18,
		name: 'Amazon.com Inc ST0x',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AMZN',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x4e169cd2ab4f82640a8c65c68fed55863866fdb0',
		symbol: 'tTSLA',
		decimals: 18,
		name: 'Tesla Inc ST0x',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:TSLA',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x013b782f402d61aa1004cca95b9f5bb402c9d5fe',
		symbol: 'tMSTR',
		decimals: 18,
		name: 'MicroStrategy Incorporated ST0x',
		logoUrl: '/images/MSTR.png',
		priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:MSTR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x9a507314ea2a6c5686c0d07bfecb764dcf324dff',
		symbol: 'tIAU',
		decimals: 18,
		name: 'iShares Gold Trust ST0x',
		logoUrl: '/images/IAU.png',
		priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:IAU',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x626757e6f50675d17fcad312e82f989ae7a23d38',
		symbol: 'tCOIN',
		decimals: 18,
		name: 'Coinbase Global Inc ST0x',
		logoUrl: '/images/COIN.png',
		priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:COIN',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x8fdf41116f755771bfe0747d5f8c3711d5debfbb',
		symbol: 'tSPYM',
		decimals: 18,
		name: 'SPDR Portfolio S&P 500 ETF ST0x',
		logoUrl: '/images/SPLG.png',
		priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SPLG',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x58ce5024b89b4f73c27814c0f0abbea331c99be8',
		symbol: 'tSIVR',
		decimals: 18,
		name: 'abrdn Physical Silver Shares ETF ST0x',
		logoUrl: '/images/SIVR.png',
		priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SIVR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x38eb797892ed71da69bdc27a456a7c83ff813b52',
		symbol: 'tCRCL',
		decimals: 18,
		name: 'Circle Internet Group Inc ST0x',
		logoUrl: '/images/CRCL.png',
		priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:CRCL',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xfbde45df60249203b12148452fc77c3b5f811eb2',
		symbol: 'tBMNR',
		decimals: 18,
		name: 'Bitmine Immersion Technologies, Inc ST0x',
		logoUrl: '/images/BMNR.png',
		priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:BMNR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x1f17523b147ccc2a2328c0f014f6d49c479ea063',
		symbol: 'tPPLT',
		decimals: 18,
		name: 'abrdn Physical Platinum Shares ETF ST0x',
		logoUrl: '/images/SIVR.png',
		priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:PPLT',
		tradingViewMarket: 'america',
		limitOrders: []
	}
];

export const CRYPTO_TOKENS: CategorizedToken[] = [
	{
		chainId: arbitrum.id,
		address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		symbol: 'WBTC',
		decimals: 18,
		name: 'Wrapped BTC',
		logoUrl: '/images/BTC.svg',
		priceFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:BTCUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
		symbol: 'WETH',
		decimals: 18,
		name: 'Wrapped Ether',
		logoUrl: '/images/ETH.svg',
		priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:ETHUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
		symbol: 'ARB',
		decimals: 18,
		name: 'Arbitrum (ARB)',
		logoUrl: '/images/ARB.svg',
		priceFeedId: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:ARBUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
		category: 'CRYPTO',
		tradingViewSymbol: 'KRAKEN:USDCUSD',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: base.id,
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
		category: 'CRYPTO',
		tradingViewSymbol: 'KRAKEN:USDCUSD',
		tradingViewMarket: 'crypto'
	}
];

export function getAllTokens(): CategorizedToken[] {
	return TOKENS;
}

// Helper function to get tokens filtered by network chainId
export function getTokensByNetwork(chainId: number): CategorizedToken[] {
	return TOKENS.filter((token) => token.chainId === chainId);
}

export function getCryptoTokensByNetwork(chainId: number): CategorizedToken[] {
	return CRYPTO_TOKENS.filter((token) => token.chainId === chainId);
}

export function getAllTokensByNetwork(chainId: number): CategorizedToken[] {
	return [...getTokensByNetwork(chainId), ...getCryptoTokensByNetwork(chainId)];
}
