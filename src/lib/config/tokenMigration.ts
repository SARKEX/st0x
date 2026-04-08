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
	tNVDA: '0x532e6c196f6a62bd5d0009e5c181ddfae45627f6e9ba7a4a12889429200cf2b1',
	tAMZN: '0x92a69a73e7bde53b12ac9ce24db901e63a28b4bbf0775173607a6544a5ef8e3d',
	tTSLA: '0x44979edc793518ee5eb4fa99fc0c3925727b6fa0bbfe95b0da5eb35b2418e296',
	tMSTR: '0xe175179e8360cc080743323abe21f3538e470bece392680b4d5760b8b905a1d3',
	tIAU: '0x09b4d1030d0f7a85db4b52f986a0da6f96baa7c6bcbfee0dde319dd5dbac3e45',
	tCOIN: '0xbb7664414fe445233571e60c67b3134e11f6461a1ebc3ca5c8e5f13750426808',
	tSPYM: '0x9931d8317b2cfa45d535c8e41dc0333a241a7c629c56aee17a726aaae693f979',
	tSIVR: '0xcb0a36151518afb4386a7f69877a2abd45569f841124ba01e34a035f314fa5f6',
	tCRCL: '0x3119e4f1a3b2cd4d705b0e37b559ffc482ae8d5cf076161b3645b93bbf4e4f07',
	tBMNR: '0x1ed4f97dc95eae76fa7258412edf963093ad8669be29c07d5533e08dc3635e10',
	tPPLT: '0x1ee729666cdefeeaa6e1acdf5d6d96efb0d9db10721b7578c4e46ce01d2b7ac9'
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
