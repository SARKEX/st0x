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
 * NOTE: All address data is derived from TOKENS in tokens.ts (single source of truth)
 */

import { TOKENS, getTokenByWrappedAddress, getTokenByUnwrappedAddress } from './tokens';

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
 * Complete token wrapping mappings - derived from TOKENS (single source of truth)
 */
export const TOKEN_WRAPPING_MAPPINGS: TokenWrappingMapping[] = TOKENS.filter(
	(t) => t.unwrappedAddress && t.category === 'ST0x'
).map((t) => ({
	wrappedToken: {
		address: t.address,
		symbol: t.symbol,
		name: t.name,
		decimals: t.decimals
	},
	unwrappedToken: {
		address: t.unwrappedAddress!,
		symbol: getUnwrappedSymbol(t.symbol),
		name: getUnwrappedName(t.name),
		decimals: t.decimals
	}
}));

/**
 * Underlying token addresses for each wrapped token (derived from TOKENS)
 * These are the underlying assets of the ERC4626 vaults
 */
export const UNDERLYING_TOKEN_ADDRESSES: Record<string, string> = Object.fromEntries(
	TOKENS.filter((t) => t.unwrappedAddress).map((t) => [getUnwrappedSymbol(t.symbol), t.unwrappedAddress!])
);

/**
 * Wrapped token addresses (ERC4626 vaults) - derived from TOKENS
 * These are the vault contracts that hold the underlying tokens
 */
export const WRAPPED_TOKEN_ADDRESSES: Record<string, string> = Object.fromEntries(
	TOKENS.filter((t) => t.category === 'ST0x').map((t) => [t.symbol, t.address])
);

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

/**
 * Get the wrapping mapping for a wrapped token by its address (vault address)
 */
export function getWrappingMappingByWrappedAddress(
	address: string
): TokenWrappingMapping | null {
	return mappingByWrappedAddress.get(address.toLowerCase()) ?? null;
}

/**
 * Get the wrapping mapping for an unwrapped token by its address (underlying asset)
 */
export function getWrappingMappingByUnwrappedAddress(
	address: string
): TokenWrappingMapping | null {
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
