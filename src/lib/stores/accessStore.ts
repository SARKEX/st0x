import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { isAuthenticated, walletAddress } from './authStore';
import { fetchJson } from '$lib/utils/fetchJson';

// Access state
export const walletRegistered = writable<boolean | null>(null); // null = not checked yet
export const checkingAccess = writable<boolean>(false);
export const accessError = writable<string | null>(null);

// Modal states
export const showAccessCodeModal = writable<boolean>(false);
export const showWalletConnectionModal = writable<boolean>(false);

// Function to prompt wallet connection (shows modal if not connected)
export function promptWalletConnection() {
	showWalletConnectionModal.set(true);
}

// Function to prompt login/registration (shows access code modal)
export function promptLogin() {
	showAccessCodeModal.set(true);
}

// Derived store for access status
export const accessStatus = derived(
	[isAuthenticated, walletAddress, walletRegistered, checkingAccess],
	([$isAuthenticated, $walletAddress, $walletRegistered, $checkingAccess]) => {
		if (!$isAuthenticated || !$walletAddress) {
			return 'disconnected';
		}
		if ($checkingAccess) {
			return 'checking';
		}
		if ($walletRegistered === null) {
			return 'unknown';
		}
		return $walletRegistered ? 'registered' : 'unregistered';
	}
);

// Check if wallet is registered
// If showModalIfUnregistered is true (default), shows access code modal for unregistered wallets
export async function checkWalletAccess(
	address: string,
	showModalIfUnregistered: boolean = true
): Promise<boolean> {
	if (!browser) return false;

	checkingAccess.set(true);
	accessError.set(null);

	try {
		const response = await fetchJson<{ registered: boolean; error?: string }>(
			`/api/access/check?address=${encodeURIComponent(address)}`
		);

		if (response.ok && response.data) {
			walletRegistered.set(response.data.registered);

			// Show access code modal for unregistered wallets
			if (!response.data.registered && showModalIfUnregistered) {
				showAccessCodeModal.set(true);
			}

			return response.data.registered;
		} else {
			accessError.set(response.error || 'Failed to check access');
			return false;
		}
	} catch {
		accessError.set('Network error checking access');
		return false;
	} finally {
		checkingAccess.set(false);
	}
}

// Validate an access code (without registering)
export async function validateCode(code: string): Promise<{ valid: boolean; reason?: string }> {
	if (!browser) return { valid: false, reason: 'Not in browser' };

	try {
		const response = await fetchJson<{ valid: boolean; reason?: string; error?: string }>(
			'/api/access/validate',
			{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
			}
		);

		return {
			valid: Boolean(response.data?.valid),
			reason: response.data?.reason || response.error
		};
	} catch {
		return { valid: false, reason: 'Network error' };
	}
}

export async function requestAccessRegistrationChallenge(
	address: string,
	code: string
): Promise<{ success: boolean; nonce?: string; message?: string; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetchJson<{
			success?: boolean;
			nonce?: string;
			message?: string;
			error?: string;
		}>('/api/access/challenge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ address, code })
		});

		if (response.ok && response.data?.success && response.data.nonce && response.data.message) {
			return { success: true, nonce: response.data.nonce, message: response.data.message };
		}

		return {
			success: false,
			error: response.error || 'Failed to issue registration challenge'
		};
	} catch {
		return { success: false, error: 'Network error' };
	}
}

// Register wallet with access code (and optional referral code)
export async function registerWallet(
	address: string,
	code: string,
	signature: string,
	challengeNonce: string,
	referralCode?: string
): Promise<{ success: boolean; error?: string; referralLinked?: boolean }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const response = await fetchJson<{
			success?: boolean;
			error?: string;
			referralLinked?: boolean;
		}>('/api/access/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				address,
				code,
				signature,
				challengeNonce,
				referralCode: referralCode || undefined
			})
		});

		if (response.ok && response.data?.success) {
			walletRegistered.set(true);
			return { success: true, referralLinked: response.data.referralLinked };
		}

		return { success: false, error: response.error || 'Registration failed' };
	} catch {
		return { success: false, error: 'Network error' };
	}
}

// Reset access state (e.g., when wallet disconnects)
export function resetAccessState() {
	walletRegistered.set(null);
	checkingAccess.set(false);
	accessError.set(null);
}

// Subscribe to wallet changes and auto-check access
let currentAddress: string | null = null;

if (browser) {
	walletAddress.subscribe((address) => {
		if (address && address !== currentAddress) {
			currentAddress = address;
			// Check registration and show modal if not registered
			checkWalletAccess(address, true);
		} else if (!address && currentAddress) {
			currentAddress = null;
			resetAccessState();
		}
	});
}
