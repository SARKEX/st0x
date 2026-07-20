import { writable } from 'svelte/store';

// Wallet connection modal state
export const showWalletConnectionModal = writable<boolean>(false);

// Function to prompt wallet connection (shows modal if not connected)
export function promptWalletConnection() {
	showWalletConnectionModal.set(true);
}
