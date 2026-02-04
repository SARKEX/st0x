/**
 * Token Wrapping Configuration (ERC4626)
 *
 * Each wrapped token IS an ERC4626 vault contract.
 * Maps vault addresses to their underlying asset tokens.
 *
 * Token Architecture:
 * Old/Legacy tStock --[Swap]--> Wrapped tStock (wt) <--[Wrap/Unwrap]--> Unwrapped tStock (t)
 *    (existing)              (ERC4626 vault)                      (underlying)
 */

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
 * Underlying token addresses for each wrapped token
 * These are the underlying assets of the ERC4626 vaults
 */
export const UNDERLYING_TOKEN_ADDRESSES: Record<string, string> = {
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
	tPPLT: '0x1f17523b147ccc2a2328c0f014f6d49c479ea063',
	tRKLB: '0xf6744fd94e27c2f58f6110aa9fdc77a87e41766b'
};

/**
 * Wrapped token addresses (ERC4626 vaults)
 * These are the vault contracts that hold the underlying tokens
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
 * Complete token wrapping mappings
 */
export const TOKEN_WRAPPING_MAPPINGS: TokenWrappingMapping[] = [
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtNVDA,
			symbol: 'wtNVDA',
			name: 'Wrapped NVIDIA Corporation ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tNVDA,
			symbol: 'tNVDA',
			name: 'NVIDIA Corporation ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtAMZN,
			symbol: 'wtAMZN',
			name: 'Wrapped Amazon.com Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tAMZN,
			symbol: 'tAMZN',
			name: 'Amazon.com Inc ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtTSLA,
			symbol: 'wtTSLA',
			name: 'Wrapped Tesla Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tTSLA,
			symbol: 'tTSLA',
			name: 'Tesla Inc ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtMSTR,
			symbol: 'wtMSTR',
			name: 'Wrapped MicroStrategy Incorporated ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tMSTR,
			symbol: 'tMSTR',
			name: 'MicroStrategy Incorporated ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtIAU,
			symbol: 'wtIAU',
			name: 'Wrapped iShares Gold Trust ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tIAU,
			symbol: 'tIAU',
			name: 'iShares Gold Trust ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtCOIN,
			symbol: 'wtCOIN',
			name: 'Wrapped Coinbase Global Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tCOIN,
			symbol: 'tCOIN',
			name: 'Coinbase Global Inc ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtSPYM,
			symbol: 'wtSPYM',
			name: 'Wrapped SPDR Portfolio S&P 500 ETF ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tSPYM,
			symbol: 'tSPYM',
			name: 'SPDR Portfolio S&P 500 ETF ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtSIVR,
			symbol: 'wtSIVR',
			name: 'Wrapped abrdn Physical Silver Shares ETF ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tSIVR,
			symbol: 'tSIVR',
			name: 'abrdn Physical Silver Shares ETF ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtCRCL,
			symbol: 'wtCRCL',
			name: 'Wrapped Circle Internet Group Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tCRCL,
			symbol: 'tCRCL',
			name: 'Circle Internet Group Inc ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtBMNR,
			symbol: 'wtBMNR',
			name: 'Wrapped Bitmine Immersion Technologies, Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tBMNR,
			symbol: 'tBMNR',
			name: 'Bitmine Immersion Technologies, Inc ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtPPLT,
			symbol: 'wtPPLT',
			name: 'Wrapped abrdn Physical Platinum Shares ETF ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tPPLT,
			symbol: 'tPPLT',
			name: 'abrdn Physical Platinum Shares ETF ST0x',
			decimals: 18
		}
	},
	{
		wrappedToken: {
			address: WRAPPED_TOKEN_ADDRESSES.wtRKLB,
			symbol: 'wtRKLB',
			name: 'Wrapped Rocket Lab USA Inc ST0x',
			decimals: 18
		},
		unwrappedToken: {
			address: UNDERLYING_TOKEN_ADDRESSES.tRKLB,
			symbol: 'tRKLB',
			name: 'Rocket Lab USA Inc ST0x',
			decimals: 18
		}
	}
];

// Create lookup maps for efficient access
const mappingByWrappedAddress = new Map(
	TOKEN_WRAPPING_MAPPINGS.map((m) => [m.wrappedToken.address.toLowerCase(), m])
);

const mappingByUnwrappedAddress = new Map(
	TOKEN_WRAPPING_MAPPINGS.map((m) => [m.unwrappedToken.address.toLowerCase(), m])
);

const unwrappedAddressSet = new Set(
	Object.values(UNDERLYING_TOKEN_ADDRESSES).map((addr) => addr.toLowerCase())
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
	return Object.values(UNDERLYING_TOKEN_ADDRESSES);
}

/**
 * Get the vault (wrapped token) address for an underlying token
 */
export function getVaultAddressForUnderlying(underlyingAddress: string): string | null {
	const mapping = getWrappingMappingByUnwrappedAddress(underlyingAddress);
	return mapping?.wrappedToken.address ?? null;
}

/**
 * Get the underlying token address for a vault (wrapped token)
 */
export function getUnderlyingAddressForVault(vaultAddress: string): string | null {
	const mapping = getWrappingMappingByWrappedAddress(vaultAddress);
	return mapping?.unwrappedToken.address ?? null;
}
