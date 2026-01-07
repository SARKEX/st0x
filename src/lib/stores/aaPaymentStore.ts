/**
 * Account Abstraction Payment Store
 *
 * Manages cross-chain payment token selection and swap execution for all order types.
 * Integrates Rhinestone SDK for cross-chain swaps to USDC on Base before order execution.
 */

import { writable, derived, get } from 'svelte/store';
import type { Address, Hex } from 'viem';
import {
	type PaymentToken,
	type CrossChainSwapQuote,
	SETTLEMENT_CHAIN_ID,
	getAAOrchestrator,
	isRhinestoneConfigured,
	getBalanceChecker,
	USDC_BASE
} from '$lib/services/account-abstraction';
import { getDynamicAccountForRhinestone, isDynamicWalletReady } from '$lib/services/account-abstraction/wallets/dynamic';
import { walletAddress } from '$lib/stores/authStore';

// Quote refresh interval (45 seconds - quotes expire at 60s)
const QUOTE_REFRESH_INTERVAL_MS = 45000;

// =============================================================================
// Types
// =============================================================================

export type AAPaymentStatus = 'idle' | 'checking' | 'swapping' | 'swap_complete' | 'error';

export interface AAPaymentState {
	// Selected source token (what user wants to pay with - for Buy orders)
	sourceToken: PaymentToken | null;

	// Selected destination token (what user wants to receive - for Sell orders)
	destinationToken: PaymentToken | null;

	// Status of the swap operation
	status: AAPaymentStatus;

	// Error message if swap failed
	error: string | null;

	// Result of successful pre-trade swap
	swapResult: {
		txHash: Hex;
		intentId: string;
		usdcAmount: bigint;
	} | null;

	// Pending post-trade swap (set when Sell order is initiated)
	pendingPostTradeSwap: {
		destinationToken: PaymentToken;
		expectedUsdcAmount: bigint;
	} | null;

	// Whether AA features are available
	isAAEnabled: boolean;

	// Cached quote for the current token/amount
	cachedQuote: CrossChainSwapQuote | null;

	// Amount the quote was fetched for
	quoteAmount: bigint | null;

	// Balance check result
	balanceCheck: {
		hasEnough: boolean;
		balance: bigint;
		shortfall: bigint;
	} | null;
}

const initialState: AAPaymentState = {
	sourceToken: null,
	destinationToken: null,
	status: 'idle',
	error: null,
	swapResult: null,
	pendingPostTradeSwap: null,
	isAAEnabled: isRhinestoneConfigured(),
	cachedQuote: null,
	quoteAmount: null,
	balanceCheck: null
};

// Quote refresh timer
let quoteRefreshTimer: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Store
// =============================================================================

function createAAPaymentStore() {
	const { subscribe, set, update } = writable<AAPaymentState>(initialState);

	return {
		subscribe,

		/**
		 * Set the source token the user wants to pay with
		 */
		setSourceToken: (token: PaymentToken | null) => {
			update((state) => ({
				...state,
				sourceToken: token,
				status: 'idle',
				error: null,
				swapResult: null
			}));
		},

		/**
		 * Set the destination token the user wants to receive (for Sell orders)
		 */
		setDestinationToken: (token: PaymentToken | null) => {
			update((state) => ({
				...state,
				destinationToken: token,
				pendingPostTradeSwap: null
			}));
		},

		/**
		 * Reset to default (USDC on Base for both source and destination)
		 */
		resetToDefault: () => {
			set({
				...initialState,
				sourceToken: USDC_BASE,
				destinationToken: USDC_BASE
			});
		},

		/**
		 * Check if a swap is needed for the selected token
		 */
		needsSwap: (): boolean => {
			const state = get({ subscribe });
			if (!state.sourceToken) return false;

			// No swap needed if already USDC on Base
			return !(
				state.sourceToken.chainId === SETTLEMENT_CHAIN_ID && state.sourceToken.symbol === 'USDC'
			);
		},

		/**
		 * Execute swap to get USDC on Base
		 * Call this before order execution if needsSwap() returns true
		 *
		 * @param amount - Amount of source token to swap
		 * @returns USDC amount received on Base, or null if swap failed/not needed
		 */
		executeSwapIfNeeded: async (amount: bigint): Promise<bigint | null> => {
			const state = get({ subscribe });
			const $walletAddress = get(walletAddress);

			// If no source token selected or already USDC on Base, return amount as-is
			if (!state.sourceToken) {
				return amount;
			}

			const isAlreadyUSDCOnBase =
				state.sourceToken.chainId === SETTLEMENT_CHAIN_ID && state.sourceToken.symbol === 'USDC';

			if (isAlreadyUSDCOnBase) {
				update((s) => ({ ...s, status: 'idle', swapResult: null }));
				return amount;
			}

			// Need to swap - check prerequisites
			if (!state.isAAEnabled) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Cross-chain swaps require Rhinestone configuration'
				}));
				return null;
			}

			if (!$walletAddress) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Wallet not connected'
				}));
				return null;
			}

			// Get wallet account for Rhinestone
			const walletAccount = await getDynamicAccountForRhinestone();
			if (!walletAccount) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Unable to get wallet account for cross-chain swap'
				}));
				return null;
			}

			// Execute the swap
			update((s) => ({ ...s, status: 'swapping', error: null }));

			try {
				const orchestrator = getAAOrchestrator();
				const result = await orchestrator.executePreTradeSwap(
					state.sourceToken,
					amount,
					$walletAddress as Address,
					walletAccount
				);

				if (!result.success) {
					update((s) => ({
						...s,
						status: 'error',
						error: result.error || 'Swap failed'
					}));
					return null;
				}

				update((s) => ({
					...s,
					status: 'swap_complete',
					swapResult: {
						txHash: result.txHash || ('0x' as Hex),
						intentId: result.intentId || '',
						usdcAmount: result.usdcAmount
					}
				}));

				return result.usdcAmount;
			} catch (error) {
				update((s) => ({
					...s,
					status: 'error',
					error: error instanceof Error ? error.message : 'Unknown swap error'
				}));
				return null;
			}
		},

		/**
		 * Check if user has sufficient balance for the swap
		 */
		checkBalance: async (amount: bigint) => {
			const state = get({ subscribe });
			const $walletAddress = get(walletAddress);

			if (!state.sourceToken || !$walletAddress) {
				update((s) => ({ ...s, balanceCheck: null }));
				return null;
			}

			const balanceChecker = getBalanceChecker();
			const result = await balanceChecker.checkSufficientBalance(
				state.sourceToken,
				$walletAddress as Address,
				amount
			);

			update((s) => ({
				...s,
				balanceCheck: {
					hasEnough: result.hasEnough,
					balance: result.balance,
					shortfall: result.shortfall
				}
			}));

			return result;
		},

		/**
		 * Get a quote for swapping to USDC on Base
		 * Uses cached quote if still valid
		 */
		getSwapQuote: async (amount: bigint) => {
			const state = get({ subscribe });
			const $walletAddress = get(walletAddress);

			if (!state.sourceToken || !$walletAddress) return null;

			const isAlreadyUSDCOnBase =
				state.sourceToken.chainId === SETTLEMENT_CHAIN_ID && state.sourceToken.symbol === 'USDC';

			if (isAlreadyUSDCOnBase) {
				return {
					inputAmount: amount,
					outputAmount: amount,
					requiresSwap: false
				};
			}

			try {
				const orchestrator = getAAOrchestrator();

				// Use cached quote if valid and for the same amount
				const quote = await orchestrator.getOrRefreshQuote(
					state.sourceToken,
					amount,
					$walletAddress as Address,
					state.quoteAmount === amount ? state.cachedQuote : null
				);

				// Cache the quote
				if (quote) {
					update((s) => ({
						...s,
						cachedQuote: quote,
						quoteAmount: amount
					}));
				}

				return quote ? { ...quote, requiresSwap: true } : null;
			} catch {
				return null;
			}
		},

		/**
		 * Start auto-refreshing quotes
		 */
		startQuoteRefresh: (amount: bigint) => {
			// Clear any existing timer
			if (quoteRefreshTimer) {
				clearInterval(quoteRefreshTimer);
			}

			const refreshQuote = async () => {
				const state = get({ subscribe });
				const $walletAddress = get(walletAddress);

				if (!state.sourceToken || !$walletAddress) return;

				const isAlreadyUSDCOnBase =
					state.sourceToken.chainId === SETTLEMENT_CHAIN_ID && state.sourceToken.symbol === 'USDC';

				if (isAlreadyUSDCOnBase) return;

				try {
					const orchestrator = getAAOrchestrator();
					const quote = await orchestrator.getPreTradeQuote(
						state.sourceToken,
						amount,
						$walletAddress as Address
					);

					if (quote) {
						update((s) => ({
							...s,
							cachedQuote: quote,
							quoteAmount: amount
						}));
					}
				} catch {
					// Silently fail on refresh - user still has cached quote
				}
			};

			// Start refresh timer
			quoteRefreshTimer = setInterval(refreshQuote, QUOTE_REFRESH_INTERVAL_MS);
		},

		/**
		 * Stop auto-refreshing quotes
		 */
		stopQuoteRefresh: () => {
			if (quoteRefreshTimer) {
				clearInterval(quoteRefreshTimer);
				quoteRefreshTimer = null;
			}
		},

		/**
		 * Clear cached quote
		 */
		clearQuote: () => {
			update((s) => ({
				...s,
				cachedQuote: null,
				quoteAmount: null
			}));
		},

		/**
		 * Check if a post-trade swap is needed for the destination token
		 */
		needsPostTradeSwap: (): boolean => {
			const state = get({ subscribe });
			if (!state.destinationToken) return false;

			// No swap needed if destination is USDC on Base
			return !(
				state.destinationToken.chainId === SETTLEMENT_CHAIN_ID &&
				state.destinationToken.symbol === 'USDC'
			);
		},

		/**
		 * Set up a pending post-trade swap (call before executing Sell order)
		 * This stores the swap intent so it can be executed after the trade completes
		 */
		setupPostTradeSwap: (expectedUsdcAmount: bigint) => {
			const state = get({ subscribe });
			if (!state.destinationToken) return;

			const needsSwap = !(
				state.destinationToken.chainId === SETTLEMENT_CHAIN_ID &&
				state.destinationToken.symbol === 'USDC'
			);

			if (needsSwap) {
				update((s) => ({
					...s,
					pendingPostTradeSwap: {
						destinationToken: state.destinationToken!,
						expectedUsdcAmount
					}
				}));
			}
		},

		/**
		 * Execute post-trade swap (USDC on Base → destination token)
		 * Call this after a Sell order completes successfully
		 *
		 * @param usdcAmount - Amount of USDC received from the trade
		 * @returns Amount of destination token received, or null if swap failed/not needed
		 */
		executePostTradeSwap: async (usdcAmount: bigint): Promise<bigint | null> => {
			const state = get({ subscribe });
			const $walletAddress = get(walletAddress);

			// If no destination token or already USDC on Base, no swap needed
			if (!state.destinationToken) {
				return usdcAmount;
			}

			const isAlreadyUSDCOnBase =
				state.destinationToken.chainId === SETTLEMENT_CHAIN_ID &&
				state.destinationToken.symbol === 'USDC';

			if (isAlreadyUSDCOnBase) {
				update((s) => ({ ...s, status: 'idle', pendingPostTradeSwap: null }));
				return usdcAmount;
			}

			// Need to swap - check prerequisites
			if (!state.isAAEnabled) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Cross-chain swaps require Rhinestone configuration'
				}));
				return null;
			}

			if (!$walletAddress) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Wallet not connected'
				}));
				return null;
			}

			// Get wallet account for Rhinestone
			const walletAccount = await getDynamicAccountForRhinestone();
			if (!walletAccount) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Unable to get wallet account for cross-chain swap'
				}));
				return null;
			}

			// Execute the swap
			update((s) => ({ ...s, status: 'swapping', error: null }));

			try {
				const orchestrator = getAAOrchestrator();
				const result = await orchestrator.executePostTradeSwap(
					state.destinationToken,
					usdcAmount,
					$walletAddress as Address,
					walletAccount
				);

				if (!result.success) {
					update((s) => ({
						...s,
						status: 'error',
						error: result.error || 'Post-trade swap failed'
					}));
					return null;
				}

				update((s) => ({
					...s,
					status: 'swap_complete',
					pendingPostTradeSwap: null,
					swapResult: {
						txHash: result.txHash || ('0x' as Hex),
						intentId: result.intentId || '',
						usdcAmount: result.outputAmount
					}
				}));

				return result.outputAmount;
			} catch (error) {
				update((s) => ({
					...s,
					status: 'error',
					error: error instanceof Error ? error.message : 'Unknown swap error'
				}));
				return null;
			}
		},

		/**
		 * Clear pending post-trade swap
		 */
		clearPendingPostTradeSwap: () => {
			update((state) => ({ ...state, pendingPostTradeSwap: null }));
		},

		/**
		 * Clear any error state
		 */
		clearError: () => {
			update((state) => ({ ...state, error: null, status: 'idle' }));
		},

		/**
		 * Reset the store completely
		 */
		reset: () => {
			set(initialState);
		}
	};
}

export const aaPaymentStore = createAAPaymentStore();

// =============================================================================
// Derived Stores
// =============================================================================

/**
 * Whether AA is enabled and configured
 */
export const isAAEnabled = derived(aaPaymentStore, ($store) => $store.isAAEnabled);

/**
 * Currently selected source token
 */
export const selectedSourceToken = derived(aaPaymentStore, ($store) => $store.sourceToken);

/**
 * Whether a swap is currently in progress
 */
export const isSwapping = derived(aaPaymentStore, ($store) => $store.status === 'swapping');

/**
 * Current swap status
 */
export const swapStatus = derived(aaPaymentStore, ($store) => $store.status);

/**
 * Any error from the swap
 */
export const swapError = derived(aaPaymentStore, ($store) => $store.error);

/**
 * Currently selected destination token (for Sell orders)
 */
export const selectedDestinationToken = derived(
	aaPaymentStore,
	($store) => $store.destinationToken
);

/**
 * Whether there's a pending post-trade swap
 */
export const hasPendingPostTradeSwap = derived(
	aaPaymentStore,
	($store) => $store.pendingPostTradeSwap !== null
);

/**
 * Pending post-trade swap details
 */
export const pendingPostTradeSwap = derived(
	aaPaymentStore,
	($store) => $store.pendingPostTradeSwap
);

/**
 * Cached quote
 */
export const cachedQuote = derived(aaPaymentStore, ($store) => $store.cachedQuote);

/**
 * Balance check result
 */
export const balanceCheck = derived(aaPaymentStore, ($store) => $store.balanceCheck);

/**
 * Whether user has sufficient balance
 */
export const hasSufficientBalance = derived(
	aaPaymentStore,
	($store) => $store.balanceCheck?.hasEnough ?? true
);
