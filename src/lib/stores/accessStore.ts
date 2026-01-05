import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { isAuthenticated, walletAddress } from './authStore';

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
		const res = await fetch(`/api/access/check?address=${encodeURIComponent(address)}`);
		const data = await res.json();

		if (res.ok) {
			walletRegistered.set(data.registered);

			// Show access code modal for unregistered wallets
			if (!data.registered && showModalIfUnregistered) {
				showAccessCodeModal.set(true);
			}

			return data.registered;
		} else {
			accessError.set(data.error || 'Failed to check access');
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
		const res = await fetch('/api/access/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		const data = await res.json();
		return { valid: data.valid, reason: data.reason };
	} catch {
		return { valid: false, reason: 'Network error' };
	}
}

// Create the message for signing
export function createSignMessage(address: string, code: string): string {
	return `Sign to verify wallet ownership for st0x rewards.

Wallet: ${address}
Access Code: ${code}
Timestamp: ${Date.now()}`;
}

// Register wallet with access code
export async function registerWallet(
	address: string,
	code: string,
	signature: string,
	message: string
): Promise<{ success: boolean; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser' };

	try {
		const res = await fetch('/api/access/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				address,
				code,
				signature,
				message
			})
		});
		const data = await res.json();

		if (data.success) {
			walletRegistered.set(true);
			return { success: true };
		}

		return { success: false, error: data.error || 'Registration failed' };
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
