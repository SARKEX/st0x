/**
 * Token Migration Configuration
 *
 * This file contains the mapping of old (legacy) tokens to their new wrapped equivalents.
 * The site now trades wrapped tStock tokens (wt[ticker]), so all tokens are named "Wrapped [tStock name]".
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
	wtNVDA: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7',
	wtAMZN: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53',
	wtTSLA: '0x219A8d384a10BF19b9f24cB5cC53F79Dd0e5A03D',
	wtMSTR: '0xFF05E1bD696900dc6A52CA35Ca61Bb1024eDa8e2',
	wtIAU: '0x1E46d7eFef64A833AFB1CD49299a7AD5B439f4d8',
	wtCOIN: '0x5cDa0E1CA4ce2af96315f7F8963C85399c172204',
	wtSPYM: '0x31C2C14134e6E3B7ef9478297F199331133Fc2d8',
	wtSIVR: '0xEB7F3E4093C9d68253b6104FbbfF561F3eC0442F',
	wtCRCL: '0x8AFba81DEc38DE0A18E2Df5E1967a7493651eebf',
	wtBMNR: '0x2512EC661f0bA089c275EA105E31bAD6FcFcf319',
	wtPPLT: '0x82f5BAEE1076334357a34A19E04f7c282D51cE47',
	wtRKLB: '0xF4f8c66085910d583c01f3b4e44Bf731D4e2c565'
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
			address: WRAPPED_TOKEN_ADDRESSES.wtNVDA,
			symbol: 'wtNVDA',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtAMZN,
			symbol: 'wtAMZN',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtTSLA,
			symbol: 'wtTSLA',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtMSTR,
			symbol: 'wtMSTR',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtIAU,
			symbol: 'wtIAU',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtCOIN,
			symbol: 'wtCOIN',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtSPYM,
			symbol: 'wtSPYM',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtSIVR,
			symbol: 'wtSIVR',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtCRCL,
			symbol: 'wtCRCL',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtBMNR,
			symbol: 'wtBMNR',
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
			address: WRAPPED_TOKEN_ADDRESSES.wtPPLT,
			symbol: 'wtPPLT',
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
