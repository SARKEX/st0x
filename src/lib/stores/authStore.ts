import { derived, get } from 'svelte/store';
import { signerAddress, connected } from 'svelte-wagmi';
import { privySession, privyWalletAddress, isPrivyAuthenticated, showAuthModal } from './privyStore';
import { wrongNetwork } from './index';

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
export const isAuthenticated = derived(
	authMethod,
	($authMethod) => $authMethod !== 'none'
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
				const truncatedEoa = `${$privySession.eoaAddress.slice(0, 6)}...${$privySession.eoaAddress.slice(-4)}`;
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
