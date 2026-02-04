/**
 * Token Migration Configuration
 *
 * This file contains the mapping of old (legacy) tokens to their new wrapped equivalents.
 * The site now trades wrapped tStock tokens, so all tokens are named "Wrapped [tStock name]".
 */

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
 * Old token addresses (legacy tokens that need to be migrated)
 * These are the original tStock tokens before the wrapped migration
 */
export const OLD_TOKEN_ADDRESSES: Record<string, string> = {
	tNVDA: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
	tAMZN: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
	tTSLA: '0x470b06815a2e286df8c38c9c73280e0760088623',
	tMSTR: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
	tIAU: '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397',
	tCOIN: '0xb616f8b391d1adc118fd7e4063526d5530d49b10',
	tSPLG: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
	tSIVR: '0x826a85de1f7b70f4c7450c0f882a6db06000ed80',
	tCRCL: '0x43422a9d11a6640ef0d5f65292ef8adf87cf8522',
	tBMNR: '0xf8fdfd6a686346d34b3143fc23072aa45c9e8386',
	tPPLT: '0x6192539a2036c786aba3ca6a2222ff7a0f9c287e'
};

/**
 * New wrapped token addresses
 * These are the new wrapped tStock tokens that the site now trades
 */
export const WRAPPED_TOKEN_ADDRESSES: Record<string, string> = {
	tNVDA: '0x7271a3c91bb6070ed09333b84a815949d4f16d14',
	tAMZN: '0x466cb2e46fa1afc0ab5e22274b34d0391db18efd',
	tTSLA: '0x4e169cd2ab4f82640a8c65c68fed55863866fdb0',
	tMSTR: '0x013b782f402d61aa1004cca95b9f5bb402c9d5fe',
	tIAU: '0x9a507314ea2a6c5686c0d07bfecb764dcf324dff',
	tCOIN: '0x626757e6f50675d17fcad312e82f989ae7a23d38',
	tSPYM: '0x8fdf41116f755771bfe0747d5f8c3711d5debfbb',
	tSIVR: '0x58ce5024b89b4f73c27814c0f0abbea331c99be8',
	tCRCL: '0x38eb797892ed71da69bdc27a456a7c83ff813b52',
	tBMNR: '0xfbde45df60249203b12148452fc77c3b5f811eb2',
	tPPLT: '0x1f17523b147ccc2a2328c0f014f6d49c479ea063'
};

/**
 * Hardcoded swap order hashes for each token pair
 * These orders are specifically set up to handle the old -> new token migration
 */
export const SWAP_ORDER_HASHES: Record<string, string> = {
	tNVDA: '0x2222222222222222222222222222222222222222222222222222222222222001',
	tAMZN: '0x2222222222222222222222222222222222222222222222222222222222222002',
	tTSLA: '0x2222222222222222222222222222222222222222222222222222222222222003',
	tMSTR: '0x2222222222222222222222222222222222222222222222222222222222222004',
	tIAU: '0x2222222222222222222222222222222222222222222222222222222222222005',
	tCOIN: '0x2222222222222222222222222222222222222222222222222222222222222006',
	tSPLG: '0x2222222222222222222222222222222222222222222222222222222222222007',
	tSIVR: '0x2222222222222222222222222222222222222222222222222222222222222008',
	tCRCL: '0x2222222222222222222222222222222222222222222222222222222222222009',
	tBMNR: '0x222222222222222222222222222222222222222222222222222222222222200a',
	tPPLT: '0x222222222222222222222222222222222222222222222222222222222222200b'
};

/**
 * Complete token migration mappings
 */
export const TOKEN_MIGRATION_MAPPINGS: TokenMigrationMapping[] = [
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tNVDA,
			symbol: 'tNVDA',
			name: 'NVIDIA Corporation ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tNVDA,
			symbol: 'tNVDA',
			name: 'Wrapped NVIDIA Corporation ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tNVDA
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tAMZN,
			symbol: 'tAMZN',
			name: 'Amazon.com Inc ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tAMZN,
			symbol: 'tAMZN',
			name: 'Wrapped Amazon.com Inc ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tAMZN
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tTSLA,
			symbol: 'tTSLA',
			name: 'Tesla Inc ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tTSLA,
			symbol: 'tTSLA',
			name: 'Wrapped Tesla Inc ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tTSLA
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tMSTR,
			symbol: 'tMSTR',
			name: 'MicroStrategy Incorporated ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tMSTR,
			symbol: 'tMSTR',
			name: 'Wrapped MicroStrategy Incorporated ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tMSTR
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tIAU,
			symbol: 'tIAU',
			name: 'iShares Gold Trust ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tIAU,
			symbol: 'tIAU',
			name: 'Wrapped iShares Gold Trust ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tIAU
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tCOIN,
			symbol: 'tCOIN',
			name: 'Coinbase Global Inc ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tCOIN,
			symbol: 'tCOIN',
			name: 'Wrapped Coinbase Global Inc ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tCOIN
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tSPLG,
			symbol: 'tSPLG',
			name: 'SPDR Portfolio S&P 500 ETF ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tSPYM,
			symbol: 'tSPYM',
			name: 'Wrapped SPDR Portfolio S&P 500 ETF ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tSPLG
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tSIVR,
			symbol: 'tSIVR',
			name: 'abrdn Physical Silver Shares ETF ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tSIVR,
			symbol: 'tSIVR',
			name: 'Wrapped abrdn Physical Silver Shares ETF ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tSIVR
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tCRCL,
			symbol: 'tCRCL',
			name: 'Circle Internet Group Inc ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tCRCL,
			symbol: 'tCRCL',
			name: 'Wrapped Circle Internet Group Inc ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tCRCL
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tBMNR,
			symbol: 'tBMNR',
			name: 'Bitmine Immersion Technologies, Inc ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tBMNR,
			symbol: 'tBMNR',
			name: 'Wrapped Bitmine Immersion Technologies, Inc ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tBMNR
	},
	{
		oldToken: {
			address: OLD_TOKEN_ADDRESSES.tPPLT,
			symbol: 'tPPLT',
			name: 'abrdn Physical Platinum Shares ETF ST0x',
			decimals: 18
		},
		newToken: {
			address: WRAPPED_TOKEN_ADDRESSES.tPPLT,
			symbol: 'tPPLT',
			name: 'Wrapped abrdn Physical Platinum Shares ETF ST0x',
			decimals: 18
		},
		swapOrderHash: SWAP_ORDER_HASHES.tPPLT
	}
];

// Create lookup maps for efficient access
const oldTokenAddressSet = new Set(
	Object.values(OLD_TOKEN_ADDRESSES).map((addr) => addr.toLowerCase())
);

const mappingByOldAddress = new Map(
	TOKEN_MIGRATION_MAPPINGS.map((m) => [m.oldToken.address.toLowerCase(), m])
);

const mappingByOldSymbol = new Map(TOKEN_MIGRATION_MAPPINGS.map((m) => [m.oldToken.symbol, m]));

const newTokenAddressSet = new Set(
	Object.values(WRAPPED_TOKEN_ADDRESSES).map((addr) => addr.toLowerCase())
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
 * Get the migration mapping for an old token by its symbol
 */
export function getMigrationMappingBySymbol(oldSymbol: string): TokenMigrationMapping | null {
	return mappingByOldSymbol.get(oldSymbol) ?? null;
}

/**
 * Get the new wrapped token address for an old token
 */
export function getWrappedTokenAddress(oldAddress: string): string | null {
	const mapping = getMigrationMappingByAddress(oldAddress);
	return mapping?.newToken.address ?? null;
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
	return Object.values(OLD_TOKEN_ADDRESSES);
}

/**
 * Get all migration mappings
 */
export function getAllMigrationMappings(): TokenMigrationMapping[] {
	return TOKEN_MIGRATION_MAPPINGS;
}

/**
 * Given a token address, get the "base" equity symbol (e.g., tNVDA -> NVDA, wtNVDA -> NVDA)
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
 * Get old token symbol from wrapped symbol (tNVDA -> tNVDA)
 */
export function getOldSymbolFromWrapped(wrappedSymbol: string): string | null {
	return wrappedSymbol;
}

/**
 * Get wrapped symbol from old symbol (tNVDA -> tNVDA)
 */
export function getWrappedSymbolFromOld(oldSymbol: string): string | null {
	return oldSymbol;
}
