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

import { onTokenCatalogChange } from './tokens';

export interface TokenWrappingMapping {
	chainId: number;
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

// Create lookup maps for efficient access
const mappingByWrappedAddress = new Map<string, TokenWrappingMapping[]>();
const mappingByUnwrappedAddress = new Map<string, TokenWrappingMapping[]>();

function addMapping(
	lookup: Map<string, TokenWrappingMapping[]>,
	address: string,
	mapping: TokenWrappingMapping
) {
	const key = address.toLowerCase();
	lookup.set(key, [...(lookup.get(key) ?? []), mapping]);
}

function resolveMapping(
	lookup: Map<string, TokenWrappingMapping[]>,
	address: string,
	chainId?: number
): TokenWrappingMapping | null {
	const matches = lookup.get(address.toLowerCase()) ?? [];
	if (chainId !== undefined) return matches.find((mapping) => mapping.chainId === chainId) ?? null;
	return matches.length === 1 ? matches[0] : null;
}

onTokenCatalogChange((tokens) => {
	const mappings: TokenWrappingMapping[] = tokens
		.filter((token) => token.unwrappedAddress && token.category === 'ST0x')
		.map((token) => ({
			chainId: token.chainId,
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
	for (const mapping of mappings) {
		addMapping(mappingByWrappedAddress, mapping.wrappedToken.address, mapping);
		addMapping(mappingByUnwrappedAddress, mapping.unwrappedToken.address, mapping);
	}
});

/**
 * Get the wrapping mapping for a wrapped token by its address (vault address)
 */
export function getWrappingMappingByWrappedAddress(
	address: string,
	chainId?: number
): TokenWrappingMapping | null {
	return resolveMapping(mappingByWrappedAddress, address, chainId);
}

/**
 * Get the wrapping mapping for an unwrapped token by its address (underlying asset)
 */
export function getWrappingMappingByUnwrappedAddress(
	address: string,
	chainId?: number
): TokenWrappingMapping | null {
	return resolveMapping(mappingByUnwrappedAddress, address, chainId);
}

/**
 * Get all unwrapped token addresses as an array
 */
export function getAllUnwrappedTokenAddresses(chainId?: number): string[] {
	return TOKEN_WRAPPING_MAPPINGS.filter(
		(mapping) => chainId === undefined || mapping.chainId === chainId
	).map((mapping) => mapping.unwrappedToken.address);
}
