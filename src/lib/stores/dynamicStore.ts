import { writable, derived, get } from 'svelte/store';

// Dynamic session data - populated by React SDK events
export interface DynamicSession {
	userId: string;
	walletAddress: string;
	email?: string;
	socialProvider?: string;
	socialName?: string;
	// Wallet info
	walletType?: 'embedded' | 'external';
}

// Dynamic authentication state
export const dynamicSession = writable<DynamicSession | null>(null);
export const dynamicLoading = writable<boolean>(true); // Start true until SDK is ready
export const dynamicError = writable<string | null>(null);
export const dynamicReady = writable<boolean>(false);

// Action triggers - these are set by Svelte and read by React
export const dynamicTriggerLogin = writable<boolean>(false);
export const dynamicTriggerLogout = writable<boolean>(false);
export const dynamicTriggerExportWallet = writable<boolean>(false);
export const dynamicTriggerSendTransaction = writable<{
	to: string;
	value: string;
	data?: string;
} | null>(null);

// Token management
export const dynamicAccessToken = writable<string | null>(null);

// UI modal states
export const showAuthModal = writable<boolean>(false);
export const showSendFundsModal = writable<boolean>(false);
export const showDepositModal = writable<boolean>(false);

// Pre-selected token for send modal
export interface SendModalToken {
	symbol: string;
	address: string;
	decimals: number;
	balance: string; // formatted balance string
	balanceRaw: bigint; // raw balance for max calculation
}
export const sendModalToken = writable<SendModalToken | null>(null);

// Derived state
export const isDynamicAuthenticated = derived(dynamicSession, ($session) => $session !== null);
export const dynamicWalletAddress = derived(
	dynamicSession,
	($session) => $session?.walletAddress ?? null
);

/**
 * Trigger Dynamic login modal (Email or Social)
 */
export function loginWithDynamic(): void {
	dynamicLoading.set(true);
	dynamicTriggerLogin.set(true);
	// Reset trigger after a tick to allow React to pick it up
	setTimeout(() => dynamicTriggerLogin.set(false), 100);
	// Reset loading after 2s - Dynamic modal should appear by then
	// If user cancels Dynamic modal, this ensures the button is clickable again
	setTimeout(() => dynamicLoading.set(false), 2000);
}

/**
 * Trigger Dynamic logout
 */
export function logoutDynamic(): void {
	dynamicLoading.set(true);
	dynamicTriggerLogout.set(true);
	setTimeout(() => dynamicTriggerLogout.set(false), 100);
}

/**
 * Trigger private key export UI (if supported by Dynamic)
 */
export function exportDynamicWallet(): void {
	dynamicTriggerExportWallet.set(true);
	setTimeout(() => dynamicTriggerExportWallet.set(false), 100);
}

/**
 * Send a transaction from the embedded wallet
 */
export function sendTransaction(to: string, value: string, data?: string): void {
	dynamicTriggerSendTransaction.set({ to, value, data });
	// Clear after transaction is initiated
	setTimeout(() => dynamicTriggerSendTransaction.set(null), 500);
}

/**
 * Open the unified auth modal (shows both Dynamic and wallet options)
 */
export function openAuthModal(): void {
	showAuthModal.set(true);
}

/**
 * Close the auth modal
 */
export function closeAuthModal(): void {
	showAuthModal.set(false);
}

/**
 * Open the send funds modal, optionally with a pre-selected token
 */
export function openSendFundsModal(token?: SendModalToken): void {
	sendModalToken.set(token ?? null);
	showSendFundsModal.set(true);
}

/**
 * Close the send funds modal
 */
export function closeSendFundsModal(): void {
	showSendFundsModal.set(false);
	sendModalToken.set(null);
}

// Track which view to show when modal opens
export const depositModalInitialView = writable<'options' | 'buy' | 'deposit'>('options');

/**
 * Open the deposit modal
 */
export function openDepositModal(initialView: 'options' | 'buy' | 'deposit' = 'options'): void {
	depositModalInitialView.set(initialView);
	showDepositModal.set(true);
}

/**
 * Close the deposit modal
 */
export function closeDepositModal(): void {
	showDepositModal.set(false);
}

/**
 * Get current session synchronously
 */
export function getDynamicSession(): DynamicSession | null {
	return get(dynamicSession);
}

/**
 * Check if Dynamic is ready
 */
export function isDynamicReady(): boolean {
	return get(dynamicReady);
}

/**
 * Reset all Dynamic state (useful for testing)
 */
export function resetDynamicState(): void {
	dynamicSession.set(null);
	dynamicLoading.set(false);
	dynamicError.set(null);
	dynamicTriggerLogin.set(false);
	dynamicTriggerLogout.set(false);
	dynamicTriggerExportWallet.set(false);
	dynamicTriggerSendTransaction.set(null);
	dynamicAccessToken.set(null);
}
