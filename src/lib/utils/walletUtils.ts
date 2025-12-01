/**
 * Wallet utility functions for EIP-747 (wallet_watchAsset) and other wallet interactions
 */

export interface WatchAssetParams {
	address: string;
	symbol: string;
	decimals?: number;
	image?: string;
}

/**
 * Add a token to the user's wallet watchlist using EIP-747 (wallet_watchAsset)
 * This prompts the wallet to track the token so users can see their balance
 *
 * @param params - Token parameters
 * @returns Promise<boolean> - true if token is now tracked, false otherwise
 */
export async function addTokenToWallet(params: WatchAssetParams): Promise<boolean> {
	const { address, symbol, decimals = 18, image } = params;

	if (typeof window === 'undefined' || !window.ethereum) {
		console.warn('No wallet provider found');
		return false;
	}

	try {
		const wasAdded = await window.ethereum.request({
			method: 'wallet_watchAsset',
			params: {
				type: 'ERC20',
				options: {
					address,
					symbol,
					decimals,
					image
				}
			}
		});

		return Boolean(wasAdded);
	} catch (error) {
		console.error('Error adding token to wallet:', error);
		return false;
	}
}

// Extend Window interface for TypeScript
declare global {
	interface Window {
		ethereum?: {
			request: (args: { method: string; params?: unknown }) => Promise<unknown>;
		};
	}
}
