import { writable, derived } from 'svelte/store';
import { signerAddress, connected } from 'svelte-wagmi';
import { browser } from '$app/environment';

// Access state
export const walletRegistered = writable<boolean | null>(null); // null = not checked yet
export const checkingAccess = writable<boolean>(false);
export const accessError = writable<string | null>(null);

// Derived store for access status
export const accessStatus = derived(
	[connected, signerAddress, walletRegistered, checkingAccess],
	([$connected, $signerAddress, $walletRegistered, $checkingAccess]) => {
		if (!$connected || !$signerAddress) {
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
export async function checkWalletAccess(address: string): Promise<boolean> {
	if (!browser) return false;

	checkingAccess.set(true);
	accessError.set(null);

	try {
		const res = await fetch(`/api/access/check?address=${encodeURIComponent(address)}`);
		const data = await res.json();

		if (res.ok) {
			walletRegistered.set(data.registered);
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
	return `Sign this message to verify wallet ownership and register with ST0X.

Wallet: ${address}
Access Code: ${code}
Timestamp: ${Date.now()}`;
}

// Register wallet with access code
export async function registerWallet(
	address: string,
	code: string,
	signature: string,
	message: string,
	captchaToken: string
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
				message,
				captchaToken
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
	signerAddress.subscribe((address) => {
		if (address && address !== currentAddress) {
			currentAddress = address;
			checkWalletAccess(address);
		} else if (!address && currentAddress) {
			currentAddress = null;
			resetAccessState();
		}
	});
}
