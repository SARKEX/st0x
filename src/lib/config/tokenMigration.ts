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
	tNVDA: '0x99b120277ae746f29901248a00a990ce76b13cc625b75444cb1e2095ae4d8648',
	tAMZN: '0x4c164005f67658b92e4e55d3cb7bc94c36f1393928b0bc09616123a2d06aa2c6',
	tTSLA: '0x0151693acd169a63fba0671ccf2210458fc60dbfb60db8a6b2f470e36c7c6f8e',
	tMSTR: '0x6c55508a3d24cc6f902a35c54751262f891c7cd2ecfd75bb56c0ece503f06161',
	tIAU: '0x765a02ffd3405cfc166d27623cf98ba79cef59b23959e203c64d69e5f751daec',
	tCOIN: '0x5dd1b6de832633bebdc388d8d4c91396672ab50d3e5ff51aad207b56e6130cab',
	tSPLG: '0x38c50b0299491b0734fae38fa4af69a5e60ec565876a5572b6d7e13f8871f468',
	tSIVR: '0xc29c3e14aa8d6a79822c783959d410af127df4029b65c328ca1e28b358c02435',
	tCRCL: '0xf2308291dfd0089ad977666e18c6ad99f2b5618de174365c691be5bdb9a2c91d',
	tBMNR: '0xc21ac58aba7af81f245c62b4e5b9f93065b5be6e99edde350a1dca2eb24656ac',
	tPPLT: '0x4bb0499dd2234aa3e37be6add9b79c94db49cd5659da2f618e4d00788143dfea'
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

/**
 * Old token addresses (legacy tokens that need to be migrated) - derived from TOKENS
 * These are the original tStock tokens before the wrapped migration
 */
export const OLD_TOKEN_ADDRESSES: Record<string, string> = Object.fromEntries(
	TOKENS.filter((t) => t.legacyAddress).map((t) => [getLegacySymbol(t), t.legacyAddress!])
);

/**
 * New wrapped token addresses - derived from TOKENS
 * These are the new wrapped tStock tokens that the site now trades
 */
export const WRAPPED_TOKEN_ADDRESSES: Record<string, string> = Object.fromEntries(
	TOKENS.filter((t) => t.category === 'ST0x').map((t) => [t.symbol, t.address])
);

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

/**
 * Get old token symbol from wrapped symbol (wtNVDA -> tNVDA)
 */
export function getOldSymbolFromWrapped(wrappedSymbol: string): string | null {
	if (wrappedSymbol.startsWith('wt')) {
		return 't' + wrappedSymbol.slice(2);
	}
	return null;
}

/**
 * Get wrapped symbol from old symbol (tNVDA -> wtNVDA)
 */
export function getWrappedSymbolFromOld(oldSymbol: string): string | null {
	if (oldSymbol.startsWith('t')) {
		return 'w' + oldSymbol;
	}
	return null;
}
