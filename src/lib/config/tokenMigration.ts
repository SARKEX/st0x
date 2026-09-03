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
	// Active legacy→wrapped migration orders owned by 0x10e4db39275C3b128C01bA1194D45D19aE1520d9
	tNVDA: '0x400a1e7d871a47dbbe2e1427154cbb4a00ace1d2d6e29052d06bb85c4777fdc9',
	tAMZN: '0x0feb963e1d811c953310af3749461c8ca64779e3a16df6a2e602ecb3a202d750',
	tTSLA: '0x9f4026fd7d41ffe4eedc31bd93da18ab3d8126265b9e3ce88f28f96378a55b12',
	tMSTR: '0x237d7971ea17f3bc5dcb9efbed858ed29da9535652ea9ff5a8a1f790f3a23eea',
	tIAU: '0x36592e4b01266c9f203930e01ced4e56bec0822a863ba1752ec184043edb8ee6',
	tCOIN: '0x80a44175546d7794f964270fddc3e58f977bf0100ffb805eab0dee9fe08b063b',
	tSPYM: '0x9d98989eae42a9f1d961d235b39568b46e069d2e256fc69f0b1e2f92320405e4',
	tSIVR: '0xb52152950ec6a7d7c9a2235cd9b0d5f0d7b527938eb650d41451c690fe1509f6',
	tCRCL: '0x3f68b4599f4916022914db2328351581c74efc63ae7183ba9dd3aaef3e4864fd',
	tBMNR: '0x93cd0d0b1572a9c84481b94754d35183e7aa646136b508c50b7e77d52d2e92d7',
	tPPLT: '0x072fe37c0336f2a68581ac581d40fc195e5fbf95391ce94233609a7ff2b886c9'
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
