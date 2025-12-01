// Configuration for snapshot generation

// Wallets that should be excluded from TVL calculations
// These could be team wallets, treasury, etc.
export const EXCLUDED_WALLETS: string[] = [
	// Add wallet addresses here (lowercase)
	// '0x1234567890abcdef1234567890abcdef12345678',
];

// Rain Orderbook contract address - holdings here are attributed to vault owners
export const ORDERBOOK_ADDRESS = '0x52ceb8ebef648744ffdde89f7bc9c3ac35944775';

// Aerodrome Slipstream (V3/CL) configuration
// NonfungiblePositionManager address for Aerodrome Slipstream on Base
// Set to empty string to disable Aerodrome tracking
export const AERODROME_POSITION_MANAGER = '0x827922686190790b37229fd06084350E74485b72';

// Addresses that should always be excluded (zero address, etc.)
export const SYSTEM_EXCLUDED_ADDRESSES = [
	'0x0000000000000000000000000000000000000000' // Zero address
];

// Helper to check if an address is excluded
export function isExcludedWallet(address: string): boolean {
	const normalized = address.toLowerCase();
	return (
		EXCLUDED_WALLETS.includes(normalized) ||
		SYSTEM_EXCLUDED_ADDRESSES.includes(normalized) ||
		normalized === ORDERBOOK_ADDRESS.toLowerCase()
	);
}
