import { arbitrum, base } from '@wagmi/core/chains';
import type { PythToken } from '$lib/types';

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

export type TokenCategory = 'ST0x' | 'CRYPTO';

export interface LimitOrder {
	orderHash: string;
	type: 'Buy' | 'Sell';
}

export interface CategorizedToken extends PythToken {
	category: TokenCategory;
	logoUrl?: string;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
	limitOrders?: LimitOrder[];
	// Token address variants for ST0x tokens
	unwrappedAddress?: string; // Underlying ERC4626 asset (tNVDA)
	legacyAddress?: string; // Old token for migration (optional)
	legacySymbol?: string; // Old symbol if different (e.g., tSPLG -> wtSPYM)
	previousSymbols?: string[]; // Historical symbol names for blob storage lookups
	receiptAddress?: string;
	isin?: string;
	// Registry-provided fallback for tokens whose Pyth feed is unavailable.
	// Used by the snapshot pipeline when priceFeedId is empty.
	fallbackPrice?: number;
}

/**
 * Runtime ST0x token catalog hydrated from the REST API.
 *
 * The array identity is stable so existing consumers can keep references while
 * remote registry updates replace its contents in place.
 */
export const TOKENS: CategorizedToken[] = [];
export const TOKEN_SYMBOLS: string[] = [];
export const TOKEN_WRAPPED_ADDRESS_SET = new Set<string>();
export const PREVIOUS_SYMBOLS_BY_TOKEN = new Map<string, string[]>();

type TokenCatalogListener = (tokens: readonly CategorizedToken[]) => void;
const tokenCatalogListeners = new Set<TokenCatalogListener>();

export function replaceTokenCatalog(tokens: readonly CategorizedToken[]): void {
	TOKENS.splice(0, TOKENS.length, ...tokens);
	TOKEN_SYMBOLS.splice(0, TOKEN_SYMBOLS.length, ...tokens.map((token) => token.symbol));
	TOKEN_WRAPPED_ADDRESS_SET.clear();
	PREVIOUS_SYMBOLS_BY_TOKEN.clear();
	for (const token of tokens) {
		TOKEN_WRAPPED_ADDRESS_SET.add(token.address.toLowerCase());
		if (token.previousSymbols?.length) {
			PREVIOUS_SYMBOLS_BY_TOKEN.set(token.symbol, token.previousSymbols);
		}
	}
	rebuildTokenLookups();
	for (const listener of tokenCatalogListeners) listener(TOKENS);
}

export function onTokenCatalogChange(listener: TokenCatalogListener): () => void {
	tokenCatalogListeners.add(listener);
	listener(TOKENS);
	return () => tokenCatalogListeners.delete(listener);
}

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

const tokenByWrappedAddress = new Map<string, CategorizedToken>();
const tokenByUnwrappedAddress = new Map<string, CategorizedToken>();
const tokenByLegacyAddress = new Map<string, CategorizedToken>();

function rebuildTokenLookups(): void {
	tokenByWrappedAddress.clear();
	tokenByUnwrappedAddress.clear();
	tokenByLegacyAddress.clear();

	for (const token of TOKENS) {
		tokenByWrappedAddress.set(token.address.toLowerCase(), token);
		if (token.unwrappedAddress) {
			tokenByUnwrappedAddress.set(token.unwrappedAddress.toLowerCase(), token);
		}
		if (token.legacyAddress) {
			tokenByLegacyAddress.set(token.legacyAddress.toLowerCase(), token);
		}
	}
}

export function getTokenByWrappedAddress(address: string): CategorizedToken | null {
	return tokenByWrappedAddress.get(address.toLowerCase()) ?? null;
}

export function getTokenByUnwrappedAddress(address: string): CategorizedToken | null {
	return tokenByUnwrappedAddress.get(address.toLowerCase()) ?? null;
}

export function getTokenByLegacyAddress(address: string): CategorizedToken | null {
	return tokenByLegacyAddress.get(address.toLowerCase()) ?? null;
}

/**
 * Get a token by any of its addresses (wrapped, unwrapped, or legacy).
 * Useful for URL redirects and lookups where address type is unknown.
 */
export function getTokenByAnyAddress(address: string): CategorizedToken | null {
	const lowerAddress = address.toLowerCase();
	return (
		tokenByWrappedAddress.get(lowerAddress) ??
		tokenByUnwrappedAddress.get(lowerAddress) ??
		tokenByLegacyAddress.get(lowerAddress) ??
		null
	);
}

export function isWrappedTokenAddress(address: string): boolean {
	return tokenByWrappedAddress.has(address.toLowerCase());
}

export function isUnwrappedTokenAddress(address: string): boolean {
	return tokenByUnwrappedAddress.has(address.toLowerCase());
}

export function isLegacyTokenAddress(address: string): boolean {
	return tokenByLegacyAddress.has(address.toLowerCase());
}

export function getAllUnwrappedTokenAddresses(): string[] {
	return TOKENS.filter((t) => t.unwrappedAddress).map((t) => t.unwrappedAddress!);
}

export function getAllLegacyTokenAddresses(): string[] {
	return TOKENS.filter((t) => t.legacyAddress).map((t) => t.legacyAddress!);
}

/** Get all address variants (wrapped, unwrapped, legacy) for a single token, lowercased. */
export function getTokenAddressVariants(token: CategorizedToken): string[] {
	return [
		token.address,
		...(token.unwrappedAddress ? [token.unwrappedAddress] : []),
		...(token.legacyAddress ? [token.legacyAddress] : [])
	].map((a) => a.toLowerCase());
}

/** Get all token addresses across all tokens (wrapped + unwrapped + legacy), lowercased. */
export function getAllTokenAddressesFlat(): string[] {
	return TOKENS.flatMap((t) => getTokenAddressVariants(t));
}
