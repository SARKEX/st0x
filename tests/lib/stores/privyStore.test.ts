import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Import after mocking
import {
	privySession,
	privyLoading,
	privyError,
	privyReady,
	privyTriggerLogin,
	privyTriggerLogout,
	privyTriggerExportWallet,
	privyTriggerSendTransaction,
	showAuthModal,
	showSendFundsModal,
	isPrivyAuthenticated,
	privyWalletAddress,
	loginWithPrivy,
	logoutPrivy,
	exportPrivyWallet,
	sendTransaction,
	openAuthModal,
	closeAuthModal,
	openSendFundsModal,
	closeSendFundsModal,
	resetPrivyState,
	type PrivySession
} from '$lib/stores/privyStore';

describe('privyStore', () => {
	beforeEach(() => {
		// Reset all stores before each test
		resetPrivyState();
		privyReady.set(false);
		showAuthModal.set(false);
		showSendFundsModal.set(false);
	});

	describe('initial state', () => {
		it('should start with null session', () => {
			expect(get(privySession)).toBeNull();
		});

		it('should start not authenticated', () => {
			expect(get(isPrivyAuthenticated)).toBe(false);
		});

		it('should start with null wallet address', () => {
			expect(get(privyWalletAddress)).toBeNull();
		});
	});

	describe('session management', () => {
		const mockSession: PrivySession = {
			userId: 'user-123',
			walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
			email: 'test@example.com'
		};

		it('should set session correctly', () => {
			privySession.set(mockSession);

			expect(get(privySession)).toEqual(mockSession);
			expect(get(isPrivyAuthenticated)).toBe(true);
			expect(get(privyWalletAddress)).toBe(mockSession.walletAddress);
		});

		it('should clear session on logout', () => {
			privySession.set(mockSession);
			privySession.set(null);

			expect(get(privySession)).toBeNull();
			expect(get(isPrivyAuthenticated)).toBe(false);
			expect(get(privyWalletAddress)).toBeNull();
		});
	});

	describe('trigger functions', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('loginWithPrivy should set loading and trigger login', async () => {
			loginWithPrivy();

			expect(get(privyLoading)).toBe(true);
			expect(get(privyTriggerLogin)).toBe(true);

			// Trigger should reset after timeout
			await vi.advanceTimersByTimeAsync(150);
			expect(get(privyTriggerLogin)).toBe(false);
		});

		it('logoutPrivy should set loading and trigger logout', async () => {
			logoutPrivy();

			expect(get(privyLoading)).toBe(true);
			expect(get(privyTriggerLogout)).toBe(true);

			await vi.advanceTimersByTimeAsync(150);
			expect(get(privyTriggerLogout)).toBe(false);
		});

		it('exportPrivyWallet should trigger export', async () => {
			exportPrivyWallet();

			expect(get(privyTriggerExportWallet)).toBe(true);

			await vi.advanceTimersByTimeAsync(150);
			expect(get(privyTriggerExportWallet)).toBe(false);
		});

		it('sendTransaction should set transaction params', async () => {
			const txParams = { to: '0xabcd', value: '0x1000', data: '0x' };
			sendTransaction(txParams.to, txParams.value, txParams.data);

			expect(get(privyTriggerSendTransaction)).toEqual(txParams);

			await vi.advanceTimersByTimeAsync(600);
			expect(get(privyTriggerSendTransaction)).toBeNull();
		});
	});

	describe('modal controls', () => {
		it('should open auth modal', () => {
			openAuthModal();
			expect(get(showAuthModal)).toBe(true);
		});

		it('should close auth modal', () => {
			showAuthModal.set(true);
			closeAuthModal();
			expect(get(showAuthModal)).toBe(false);
		});

		it('should open send funds modal', () => {
			openSendFundsModal();
			expect(get(showSendFundsModal)).toBe(true);
		});

		it('should close send funds modal', () => {
			showSendFundsModal.set(true);
			closeSendFundsModal();
			expect(get(showSendFundsModal)).toBe(false);
		});
	});

	describe('resetPrivyState', () => {
		it('should reset all state to initial values', () => {
			// Set some state
			privySession.set({
				userId: 'test',
				walletAddress: '0x123',
				email: 'test@test.com'
			});
			privyLoading.set(true);
			privyError.set('Some error');
			privyTriggerLogin.set(true);

			// Reset
			resetPrivyState();

			// Verify reset
			expect(get(privySession)).toBeNull();
			expect(get(privyLoading)).toBe(false);
			expect(get(privyError)).toBeNull();
			expect(get(privyTriggerLogin)).toBe(false);
		});
	});
});
