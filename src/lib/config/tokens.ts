import { arbitrum, base } from '@wagmi/core/chains';
import type { PythToken } from '$lib/types';

// Payment tokens mapped by chain
export const PAYMENT_TOKENS_BY_NETWORK: Record<number, PythToken[]> = {
	8453: [
		{
			chainId: 8453,
			address: '0xe1d3ece2425f8f350b8d2b8cb179d5a36aee1c58',
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
	// {
	// 	chainId: base.id,
	// 	address: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
	// 	symbol: 'tNVDA',
	// 	decimals: 18,
	// 	name: 'NVIDIA Corporation ST0x',
	// 	logoUrl: '/images/NVDA.png',
	// 	priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:NVDA',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
	// 	symbol: 'tAMZN',
	// 	decimals: 18,
	// 	name: 'Amazon.com Inc ST0x',
	// 	logoUrl: '/images/AMZN.png',
	// 	priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:AMZN',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0x470b06815a2e286df8c38c9c73280e0760088623',
	// 	symbol: 'tTSLA',
	// 	decimals: 18,
	// 	name: 'Tesla Inc ST0x',
	// 	logoUrl: '/images/TSLA.png',
	// 	priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:TSLA',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
	// 	symbol: 'tMSTR',
	// 	decimals: 18,
	// 	name: 'MicroStrategy Incorporated ST0x',
	// 	logoUrl: '/images/MSTR.png',
	// 	priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:MSTR',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397',
	// 	symbol: 'tIAU',
	// 	decimals: 18,
	// 	name: 'iShares Gold Trust ST0x',
	// 	logoUrl: '/images/IAU.png',
	// 	priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:IAU',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0xb616f8b391d1adc118fd7e4063526d5530d49b10',
	// 	symbol: 'tCOIN',
	// 	decimals: 18,
	// 	name: 'Coinbase Global Inc ST0x',
	// 	logoUrl: '/images/COIN.png',
	// 	priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:COIN',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
	// 	symbol: 'tSPLG',
	// 	decimals: 18,
	// 	name: 'SPDR Portfolio S&P 500 ETF ST0x',
	// 	logoUrl: '/images/SPLG.png',
	// 	priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:SPLG',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	{
		chainId: base.id,
		address: '0xcf877a4f3ebec00c5b070cccb0a6a0583afbcd88',
		symbol: 'tSTOX',
		decimals: 18,
		name: 'SPDR Portfolio S&P 500 ETF ST0x',
		logoUrl: '/images/SPLG.png',
		priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SPLG',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	// {
	// 	chainId: base.id,
	// 	address: '0x826a85de1f7b70f4c7450c0f882a6db06000ed80',
	// 	symbol: 'tSIVR',
	// 	decimals: 18,
	// 	name: 'abrdn Physical Silver Shares ETF ST0x',
	// 	logoUrl: '/images/SIVR.png',
	// 	priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:SIVR',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0x43422a9d11a6640ef0d5f65292ef8adf87cf8522',
	// 	symbol: 'tCRCL',
	// 	decimals: 18,
	// 	name: 'Circle Internet Group Inc ST0x',
	// 	logoUrl: '/images/CRCL.png',
	// 	priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NYSE:CRCL',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0xf8fdfd6a686346d34b3143fc23072aa45c9e8386',
	// 	symbol: 'tBMNR',
	// 	decimals: 18,
	// 	name: 'Bitmine Immersion Technologies, Inc ST0x',
	// 	logoUrl: '/images/BMNR.png',
	// 	priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:BMNR',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	// {
	// 	chainId: base.id,
	// 	address: '0x6192539a2036c786aba3ca6a2222ff7a0f9c287e',
	// 	symbol: 'tPPLT',
	// 	decimals: 18,
	// 	name: 'abrdn Physical Platinum Shares ETF ST0x',
	// 	logoUrl: '/images/SIVR.png',
	// 	priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:PPLT',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// }
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
		address: '0xe1d3ece2425f8f350b8d2b8cb179d5a36aee1c58',
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
