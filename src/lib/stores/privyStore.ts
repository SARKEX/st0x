import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// Privy session data - populated by React SDK events
export interface PrivySession {
	userId: string;
	walletAddress: string;
	email?: string;
	socialProvider?: string;
	socialName?: string;
	// Smart wallet info
	smartWalletAddress?: string;
	eoaAddress?: string;
	walletType?: 'embedded' | 'smart' | 'eoa';
}

// Privy authentication state
export const privySession = writable<PrivySession | null>(null);
export const privyLoading = writable<boolean>(true); // Start true until SDK is ready
export const privyError = writable<string | null>(null);
export const privyReady = writable<boolean>(false);

// Action triggers - these are set by Svelte and read by React
export const privyTriggerLogin = writable<boolean>(false);
export const privyTriggerLogout = writable<boolean>(false);
export const privyTriggerExportWallet = writable<boolean>(false);
export const privyTriggerConnectWallet = writable<boolean>(false); // For EOA -> Smart wallet
export const privyTriggerFundWallet = writable<{ amount?: string } | null>(null); // For Coinbase onramp
export const privyTriggerSendTransaction = writable<{
	to: string;
	value: string;
	data?: string;
} | null>(null);

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
export const isPrivyAuthenticated = derived(privySession, ($session) => $session !== null);
export const privyWalletAddress = derived(
	privySession,
	($session) => $session?.walletAddress ?? null
);

/**
 * Trigger Privy login modal (Google-only)
 */
export function loginWithPrivy(): void {
	privyLoading.set(true);
	privyTriggerLogin.set(true);
	// Reset trigger after a tick to allow React to pick it up
	setTimeout(() => privyTriggerLogin.set(false), 100);
}

/**
 * Trigger Privy wallet connection (EOA -> Smart Account)
 * This allows users to connect MetaMask/Rabby and get a Privy smart account
 */
export function loginWithPrivyWallet(): void {
	privyLoading.set(true);
	privyTriggerConnectWallet.set(true);
	setTimeout(() => privyTriggerConnectWallet.set(false), 100);
}

/**
 * Trigger Privy logout
 */
export function logoutPrivy(): void {
	privyLoading.set(true);
	privyTriggerLogout.set(true);
	setTimeout(() => privyTriggerLogout.set(false), 100);
}

/**
 * Trigger private key export UI
 */
export function exportPrivyWallet(): void {
	privyTriggerExportWallet.set(true);
	setTimeout(() => privyTriggerExportWallet.set(false), 100);
}

/**
 * Trigger Coinbase onramp to buy crypto
 * @param amount Optional amount in ETH to pre-fill
 */
export function fundPrivyWallet(amount?: string): void {
	privyTriggerFundWallet.set({ amount });
	setTimeout(() => privyTriggerFundWallet.set(null), 100);
}

/**
 * Send a transaction from the embedded wallet
 */
export function sendTransaction(to: string, value: string, data?: string): void {
	privyTriggerSendTransaction.set({ to, value, data });
	// Clear after transaction is initiated
	setTimeout(() => privyTriggerSendTransaction.set(null), 500);
}

/**
 * Open the unified auth modal (shows both Privy and wallet options)
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
export function getPrivySession(): PrivySession | null {
	return get(privySession);
}

/**
 * Check if Privy is ready
 */
export function isPrivyReady(): boolean {
	return get(privyReady);
}

/**
 * Reset all Privy state (useful for testing)
 */
export function resetPrivyState(): void {
	privySession.set(null);
	privyLoading.set(false);
	privyError.set(null);
	privyTriggerLogin.set(false);
	privyTriggerLogout.set(false);
	privyTriggerExportWallet.set(false);
	privyTriggerConnectWallet.set(false);
	privyTriggerFundWallet.set(null);
	privyTriggerSendTransaction.set(null);
}
