import { derived, get, type Readable } from 'svelte/store';
import { signerAddress, connected, chainId } from 'svelte-wagmi';
import {
	privySession,
	privyWalletAddress,
	isPrivyAuthenticated,
	showAuthModal
} from './privyStore';
import type { Network } from '$lib/config/network';

// Auth method enum
export type AuthMethod = 'wallet' | 'privy' | 'none';

/**
 * Derived store for the current authentication method
 */
export const authMethod = derived(
	[connected, signerAddress, isPrivyAuthenticated],
	([$connected, $signerAddress, $isPrivyAuthenticated]): AuthMethod => {
		// Privy takes precedence if authenticated
		if ($isPrivyAuthenticated) {
			return 'privy';
		}
		// Then check direct wallet connection
		if ($connected && $signerAddress) {
			return 'wallet';
		}
		return 'none';
	}
);

/**
 * Unified wallet address - works for both wallet and Privy auth
 */
export const walletAddress = derived(
	[authMethod, signerAddress, privyWalletAddress],
	([$authMethod, $signerAddress, $privyWalletAddress]): string | null => {
		switch ($authMethod) {
			case 'privy':
				return $privyWalletAddress;
			case 'wallet':
				return $signerAddress ?? null;
			default:
				return null;
		}
	}
);

/**
 * Is user authenticated (either method)
 */
export const isAuthenticated = derived(authMethod, ($authMethod) => $authMethod !== 'none');

/**
 * Check if user is on the wrong network (for wallet users)
 * Uses lazy import to avoid circular dependency initialization issues
 */
let _currentNetworkStore: Readable<Network> | null = null;

export const wrongNetwork = derived(
	[chainId, walletAddress],
	([$chainId, $walletAddress], set) => {
		// Access currentNetwork lazily to avoid initialization order issues
		// Import it when the store is subscribed to, not at module load time
		let unsubscribeNetwork: (() => void) | null = null;
		let isActive = true;
		
		// Helper to compute and set the value
		const updateValue = ($currentNetwork: Network) => {
			if (isActive) {
				set(!!($walletAddress && $chainId !== $currentNetwork.id));
			}
		};
		
		// Check if we already have the store (from a previous subscription)
		if (_currentNetworkStore) {
			const currentValue = get(_currentNetworkStore);
			updateValue(currentValue);
			
			// Subscribe to changes
			unsubscribeNetwork = _currentNetworkStore.subscribe(($currentNetwork) => {
				if (isActive) {
					updateValue($currentNetwork);
				}
			});
		} else {
			// Use dynamic import to break the circular dependency
			import('./index')
				.then((module) => {
					if (!isActive) return;
					const currentNetwork = module.currentNetwork;
					_currentNetworkStore = currentNetwork;
					
					// Get initial value and update
					const initialValue = get(currentNetwork);
					updateValue(initialValue);
					
					// Subscribe to currentNetwork changes
					unsubscribeNetwork = currentNetwork.subscribe(($currentNetwork) => {
						if (isActive) {
							updateValue($currentNetwork);
						}
					});
				})
				.catch((error) => {
					// If import fails, set to false (assume correct network)
					// This should only happen during initial load
					console.warn('Failed to load currentNetwork store:', error);
					if (isActive) {
						set(false);
					}
				});
		}
		
		return () => {
			isActive = false;
			if (unsubscribeNetwork) {
				unsubscribeNetwork();
			}
		};
	},
	false
);

/**
 * Is user fully ready to interact (authenticated + correct network for wallet users)
 */
export const isReady = derived(
	[authMethod, walletAddress, wrongNetwork],
	([$authMethod, $walletAddress, $wrongNetwork]): boolean => {
		if (!$walletAddress) return false;
		// Privy users don't need network check (we control their wallet)
		if ($authMethod === 'privy') return true;
		// Wallet users need correct network
		return !$wrongNetwork;
	}
);

/**
 * User display info
 */
export const userDisplayInfo = derived(
	[authMethod, walletAddress, privySession],
	([$authMethod, $walletAddress, $privySession]): {
		address: string | null;
		displayName: string;
		method: AuthMethod;
		email?: string;
		socialProvider?: string;
		// Smart wallet info
		walletType?: 'embedded' | 'smart' | 'eoa';
		smartWalletAddress?: string;
		eoaAddress?: string;
	} => {
		if (!$walletAddress) {
			return { address: null, displayName: 'Not connected', method: 'none' };
		}

		const truncatedAddress = `${$walletAddress.slice(0, 6)}...${$walletAddress.slice(-4)}`;

		if ($authMethod === 'privy' && $privySession) {
			// For Privy users, show email or social name if available
			let displayName = truncatedAddress;
			if ($privySession.email) {
				displayName = $privySession.email;
			} else if ($privySession.socialName) {
				displayName = $privySession.socialName;
			} else if ($privySession.walletType === 'smart' && $privySession.eoaAddress) {
				// For smart wallet users without email/social, show the EOA they connected with
				const truncatedEoa = `${$privySession.eoaAddress.slice(
					0,
					6
				)}...${$privySession.eoaAddress.slice(-4)}`;
				displayName = `Smart (${truncatedEoa})`;
			}

			return {
				address: $walletAddress,
				displayName,
				method: 'privy',
				email: $privySession.email,
				socialProvider: $privySession.socialProvider,
				walletType: $privySession.walletType,
				smartWalletAddress: $privySession.smartWalletAddress,
				eoaAddress: $privySession.eoaAddress
			};
		}

		return {
			address: $walletAddress,
			displayName: truncatedAddress,
			method: 'wallet'
		};
	}
);

/**
 * Prompt user to connect/login
 * Opens the unified auth modal
 */
export function promptAuth(): void {
	showAuthModal.set(true);
}

/**
 * Get current wallet address synchronously
 */
export function getCurrentWalletAddress(): string | null {
	return get(walletAddress);
}

/**
 * Get current auth method synchronously
 */
export function getCurrentAuthMethod(): AuthMethod {
	return get(authMethod);
}

/**
 * Check if user is authenticated synchronously
 */
export function checkIsAuthenticated(): boolean {
	return get(isAuthenticated);
}
