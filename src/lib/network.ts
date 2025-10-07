import { arbitrum, base } from '@wagmi/core/chains';
import type { PythToken } from './types';

// Network interface
export interface Network {
	id: number;
	chainId: number;
	name: string;
	raindexNetworkSlug: string;
	displayName: string;
	currencySymbol: string;
	blockExplorer: string;
	sftExplorer: string;
	blockExplorerIcon: string;
	rpcUrl: string;
	fallbackRpcUrls: string[];
	icon: string;
	subgraph_url: string;
	metadata_subgraph_url: string;
	orderbook_subgraph_url: string;
	orderbook_subgraph_urls_inactive: string[];
	usdcToken: PythToken;
}

// USDC tokens for different networks
export const USDC_TOKENS: { [chainId: number]: PythToken } = {
	8453: {
		chainId: 8453,
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
	} as unknown as PythToken
};

// Networks configuration

export const networks: Network[] = [
	{
		id: 8453,
		chainId: 8453,
		name: 'base',
		raindexNetworkSlug: 'base2',
		displayName: 'Base Mainnet',
		currencySymbol: 'ETH',
		blockExplorer: 'https://basescan.org',
		sftExplorer: 'https://stox2.h20.market',
		blockExplorerIcon: 'etherscan',
		rpcUrl: 'https://base-rpc.publicnode.com',
		fallbackRpcUrls: [
			'https://base-rpc.publicnode.com',
			'https://mainnet.base.org',
			'https://base.llamarpc.com',
			'https://base.meowrpc.com',
			'https://base-mainnet.public.blastapi.io',
			'https://gateway.tenderly.co/public/base'
		],
		icon: 'ethereum',
		subgraph_url:
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.4/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-08-18-2744/gn',
		orderbook_subgraph_urls_inactive: [],
		usdcToken: USDC_TOKENS[8453]
	}
];

// Helper functions
export function getNetworkById(id: number): Network | undefined {
	return networks.find((network) => network.id === id);
}

export function getNetworkByChainId(chainId: number): Network | undefined {
	return networks.find((network) => network.chainId === chainId);
}

export function getNetworkByName(name: string): Network | undefined {
	return networks.find((network) => network.name === name);
}

// Helper function to get USDC token for a specific network
export function getUsdcTokenForNetwork(chainId: number): PythToken | undefined {
	return USDC_TOKENS[chainId];
}

// Define token categories
export type TokenCategory = 'ST0x' | 'ETFs' | 'ST0NX' | 'CRYPTO';

// Extended token interface with category
export interface CategorizedToken extends PythToken {
	category: TokenCategory;
	logoUrl?: string;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
}

export const TOKENS: CategorizedToken[] = [
	{
		chainId: base.id,
		address: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
		symbol: 'tNVDA',
		decimals: 18,
		name: 'NVIDIA Corporation ST0x',
		logoUrl: '/images/NVDA.png',
		priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:NVDA',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken,
	{
		chainId: base.id,
		address: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
		symbol: 'tAMZN',
		decimals: 18,
		name: 'Amazon.com Inc ST0x',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AMZN',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken,
	{
		chainId: base.id,
		address: '0x470b06815a2e286df8c38c9c73280e0760088623',
		symbol: 'tTSLA',
		decimals: 18,
		name: 'Tesla Inc ST0x',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:TSLA',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken,
	{
		chainId: base.id,
		address: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
		symbol: 'tMSTR',
		decimals: 18,
		name: 'MicroStrategy Incorporated ST0x',
		logoUrl: '/images/MSTR.png',
		priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:MSTR',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken,
	{
		chainId: base.id,
		address: '0x32f417da481b9d8d578ebeec54490886b9a1643a',
		symbol: 'tBRK.B',
		decimals: 18,
		name: 'Berkshire Hathaway Inc ST0x',
		logoUrl: '/images/BRK.B.png',
		priceFeedId: '0xe21c688b7fc65b4606a50f3635f466f6986db129bf16979875d160f9c508e8c7',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:BRK.B',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken,
	{
		chainId: base.id,
		address: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
		symbol: 'tSPLG',
		decimals: 18,
		name: 'SPDR Portfolio S&P 500 ETF ST0x',
		logoUrl: '/images/SPLG.png',
		priceFeedId: '0x4dfbf28d72ab41a878afcd4c6d5e9593dca7cf65a0da739cbad9b7414004f82d',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SPLG',
		tradingViewMarket: 'america'
	} as unknown as CategorizedToken
];

export const CRYPTO_TOKENS: CategorizedToken[] = [
	// CRYPTO tokens
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
	} as unknown as CategorizedToken,

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
	} as unknown as CategorizedToken,

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
	} as unknown as CategorizedToken,

	// USDC token
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
	} as unknown as CategorizedToken,

	// USDC token
	{
		chainId: base.id,
		address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
		category: 'CRYPTO',
		tradingViewSymbol: 'KRAKEN:USDCUSD',
		tradingViewMarket: 'crypto'
	} as unknown as CategorizedToken
];

// Helper functions to get tokens by category
export function getTokensByCategory(category: TokenCategory): CategorizedToken[] {
	return TOKENS.filter((token) => token.category === category);
}

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

// Legacy exports for backward compatibility
export const STOXs = getTokensByCategory('ST0x');
export const ETFs = getTokensByCategory('ETFs');
export const ST0NX = getTokensByCategory('ST0NX');
export const CRYPTO = getTokensByCategory('CRYPTO');
