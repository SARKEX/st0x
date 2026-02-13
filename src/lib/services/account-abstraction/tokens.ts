/**
 * Multi-Network Payment Token Configuration
 *
 * Defines supported payment tokens across all chains for account abstraction.
 * These tokens can be used to buy/sell tStocks with cross-chain swap support.
 */

import type { Address, Hex } from 'viem';
import type { PaymentToken, SupportedNetworkId } from './types';
import { SUPPORTED_NETWORKS } from './types';

// =============================================================================
// USDC Tokens (Native settlement token)
// =============================================================================

export const USDC_BASE: PaymentToken = {
	address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address,
	symbol: 'USDC',
	decimals: 6,
	name: 'USD Coin',
	chainId: SUPPORTED_NETWORKS.BASE,
	logoUrl: '/images/USDC.png',
	priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' as Hex
};

export const USDC_ARBITRUM: PaymentToken = {
	address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
	symbol: 'USDC',
	decimals: 6,
	name: 'USD Coin',
	chainId: SUPPORTED_NETWORKS.ARBITRUM,
	logoUrl: '/images/USDC.png',
	priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' as Hex
};

export const USDC_ETHEREUM: PaymentToken = {
	address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
	symbol: 'USDC',
	decimals: 6,
	name: 'USD Coin',
	chainId: SUPPORTED_NETWORKS.ETHEREUM,
	logoUrl: '/images/USDC.png',
	priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' as Hex
};

// =============================================================================
// USDT Tokens
// =============================================================================

export const USDT_BASE: PaymentToken = {
	address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
	symbol: 'USDT',
	decimals: 6,
	name: 'Tether USD',
	chainId: SUPPORTED_NETWORKS.BASE,
	logoUrl: '/images/USDT.png',
	priceFeedId: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' as Hex
};

export const USDT_ARBITRUM: PaymentToken = {
	address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
	symbol: 'USDT',
	decimals: 6,
	name: 'Tether USD',
	chainId: SUPPORTED_NETWORKS.ARBITRUM,
	logoUrl: '/images/USDT.png',
	priceFeedId: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' as Hex
};

export const USDT_ETHEREUM: PaymentToken = {
	address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
	symbol: 'USDT',
	decimals: 6,
	name: 'Tether USD',
	chainId: SUPPORTED_NETWORKS.ETHEREUM,
	logoUrl: '/images/USDT.png',
	priceFeedId: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' as Hex
};

// =============================================================================
// ETH/WETH Tokens
// =============================================================================

export const ETH_BASE: PaymentToken = {
	address: '0x0000000000000000000000000000000000000000' as Address, // Native ETH
	symbol: 'ETH',
	decimals: 18,
	name: 'Ethereum',
	chainId: SUPPORTED_NETWORKS.BASE,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex,
	isNative: true
};

export const WETH_BASE: PaymentToken = {
	address: '0x4200000000000000000000000000000000000006' as Address,
	symbol: 'WETH',
	decimals: 18,
	name: 'Wrapped Ether',
	chainId: SUPPORTED_NETWORKS.BASE,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex
};

export const ETH_ARBITRUM: PaymentToken = {
	address: '0x0000000000000000000000000000000000000000' as Address,
	symbol: 'ETH',
	decimals: 18,
	name: 'Ethereum',
	chainId: SUPPORTED_NETWORKS.ARBITRUM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex,
	isNative: true
};

export const WETH_ARBITRUM: PaymentToken = {
	address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as Address,
	symbol: 'WETH',
	decimals: 18,
	name: 'Wrapped Ether',
	chainId: SUPPORTED_NETWORKS.ARBITRUM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex
};

export const ETH_ETHEREUM: PaymentToken = {
	address: '0x0000000000000000000000000000000000000000' as Address,
	symbol: 'ETH',
	decimals: 18,
	name: 'Ethereum',
	chainId: SUPPORTED_NETWORKS.ETHEREUM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex,
	isNative: true
};

export const WETH_ETHEREUM: PaymentToken = {
	address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
	symbol: 'WETH',
	decimals: 18,
	name: 'Wrapped Ether',
	chainId: SUPPORTED_NETWORKS.ETHEREUM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex
};

export const USDC_OPTIMISM: PaymentToken = {
	address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
	symbol: 'USDC',
	decimals: 6,
	name: 'USD Coin',
	chainId: SUPPORTED_NETWORKS.OPTIMISM,
	logoUrl: '/images/USDC.png',
	priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' as Hex
};

export const USDT_OPTIMISM: PaymentToken = {
	address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' as Address,
	symbol: 'USDT',
	decimals: 6,
	name: 'Tether USD',
	chainId: SUPPORTED_NETWORKS.OPTIMISM,
	logoUrl: '/images/USDT.png',
	priceFeedId: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' as Hex
};

export const ETH_OPTIMISM: PaymentToken = {
	address: '0x0000000000000000000000000000000000000000' as Address,
	symbol: 'ETH',
	decimals: 18,
	name: 'Ethereum',
	chainId: SUPPORTED_NETWORKS.OPTIMISM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex,
	isNative: true
};

export const WETH_OPTIMISM: PaymentToken = {
	address: '0x4200000000000000000000000000000000000006' as Address,
	symbol: 'WETH',
	decimals: 18,
	name: 'Wrapped Ether',
	chainId: SUPPORTED_NETWORKS.OPTIMISM,
	logoUrl: '/images/ETH.svg',
	priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex
};

// =============================================================================
// Token Collections by Network
// =============================================================================

export const PAYMENT_TOKENS_MULTI_NETWORK: Record<SupportedNetworkId, PaymentToken[]> = {
	[SUPPORTED_NETWORKS.BASE]: [USDC_BASE, USDT_BASE, ETH_BASE, WETH_BASE],
	[SUPPORTED_NETWORKS.ARBITRUM]: [USDC_ARBITRUM, USDT_ARBITRUM, ETH_ARBITRUM, WETH_ARBITRUM],
	[SUPPORTED_NETWORKS.OPTIMISM]: [USDC_OPTIMISM, USDT_OPTIMISM, ETH_OPTIMISM, WETH_OPTIMISM],
	[SUPPORTED_NETWORKS.ETHEREUM]: [USDC_ETHEREUM, USDT_ETHEREUM, ETH_ETHEREUM, WETH_ETHEREUM],
	// Testnet tokens (for development)
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: [
		{
			...USDC_BASE,
			address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
			chainId: SUPPORTED_NETWORKS.BASE_SEPOLIA,
			name: 'USD Coin (Testnet)'
		}
	],
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: [
		{
			...USDC_ARBITRUM,
			address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address,
			chainId: SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA,
			name: 'USD Coin (Testnet)'
		}
	]
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all payment tokens for a specific network
 */
export function getPaymentTokensForNetwork(chainId: SupportedNetworkId): PaymentToken[] {
	return PAYMENT_TOKENS_MULTI_NETWORK[chainId] || [];
}

/**
 * Get the default payment token for a network (USDC)
 */
export function getDefaultPaymentToken(chainId: SupportedNetworkId): PaymentToken | undefined {
	const tokens = getPaymentTokensForNetwork(chainId);
	return tokens.find((t) => t.symbol === 'USDC');
}

/**
 * Get USDC contract address for a chain (single source of truth for Send funds, swaps, gas reserve checks).
 * Returns undefined if the chain has no USDC config.
 */
export function getUSDCAddressForChain(chainId: number): Address | undefined {
	return getDefaultPaymentToken(chainId as SupportedNetworkId)?.address;
}

/**
 * Get a specific token by symbol and network
 */
export function getPaymentToken(
	symbol: string,
	chainId: SupportedNetworkId
): PaymentToken | undefined {
	const tokens = getPaymentTokensForNetwork(chainId);
	return tokens.find((t) => t.symbol === symbol);
}

/**
 * Get all supported networks that have a specific token
 */
export function getNetworksForToken(symbol: string): SupportedNetworkId[] {
	return (Object.entries(PAYMENT_TOKENS_MULTI_NETWORK) as [string, PaymentToken[]][])
		.filter(([, tokens]) => tokens.some((t) => t.symbol === symbol))
		.map(([chainId]) => Number(chainId) as SupportedNetworkId);
}

/**
 * Get all unique token symbols across all networks
 */
export function getAllTokenSymbols(): string[] {
	const symbols = new Set<string>();
	Object.values(PAYMENT_TOKENS_MULTI_NETWORK).forEach((tokens) => {
		tokens.forEach((t) => symbols.add(t.symbol));
	});
	return Array.from(symbols);
}

/**
 * Check if a token requires wrapping (native ETH)
 */
export function requiresWrapping(token: PaymentToken): boolean {
	return token.isNative === true;
}

/**
 * Get the wrapped version of a native token
 */
export function getWrappedToken(nativeToken: PaymentToken): PaymentToken | undefined {
	if (!nativeToken.isNative) return undefined;

	const tokens = getPaymentTokensForNetwork(nativeToken.chainId);
	return tokens.find((t) => t.symbol === 'WETH' && !t.isNative);
}

/**
 * Network display names
 */
export const NETWORK_NAMES: Record<SupportedNetworkId, string> = {
	[SUPPORTED_NETWORKS.BASE]: 'Base',
	[SUPPORTED_NETWORKS.ARBITRUM]: 'Arbitrum One',
	[SUPPORTED_NETWORKS.OPTIMISM]: 'Optimism',
	[SUPPORTED_NETWORKS.ETHEREUM]: 'Ethereum',
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: 'Base Sepolia',
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia'
};

/**
 * Network chain icons
 */
export const NETWORK_ICONS: Record<SupportedNetworkId, string> = {
	[SUPPORTED_NETWORKS.BASE]: '/images/chains/base.svg',
	[SUPPORTED_NETWORKS.ARBITRUM]: '/images/chains/arbitrum.svg',
	[SUPPORTED_NETWORKS.OPTIMISM]: '/images/chains/optimism.svg',
	[SUPPORTED_NETWORKS.ETHEREUM]: '/images/chains/ethereum.svg',
	[SUPPORTED_NETWORKS.BASE_SEPOLIA]: '/images/chains/base.svg',
	[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: '/images/chains/arbitrum.svg'
};
