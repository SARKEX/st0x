import type { Token } from '$lib/types';

export type TokenCategory = 'ST0x' | 'CRYPTO';

export interface LimitOrder {
	orderHash: string;
	type: 'Buy' | 'Sell';
}

export interface TokenNetworkMetadata {
	key?: string;
	chainId: number;
	label?: string;
	networkId?: number;
	currency?: string;
}

export interface CategorizedToken extends Token {
	category: TokenCategory;
	network?: TokenNetworkMetadata;
	logoUrl?: string;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
	limitOrders?: LimitOrder[];
	unwrappedAddress?: string;
	legacyAddress?: string;
	legacySymbol?: string;
	previousSymbols?: string[];
	receiptAddress?: string;
	isin?: string;
	priceFeedId?: string;
	fallbackPrice?: number;
	paymentToken?: boolean;
	migrationOrderHash?: string;
}

/**
 * Runtime token catalog hydrated from the REST API.
 *
 * These collections keep stable identities because several long-lived stores
 * retain references to them. Registry refreshes replace their contents in
 * place instead of requiring a website release for every token or network.
 */
export const TOKENS: CategorizedToken[] = [];
export const CRYPTO_TOKENS: CategorizedToken[] = [];
export const TOKEN_SYMBOLS: string[] = [];
export const TOKEN_WRAPPED_ADDRESS_SET = new Set<string>();
export const PREVIOUS_SYMBOLS_BY_TOKEN = new Map<string, string[]>();
export const PAYMENT_TOKENS_BY_NETWORK: Record<number, CategorizedToken[]> = {};
export const DEFAULT_PAYMENT_TOKENS: Record<number, CategorizedToken> = {};

type TokenCatalogListener = (tokens: readonly CategorizedToken[]) => void;
const tokenCatalogListeners = new Set<TokenCatalogListener>();

const tokenByWrappedAddress = new Map<string, CategorizedToken[]>();
const tokenByUnwrappedAddress = new Map<string, CategorizedToken[]>();
const tokenByLegacyAddress = new Map<string, CategorizedToken[]>();

function replaceRecord<T>(target: Record<number, T>, values: Record<number, T>): void {
	for (const key of Object.keys(target)) delete target[Number(key)];
	Object.assign(target, values);
}

function addAddressLookup(
	lookup: Map<string, CategorizedToken[]>,
	address: string | undefined,
	token: CategorizedToken
): void {
	if (!address) return;
	const key = address.toLowerCase();
	lookup.set(key, [...(lookup.get(key) ?? []), token]);
}

function rebuildTokenLookups(): void {
	tokenByWrappedAddress.clear();
	tokenByUnwrappedAddress.clear();
	tokenByLegacyAddress.clear();
	for (const token of TOKENS) {
		addAddressLookup(tokenByWrappedAddress, token.address, token);
		addAddressLookup(tokenByUnwrappedAddress, token.unwrappedAddress, token);
		addAddressLookup(tokenByLegacyAddress, token.legacyAddress, token);
	}
}

function resolveAddressLookup(
	lookup: Map<string, CategorizedToken[]>,
	address: string,
	chainId?: number
): CategorizedToken | null {
	const matches = lookup.get(address.toLowerCase()) ?? [];
	if (chainId !== undefined) {
		return matches.find((token) => token.chainId === chainId) ?? null;
	}
	return matches.length === 1 ? matches[0] : null;
}

function rebuildPaymentTokens(): void {
	const byNetwork: Record<number, CategorizedToken[]> = {};
	for (const token of CRYPTO_TOKENS) {
		(byNetwork[token.chainId] ??= []).push(token);
	}
	replaceRecord(PAYMENT_TOKENS_BY_NETWORK, byNetwork);

	const defaults: Record<number, CategorizedToken> = {};
	for (const [chainIdText, tokens] of Object.entries(byNetwork)) {
		const selected =
			tokens.find((token) => token.paymentToken) ??
			tokens.find((token) => token.symbol.toUpperCase() === 'USDC') ??
			tokens[0];
		if (selected) defaults[Number(chainIdText)] = selected;
	}
	replaceRecord(DEFAULT_PAYMENT_TOKENS, defaults);
}

export function replaceTokenCatalog(tokens: readonly CategorizedToken[]): void {
	const assets = tokens.filter((token) => token.category === 'ST0x');
	const crypto = tokens.filter((token) => token.category === 'CRYPTO');
	TOKENS.splice(0, TOKENS.length, ...assets);
	CRYPTO_TOKENS.splice(0, CRYPTO_TOKENS.length, ...crypto);

	TOKEN_SYMBOLS.splice(0, TOKEN_SYMBOLS.length, ...new Set(assets.map((token) => token.symbol)));
	TOKEN_WRAPPED_ADDRESS_SET.clear();
	PREVIOUS_SYMBOLS_BY_TOKEN.clear();
	for (const token of assets) {
		TOKEN_WRAPPED_ADDRESS_SET.add(token.address.toLowerCase());
		if (token.previousSymbols?.length) {
			PREVIOUS_SYMBOLS_BY_TOKEN.set(token.symbol, token.previousSymbols);
		}
	}

	rebuildTokenLookups();
	rebuildPaymentTokens();
	for (const listener of tokenCatalogListeners) listener(TOKENS);
}

export function onTokenCatalogChange(listener: TokenCatalogListener): () => void {
	tokenCatalogListeners.add(listener);
	listener(TOKENS);
	return () => tokenCatalogListeners.delete(listener);
}

export function getPaymentTokensForNetwork(chainId: number): CategorizedToken[] {
	return PAYMENT_TOKENS_BY_NETWORK[chainId] ?? [];
}

export function getDefaultPaymentTokenForNetwork(chainId: number): CategorizedToken | undefined {
	return DEFAULT_PAYMENT_TOKENS[chainId];
}

export function getAllTokens(): CategorizedToken[] {
	return TOKENS;
}

export function getTokensByNetwork(chainId: number): CategorizedToken[] {
	return TOKENS.filter((token) => token.chainId === chainId);
}

export function getCryptoTokensByNetwork(chainId: number): CategorizedToken[] {
	return CRYPTO_TOKENS.filter((token) => token.chainId === chainId);
}

export function getAllTokensByNetwork(chainId: number): CategorizedToken[] {
	return [...getTokensByNetwork(chainId), ...getCryptoTokensByNetwork(chainId)];
}

export function getTokenByWrappedAddress(
	address: string,
	chainId?: number
): CategorizedToken | null {
	return resolveAddressLookup(tokenByWrappedAddress, address, chainId);
}

export function getTokenByUnwrappedAddress(
	address: string,
	chainId?: number
): CategorizedToken | null {
	return resolveAddressLookup(tokenByUnwrappedAddress, address, chainId);
}

export function getTokenByLegacyAddress(
	address: string,
	chainId?: number
): CategorizedToken | null {
	return resolveAddressLookup(tokenByLegacyAddress, address, chainId);
}

export function getTokenByAnyAddress(address: string, chainId?: number): CategorizedToken | null {
	return (
		getTokenByWrappedAddress(address, chainId) ??
		getTokenByUnwrappedAddress(address, chainId) ??
		getTokenByLegacyAddress(address, chainId)
	);
}

export function isWrappedTokenAddress(address: string, chainId?: number): boolean {
	return getTokenByWrappedAddress(address, chainId) !== null;
}

export function isUnwrappedTokenAddress(address: string, chainId?: number): boolean {
	return getTokenByUnwrappedAddress(address, chainId) !== null;
}

export function isLegacyTokenAddress(address: string, chainId?: number): boolean {
	return getTokenByLegacyAddress(address, chainId) !== null;
}

export function getAllUnwrappedTokenAddresses(chainId?: number): string[] {
	return TOKENS.filter(
		(token) => token.unwrappedAddress && (chainId === undefined || token.chainId === chainId)
	).map((token) => token.unwrappedAddress!);
}

export function getAllLegacyTokenAddresses(chainId?: number): string[] {
	return TOKENS.filter(
		(token) => token.legacyAddress && (chainId === undefined || token.chainId === chainId)
	).map((token) => token.legacyAddress!);
}

export function getTokenAddressVariants(token: CategorizedToken): string[] {
	return [
		token.address,
		...(token.unwrappedAddress ? [token.unwrappedAddress] : []),
		...(token.legacyAddress ? [token.legacyAddress] : [])
	].map((address) => address.toLowerCase());
}

export function getAllTokenAddressesFlat(chainId?: number): string[] {
	return TOKENS.filter((token) => chainId === undefined || token.chainId === chainId).flatMap(
		(token) => getTokenAddressVariants(token)
	);
}
