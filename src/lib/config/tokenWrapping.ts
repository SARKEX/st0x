/**
 * Token Wrapping Configuration (ERC4626)
 *
 * Each wrapped token IS an ERC4626 vault contract.
 * Maps vault addresses to their underlying asset tokens.
 *
 * Token Architecture:
 * Old/Legacy tStock --[Swap]--> Wrapped tStock (wt) <--[Wrap/Unwrap]--> Unwrapped tStock (t)
 *    (existing)              (ERC4626 vault)                      (underlying)
 *
 * NOTE: All address data is derived from the API-backed runtime token catalog.
 */

import {
	getTokenByWrappedAddress,
	getTokenByUnwrappedAddress,
	onTokenCatalogChange
} from './tokens';

export interface TokenWrappingMapping {
	/** The ERC4626 vault token (wrapped tStock) - this IS the vault contract */
	wrappedToken: {
		address: string;
		symbol: string;
		name: string;
		decimals: number;
	};
	/** The underlying asset token (unwrapped tStock) */
	unwrappedToken: {
		address: string;
		symbol: string;
		name: string;
		decimals: number;
	};
}

/**
 * Derive unwrapped symbol from wrapped symbol (wtNVDA -> tNVDA)
 */
function getUnwrappedSymbol(wrappedSymbol: string): string {
	if (wrappedSymbol.startsWith('wt')) {
		return 't' + wrappedSymbol.slice(2);
	}
	return wrappedSymbol;
}

/**
 * Derive unwrapped name from wrapped name (remove "Wrapped " prefix)
 */
function getUnwrappedName(wrappedName: string): string {
	if (wrappedName.startsWith('Wrapped ')) {
		return wrappedName.slice(8);
	}
	return wrappedName;
}

/**
 * Complete token wrapping mappings, rebuilt when the remote catalog changes.
 */
export const TOKEN_WRAPPING_MAPPINGS: TokenWrappingMapping[] = [];

/**
 * Underlying token addresses for each wrapped token (derived from TOKENS)
 * These are the underlying assets of the ERC4626 vaults
 */
export const UNDERLYING_TOKEN_ADDRESSES: Record<string, string> = {};

/**
 * Wrapped token addresses (ERC4626 vaults) - derived from TOKENS
 * These are the vault contracts that hold the underlying tokens
 */
export const WRAPPED_TOKEN_ADDRESSES: Record<string, string> = {};

// Create lookup maps for efficient access
const mappingByWrappedAddress = new Map(
	TOKEN_WRAPPING_MAPPINGS.map((m) => [m.wrappedToken.address.toLowerCase(), m])
);

const mappingByUnwrappedAddress = new Map(
	TOKEN_WRAPPING_MAPPINGS.map((m) => [m.unwrappedToken.address.toLowerCase(), m])
);

const unwrappedAddressSet = new Set(
	TOKEN_WRAPPING_MAPPINGS.map((m) => m.unwrappedToken.address.toLowerCase())
);

onTokenCatalogChange((tokens) => {
	const mappings: TokenWrappingMapping[] = tokens
		.filter((token) => token.unwrappedAddress && token.category === 'ST0x')
		.map((token) => ({
			wrappedToken: {
				address: token.address,
				symbol: token.symbol,
				name: token.name,
				decimals: token.decimals
			},
			unwrappedToken: {
				address: token.unwrappedAddress!,
				symbol: getUnwrappedSymbol(token.symbol),
				name: getUnwrappedName(token.name),
				decimals: token.decimals
			}
		}));

	TOKEN_WRAPPING_MAPPINGS.splice(0, TOKEN_WRAPPING_MAPPINGS.length, ...mappings);
	mappingByWrappedAddress.clear();
	mappingByUnwrappedAddress.clear();
	unwrappedAddressSet.clear();
	for (const mapping of mappings) {
		mappingByWrappedAddress.set(mapping.wrappedToken.address.toLowerCase(), mapping);
		mappingByUnwrappedAddress.set(mapping.unwrappedToken.address.toLowerCase(), mapping);
		unwrappedAddressSet.add(mapping.unwrappedToken.address.toLowerCase());
	}

	for (const key of Object.keys(UNDERLYING_TOKEN_ADDRESSES)) delete UNDERLYING_TOKEN_ADDRESSES[key];
	for (const key of Object.keys(WRAPPED_TOKEN_ADDRESSES)) delete WRAPPED_TOKEN_ADDRESSES[key];
	for (const token of tokens) {
		if (token.unwrappedAddress) {
			UNDERLYING_TOKEN_ADDRESSES[getUnwrappedSymbol(token.symbol)] = token.unwrappedAddress;
		}
		if (token.category === 'ST0x') WRAPPED_TOKEN_ADDRESSES[token.symbol] = token.address;
	}
});

/**
 * Get the wrapping mapping for a wrapped token by its address (vault address)
 */
export function getWrappingMappingByWrappedAddress(address: string): TokenWrappingMapping | null {
	return mappingByWrappedAddress.get(address.toLowerCase()) ?? null;
}

/**
 * Get the wrapping mapping for an unwrapped token by its address (underlying asset)
 */
export function getWrappingMappingByUnwrappedAddress(address: string): TokenWrappingMapping | null {
	return mappingByUnwrappedAddress.get(address.toLowerCase()) ?? null;
}

/**
 * Check if an address is an unwrapped (underlying) token
 */
export function isUnwrappedToken(address: string): boolean {
	return unwrappedAddressSet.has(address.toLowerCase());
}

/**
 * Get all unwrapped token addresses as an array
 */
export function getAllUnwrappedTokenAddresses(): string[] {
	return TOKEN_WRAPPING_MAPPINGS.map((m) => m.unwrappedToken.address);
}

/**
 * Get the vault (wrapped token) address for an underlying token
 */
export function getVaultAddressForUnderlying(underlyingAddress: string): string | null {
	const token = getTokenByUnwrappedAddress(underlyingAddress);
	return token?.address ?? null;
}

/**
 * Get the underlying token address for a vault (wrapped token)
 */
export function getUnderlyingAddressForVault(vaultAddress: string): string | null {
	const token = getTokenByWrappedAddress(vaultAddress);
	return token?.unwrappedAddress ?? null;
}
