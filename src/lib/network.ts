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
	icon: string;
	subgraph_url: string;
	metadata_subgraph_url: string;
	orderbook_subgraph_url: string;
	usdcToken: PythToken;
}

// USDC tokens for different networks
export const USDC_TOKENS: { [chainId: number]: PythToken } = {
	42161: {
		chainId: 42161,
		address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
	} as unknown as PythToken,
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
		id: 42161,
		chainId: 42161,
		name: 'arbitrum-one',
		raindexNetworkSlug: 'arbitrum2',
		displayName: 'Arbitrum One',
		currencySymbol: 'ETH',
		blockExplorer: 'https://arbiscan.io',
		sftExplorer: 'https://stox.h20.market',
		blockExplorerIcon: 'arbitrum',
		rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
		icon: 'arbitrum',
		subgraph_url:
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-arbitrum-one/2025-07-06-135f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-arbitrum-one/2025-07-03-9be9/gn',
		usdcToken: USDC_TOKENS[42161]
	},
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
		icon: 'ethereum',
		subgraph_url:
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.3/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-07-03-f4dc/gn',
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
}

export const TOKENS: CategorizedToken[] = [
	// ST0x tokens

	{
		chainId: base.id,
		address: '0xabef041ebd0ad5d9c8a4e88b04f9a58c1cab93c0',
		symbol: 'TSLAs1',
		decimals: 18,
		name: 'STx Tesla 01',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
		category: 'ST0x'
	} as unknown as CategorizedToken,
	{
		chainId: arbitrum.id,
		address: '0xaca45fea0049823e809f0e789144c21d96230996',
		symbol: 'GOOGLs1',
		decimals: 18,
		name: 'STx Alphabet 01',
		logoUrl: '/images/GOOGL.png',
		priceFeedId: '0x5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6',
		category: 'ST0x'
	} as unknown as CategorizedToken,
	{
		chainId: arbitrum.id,
		address: '0x52946181fe3e3ab967a52f7294fa1cd39ae882e9',
		symbol: 'METAs1',
		decimals: 18,
		name: 'STx Meta 01',
		logoUrl: '/images/META.png',
		priceFeedId: '0x78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe',
		category: 'ST0x'
	} as unknown as CategorizedToken,
	{
		chainId: arbitrum.id,
		address: '0x20c40dd9e905482e6bc7c06de3383104746b7928',
		symbol: 'MSFTs1',
		decimals: 18,
		name: 'STx Microsoft 01',
		logoUrl: '/images/MSFT.png',
		priceFeedId: '0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1',
		category: 'ST0x'
	} as unknown as CategorizedToken,
	{
		chainId: arbitrum.id,
		address: '0x6696E32EbD293783bCb4b4f157Da02A65789e38e',
		symbol: 'TSLAs1',
		decimals: 18,
		name: 'STx Tesla 01',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
		category: 'ST0x'
	} as unknown as CategorizedToken,
	{
		chainId: arbitrum.id,
		address: '0x5191aF5069923b4AA2120f456ADbACF4d7Cf2a87',
		symbol: 'NVDAs1',
		decimals: 18,
		name: 'STx Nvidia 01',
		logoUrl: '/images/NVDA.png',
		priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
		category: 'ST0x'
	} as unknown as CategorizedToken,

	// ETF tokens (currently same as some ST0x tokens, but kept separate for future expansion)
	{
		chainId: arbitrum.id,
		address: '0x294afcc97cc03bd7e4dccf4addf2a1497d96d454',
		symbol: 'AAPLs1',
		decimals: 18,
		name: 'STx Apple 01',
		logoUrl: '/images/AAPL.png',
		priceFeedId: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
		category: 'ST0x'
	} as unknown as CategorizedToken,

	// ST0NX tokens (currently same as some ST0x tokens, but kept separate for future expansion)
	{
		chainId: arbitrum.id,
		address: '0x2e93b2c6cb3ac1b9993e784686c5637de28c2c2a',
		symbol: 'AMZNs1',
		decimals: 18,
		name: 'STx Amazon 01',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
		category: 'ST0x'
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
		category: 'CRYPTO'
	} as unknown as CategorizedToken,

	{
		chainId: arbitrum.id,
		address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
		symbol: 'WETH',
		decimals: 18,
		name: 'Wrapped Ether',
		logoUrl: '/images/ETH.svg',
		priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
		category: 'CRYPTO'
	} as unknown as CategorizedToken,

	{
		chainId: arbitrum.id,
		address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
		symbol: 'ARB',
		decimals: 18,
		name: 'Arbitrum (ARB)',
		logoUrl: '/images/ARB.svg',
		priceFeedId: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
		category: 'CRYPTO'
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
		category: 'CRYPTO'
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
		category: 'CRYPTO'
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
