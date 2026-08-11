/**
 * Token Migration Configuration
 *
 * This file contains the mapping of old (legacy) tokens to their new wrapped equivalents.
 * The site now trades wrapped tStock tokens (wt[ticker]), so all tokens are named "Wrapped [tStock name]".
 *
 * NOTE: All address data is derived from the API-backed runtime token catalog.
 */

import { getTokenByLegacyAddress, onTokenCatalogChange, type CategorizedToken } from './tokens';

export interface TokenMigrationMapping {
	chainId: number;
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
	// Registry-provided migration order hash for checking liquidity and price.
	swapOrderHash: string;
}

/**
 * Derive old/legacy symbol from token
 * Uses legacySymbol if explicitly set (e.g., tSPLG -> wtSPYM), otherwise derives from wrapped symbol
 */
function getLegacySymbol(token: CategorizedToken): string {
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
 * Complete token migration mappings, rebuilt when the remote catalog changes.
 */
export const TOKEN_MIGRATION_MAPPINGS: TokenMigrationMapping[] = [];

// Create lookup maps for efficient access
const mappingByOldAddress = new Map<string, TokenMigrationMapping[]>();
const mappingByOldSymbol = new Map<string, TokenMigrationMapping[]>();
const mappingByNewAddress = new Map<string, TokenMigrationMapping[]>();

function addMapping(
	lookup: Map<string, TokenMigrationMapping[]>,
	key: string,
	mapping: TokenMigrationMapping
) {
	lookup.set(key, [...(lookup.get(key) ?? []), mapping]);
}

function resolveMapping(
	lookup: Map<string, TokenMigrationMapping[]>,
	key: string,
	chainId?: number
): TokenMigrationMapping | null {
	const matches = lookup.get(key) ?? [];
	if (chainId !== undefined) return matches.find((mapping) => mapping.chainId === chainId) ?? null;
	return matches.length === 1 ? matches[0] : null;
}

onTokenCatalogChange((tokens) => {
	const mappings = tokens
		.filter((token) => token.legacyAddress && token.migrationOrderHash && token.category === 'ST0x')
		.map((token) => {
			const legacySymbol = getLegacySymbol(token);
			return {
				chainId: token.chainId,
				oldToken: {
					address: token.legacyAddress!,
					symbol: legacySymbol,
					name: getLegacyName(token.name),
					decimals: token.decimals
				},
				newToken: {
					address: token.address,
					symbol: token.symbol,
					name: token.name,
					decimals: token.decimals
				},
				swapOrderHash: token.migrationOrderHash!
			};
		});

	TOKEN_MIGRATION_MAPPINGS.splice(0, TOKEN_MIGRATION_MAPPINGS.length, ...mappings);
	mappingByOldAddress.clear();
	mappingByOldSymbol.clear();
	mappingByNewAddress.clear();
	for (const mapping of mappings) {
		const oldAddress = mapping.oldToken.address.toLowerCase();
		const newAddress = mapping.newToken.address.toLowerCase();
		addMapping(mappingByOldAddress, oldAddress, mapping);
		addMapping(mappingByOldSymbol, mapping.oldToken.symbol, mapping);
		addMapping(mappingByNewAddress, newAddress, mapping);
	}
});

/**
 * Check if an address is an old (legacy) token that needs migration
 */
export function isOldToken(address: string, chainId?: number): boolean {
	return getMigrationMappingByAddress(address, chainId) !== null;
}

/**
 * Check if an address is a new wrapped token
 */
export function isWrappedToken(address: string, chainId?: number): boolean {
	return getMigrationMappingByNewAddress(address, chainId) !== null;
}

/**
 * Get the migration mapping for an old token by its address
 */
export function getMigrationMappingByAddress(
	oldAddress: string,
	chainId?: number
): TokenMigrationMapping | null {
	return resolveMapping(mappingByOldAddress, oldAddress.toLowerCase(), chainId);
}

/**
 * Get the migration mapping by new (wrapped) token address
 */
export function getMigrationMappingByNewAddress(
	newAddress: string,
	chainId?: number
): TokenMigrationMapping | null {
	return resolveMapping(mappingByNewAddress, newAddress.toLowerCase(), chainId);
}

/**
 * Get the migration mapping for an old token by its symbol
 */
export function getMigrationMappingBySymbol(
	oldSymbol: string,
	chainId?: number
): TokenMigrationMapping | null {
	return resolveMapping(mappingByOldSymbol, oldSymbol, chainId);
}

/**
 * Get the new wrapped token address for an old token
 */
export function getWrappedTokenAddress(oldAddress: string, chainId?: number): string | null {
	const token = getTokenByLegacyAddress(oldAddress, chainId);
	return token?.address ?? null;
}

/**
 * Get the swap order hash for migrating an old token
 */
export function getSwapOrderHash(oldAddress: string, chainId?: number): string | null {
	const mapping = getMigrationMappingByAddress(oldAddress, chainId);
	return mapping?.swapOrderHash ?? null;
}

/**
 * Get all old token addresses as an array
 */
export function getAllOldTokenAddresses(chainId?: number): string[] {
	return TOKEN_MIGRATION_MAPPINGS.filter(
		(mapping) => chainId === undefined || mapping.chainId === chainId
	).map((mapping) => mapping.oldToken.address);
}

/**
 * Get all migration mappings
 */
export function getAllMigrationMappings(chainId?: number): TokenMigrationMapping[] {
	return TOKEN_MIGRATION_MAPPINGS.filter(
		(mapping) => chainId === undefined || mapping.chainId === chainId
	);
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
