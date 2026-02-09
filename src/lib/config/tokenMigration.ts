/**
 * Token Migration Configuration
 *
 * This file contains the mapping of old (legacy) tokens to their new wrapped equivalents.
 * The site now trades wrapped tStock tokens (wt[ticker]), so all tokens are named "Wrapped [tStock name]".
 *
 * NOTE: All address data is derived from TOKENS in tokens.ts (single source of truth)
 */

import { TOKENS, getTokenByLegacyAddress } from './tokens';

export interface TokenMigrationMapping {
	oldToken: {
		address: string;
		symbol: string;
		name: string;
		decimals: number;
	};
	newToken: {
		address: string;
		symbol: string;
		name: string;
		decimals: number;
	};
	// Hardcoded swap order hash for checking liquidity and price
	swapOrderHash: string;
}

/**
 * Hardcoded swap order hashes for each token pair
 * These orders are specifically set up to handle the old -> new token migration
 * Keyed by legacy symbol (e.g., tNVDA, tSPLG)
 */
export const SWAP_ORDER_HASHES: Record<string, string> = {
	tNVDA: '0xb2b3dfedb9982ae28a9092b03c41b082bbf9a89126efd87b09d461f6eaf943b4',
	tAMZN: '0x2347fd72fa0c2f41a4f32cd604d2663cce7617e96cbca7e5d59277cb53417a92',
	tTSLA: '0x01e9969772cbe2917637b22644477b0301d0a45d07e6a52ee35733e9c943ac89',
	tMSTR: '0xeb36ce22f5a79b60c0dc913a32da51e773c4b1cec109524c166a600cd157d0c5',
	tIAU: '0xfb4a2d84e07e909f2fe3736f546644266abe33d394273c7b3bde1528dd66cddc',
	tCOIN: '0x73aabaefbbf3be613203f4d39456b075fe3e0dfcd00223cde5e697b68232fab1',
	tSPYM: '0x0f6ec4b206388ffebb61a62f5585850835aad244654a0ec27a0d7aa700598bb8',
	tSIVR: '0x981473c0f7951005aad3ff76c23b32df2a640959e3de61b66baa4df114dd2bc8',
	tCRCL: '0xe87afb5ce1b55501937b51ca332d53ecc6b78cb24dd70ac5aef37af69507cdc3',
	tBMNR: '0x35c16833d5d331853900805c7c4b2f07e3cc779d6ab4518cb2b9c084901bc9e6',
	tPPLT: '0x66f7d520fa8fe99d154d4f40193d8c84c4f97aebd51d1c4f9c936150602b9e70'
	// tSTOX temporarily disabled
	// tSTOX: '0x9cb21c2dbdd39fbd45c863cead8bccd205014f57fbafafb2c93e519229a6ab48'
};

/**
 * Derive old/legacy symbol from token
 * Uses legacySymbol if explicitly set (e.g., tSPLG -> wtSPYM), otherwise derives from wrapped symbol
 */
function getLegacySymbol(token: (typeof TOKENS)[0]): string {
	if (token.legacySymbol) {
		return token.legacySymbol;
	}
	// Default: wtNVDA -> tNVDA
	if (token.symbol.startsWith('wt')) {
		return 't' + token.symbol.slice(2);
	}
	return token.symbol;
}

/**
 * Derive old/legacy name from wrapped name (remove "Wrapped " prefix)
 */
function getLegacyName(wrappedName: string): string {
	if (wrappedName.startsWith('Wrapped ')) {
		return wrappedName.slice(8);
	}
	return wrappedName;
}

/**
 * Complete token migration mappings - derived from TOKENS (single source of truth)
 */
export const TOKEN_MIGRATION_MAPPINGS: TokenMigrationMapping[] = TOKENS.filter(
	(t) => t.legacyAddress && t.category === 'ST0x'
).map((t) => {
	const legacySymbol = getLegacySymbol(t);
	return {
		oldToken: {
			address: t.legacyAddress!,
			symbol: legacySymbol,
			name: getLegacyName(t.name),
			decimals: t.decimals
		},
		newToken: {
			address: t.address,
			symbol: t.symbol,
			name: t.name,
			decimals: t.decimals
		},
		swapOrderHash: SWAP_ORDER_HASHES[legacySymbol] ?? ''
	};
});

// Create lookup maps for efficient access
const oldTokenAddressSet = new Set(
	TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.address.toLowerCase())
);

const mappingByOldAddress = new Map(
	TOKEN_MIGRATION_MAPPINGS.map((m) => [m.oldToken.address.toLowerCase(), m])
);

const mappingByOldSymbol = new Map(TOKEN_MIGRATION_MAPPINGS.map((m) => [m.oldToken.symbol, m]));

const newTokenAddressSet = new Set(
	TOKEN_MIGRATION_MAPPINGS.map((m) => m.newToken.address.toLowerCase())
);

const mappingByNewAddress = new Map(
	TOKEN_MIGRATION_MAPPINGS.map((m) => [m.newToken.address.toLowerCase(), m])
);

/**
 * Check if an address is an old (legacy) token that needs migration
 */
export function isOldToken(address: string): boolean {
	return oldTokenAddressSet.has(address.toLowerCase());
}

/**
 * Check if an address is a new wrapped token
 */
export function isWrappedToken(address: string): boolean {
	return newTokenAddressSet.has(address.toLowerCase());
}

/**
 * Get the migration mapping for an old token by its address
 */
export function getMigrationMappingByAddress(oldAddress: string): TokenMigrationMapping | null {
	return mappingByOldAddress.get(oldAddress.toLowerCase()) ?? null;
}

/**
 * Get the migration mapping by new (wrapped) token address
 */
export function getMigrationMappingByNewAddress(newAddress: string): TokenMigrationMapping | null {
	return mappingByNewAddress.get(newAddress.toLowerCase()) ?? null;
}

/**
 * Get the migration mapping for an old token by its symbol
 */
export function getMigrationMappingBySymbol(oldSymbol: string): TokenMigrationMapping | null {
	return mappingByOldSymbol.get(oldSymbol) ?? null;
}

/**
 * Get the new wrapped token address for an old token
 */
export function getWrappedTokenAddress(oldAddress: string): string | null {
	const token = getTokenByLegacyAddress(oldAddress);
	return token?.address ?? null;
}

/**
 * Get the swap order hash for migrating an old token
 */
export function getSwapOrderHash(oldAddress: string): string | null {
	const mapping = getMigrationMappingByAddress(oldAddress);
	return mapping?.swapOrderHash ?? null;
}

/**
 * Get all old token addresses as an array
 */
export function getAllOldTokenAddresses(): string[] {
	return TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.address);
}

/**
 * Get all migration mappings
 */
export function getAllMigrationMappings(): TokenMigrationMapping[] {
	return TOKEN_MIGRATION_MAPPINGS;
}

/**
 * Given a token symbol, get the "base" equity symbol (e.g., tNVDA -> NVDA, wtNVDA -> NVDA)
 * This is useful for aggregating old and new token holdings
 */
export function getBaseEquitySymbol(symbol: string): string {
	// Remove 'wt' or 't' prefix to get base equity symbol
	if (symbol.startsWith('wt')) {
		return symbol.slice(2);
	}
	if (symbol.startsWith('t')) {
		return symbol.slice(1);
	}
	return symbol;
}
