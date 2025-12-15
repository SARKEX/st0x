import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, writable } from 'svelte/store';

// Use vi.hoisted to create mock stores that can be used in vi.mock
const {
	mockSignerAddress,
	mockConnected,
	mockPrivySession,
	mockPrivyWalletAddress,
	mockIsPrivyAuthenticated,
	mockShowAuthModal,
	mockWrongNetwork
} = await vi.hoisted(async () => {
	const { writable } = await import('svelte/store');
	return {
		mockSignerAddress: writable<string | null>(null),
		mockConnected: writable<boolean>(false),
		mockPrivySession: writable<{ userId: string; walletAddress: string; email?: string } | null>(null),
		mockPrivyWalletAddress: writable<string | null>(null),
		mockIsPrivyAuthenticated: writable<boolean>(false),
		mockShowAuthModal: writable<boolean>(false),
		mockWrongNetwork: writable<boolean>(false)
	};
});

// Mock svelte-wagmi
vi.mock('svelte-wagmi', () => ({
	signerAddress: mockSignerAddress,
	connected: mockConnected
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock privy stores
vi.mock('$lib/stores/privyStore', () => ({
	privySession: mockPrivySession,
	privyWalletAddress: mockPrivyWalletAddress,
	isPrivyAuthenticated: mockIsPrivyAuthenticated,
	showAuthModal: mockShowAuthModal
}));

// Mock wrongNetwork
vi.mock('$lib/stores/index', () => ({
	wrongNetwork: mockWrongNetwork
}));

// Import after mocking
import {
	authMethod,
	walletAddress,
	isAuthenticated,
	isReady,
	userDisplayInfo,
	promptAuth,
	getCurrentWalletAddress,
	getCurrentAuthMethod,
	checkIsAuthenticated
} from '$lib/stores/authStore';

describe('authStore', () => {
	beforeEach(() => {
		// Reset all mock stores
		mockSignerAddress.set(null);
		mockConnected.set(false);
		mockPrivySession.set(null);
		mockPrivyWalletAddress.set(null);
		mockIsPrivyAuthenticated.set(false);
		mockWrongNetwork.set(false);
		mockShowAuthModal.set(false);
	});

	describe('authMethod', () => {
		it('should return "none" when not connected', () => {
			expect(get(authMethod)).toBe('none');
		});

		it('should return "privy" when Privy is authenticated', () => {
			mockIsPrivyAuthenticated.set(true);
			expect(get(authMethod)).toBe('privy');
		});

		it('should return "wallet" when wallet is connected', () => {
			mockConnected.set(true);
			mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			expect(get(authMethod)).toBe('wallet');
		});

		it('should prioritize Privy over wallet connection', () => {
			mockIsPrivyAuthenticated.set(true);
			mockConnected.set(true);
			mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			expect(get(authMethod)).toBe('privy');
		});
	});

	describe('walletAddress', () => {
		it('should return null when not authenticated', () => {
			expect(get(walletAddress)).toBeNull();
		});

		it('should return Privy wallet address when Privy authenticated', () => {
			const privyAddress = '0xprivyWallet1234567890abcdef12345678';
			mockIsPrivyAuthenticated.set(true);
			mockPrivyWalletAddress.set(privyAddress);
			expect(get(walletAddress)).toBe(privyAddress);
		});

		it('should return signer address when wallet connected', () => {
			const signerAddr = '0xsignerAddress1234567890abcdef12345678';
			mockConnected.set(true);
			mockSignerAddress.set(signerAddr);
			expect(get(walletAddress)).toBe(signerAddr);
		});
	});

	describe('isAuthenticated', () => {
		it('should be false when not connected', () => {
			expect(get(isAuthenticated)).toBe(false);
		});

		it('should be true when Privy authenticated', () => {
			mockIsPrivyAuthenticated.set(true);
			expect(get(isAuthenticated)).toBe(true);
		});

		it('should be true when wallet connected', () => {
			mockConnected.set(true);
			mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			expect(get(isAuthenticated)).toBe(true);
		});
	});

	describe('isReady', () => {
		it('should be false when no wallet address', () => {
			expect(get(isReady)).toBe(false);
		});

		it('should be true for Privy users (no network check needed)', () => {
			mockIsPrivyAuthenticated.set(true);
			mockPrivyWalletAddress.set('0xprivyWallet1234567890abcdef12345678');
			mockWrongNetwork.set(true); // Even with wrong network, Privy should be ready
			expect(get(isReady)).toBe(true);
		});

		it('should be true for wallet users on correct network', () => {
			mockConnected.set(true);
			mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			mockWrongNetwork.set(false);
			expect(get(isReady)).toBe(true);
		});

		it('should be false for wallet users on wrong network', () => {
			mockConnected.set(true);
			mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			mockWrongNetwork.set(true);
			expect(get(isReady)).toBe(false);
		});
	});

	describe('userDisplayInfo', () => {
		it('should return "Not connected" when no wallet', () => {
			const info = get(userDisplayInfo);
			expect(info.displayName).toBe('Not connected');
			expect(info.method).toBe('none');
			expect(info.address).toBeNull();
		});

		it('should show email for Privy users with email', () => {
			mockIsPrivyAuthenticated.set(true);
			mockPrivyWalletAddress.set('0x1234567890abcdef1234567890abcdef12345678');
			mockPrivySession.set({
				userId: 'user-123',
				walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
				email: 'test@example.com'
			});

			const info = get(userDisplayInfo);
			expect(info.displayName).toBe('test@example.com');
			expect(info.method).toBe('privy');
			expect(info.email).toBe('test@example.com');
		});

		it('should show truncated address for wallet users', () => {
			const addr = '0x1234567890abcdef1234567890abcdef12345678';
			mockConnected.set(true);
			mockSignerAddress.set(addr);

			const info = get(userDisplayInfo);
			expect(info.displayName).toBe('0x1234...5678');
			expect(info.method).toBe('wallet');
			expect(info.address).toBe(addr);
		});
	});

	describe('helper functions', () => {
		it('promptAuth should open auth modal', () => {
			promptAuth();
			expect(get(mockShowAuthModal)).toBe(true);
		});

		it('getCurrentWalletAddress should return current address', () => {
			const addr = '0x1234567890abcdef1234567890abcdef12345678';
			mockConnected.set(true);
			mockSignerAddress.set(addr);
			expect(getCurrentWalletAddress()).toBe(addr);
		});

		it('getCurrentAuthMethod should return current method', () => {
			mockIsPrivyAuthenticated.set(true);
			expect(getCurrentAuthMethod()).toBe('privy');
		});

		it('checkIsAuthenticated should return auth status', () => {
			expect(checkIsAuthenticated()).toBe(false);
			mockIsPrivyAuthenticated.set(true);
			expect(checkIsAuthenticated()).toBe(true);
		});
	});
});
