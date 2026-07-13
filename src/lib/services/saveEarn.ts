// ─────────────────────────────────────────────────────────────────────────
// Save & Earn order mapping — pure, testable glue between the SaveEarnModal's
// UI state and the shared market-order engine (executeMarketOrder).
//
// Deposit  = Buy wtSGOV, spending exactly N whole USDC (inputMode 'spend').
// Withdraw = Sell a wtSGOV quantity for USDC          (inputMode 'amount').
//
// This is deliberately the *only* place the deposit/withdraw → order-params
// translation lives, so the money-moving mapping (side, decimals, floor,
// inputMode) can be unit-tested without rendering the modal.
// ─────────────────────────────────────────────────────────────────────────
import { parseUnits } from 'viem';
import { SGOV_APY } from '$lib/config/earn';
import type { TokenInfo } from '$lib/types/transactions';

export type SaveEarnMode = 'deposit' | 'withdraw';

export interface SaveEarnOrderInput {
	mode: SaveEarnMode;
	/** USDC the user is depositing (Buy). Floored to a whole dollar. */
	depositUsdc: number;
	/** wtSGOV the user is redeeming (Sell). */
	withdrawWtsgov: number;
	sgovToken: TokenInfo;
	paymentToken: TokenInfo;
}

export interface SaveEarnOrderParams {
	orderSide: 'Buy' | 'Sell';
	amount: bigint;
	inputMode: 'spend' | 'amount';
	assetToken: TokenInfo;
	paymentToken: TokenInfo;
}

// Build the market-order params for a deposit or withdrawal. The result is
// spread directly into executeMarketOrder() alongside the active network.
export function buildSaveEarnOrder(input: SaveEarnOrderInput): SaveEarnOrderParams {
	const { mode, depositUsdc, withdrawWtsgov, sgovToken, paymentToken } = input;

	if (mode === 'deposit') {
		// Spend exactly N whole USDC — floor so we never request more than the
		// integer the user sees, and parseUnits gets a clean integer string.
		const dollars = Math.floor(Math.max(0, depositUsdc));
		return {
			orderSide: 'Buy',
			amount: parseUnits(dollars.toString(), paymentToken.decimals),
			inputMode: 'spend',
			assetToken: sgovToken,
			paymentToken
		};
	}

	// Sell a wtSGOV quantity. toFixed(decimals) keeps the string exponent-free
	// and within the token's precision (a plain .toString() emits "1e-7" for
	// small values, which parseUnits rejects).
	const wtsgov = Math.max(0, withdrawWtsgov);
	return {
		orderSide: 'Sell',
		amount: parseUnits(wtsgov.toFixed(sgovToken.decimals), sgovToken.decimals),
		inputMode: 'amount',
		assetToken: sgovToken,
		paymentToken
	};
}

// Projected first-year yield on a USDC deposit at the current SGOV yield.
export function projectedYearlyYield(usdc: number): number {
	return Math.max(0, usdc) * (SGOV_APY / 100);
}

// Estimated counter-asset received, from the best crossing quote price.
// Deposit: USDC / askPrice → wtSGOV. Withdraw: wtSGOV * bidPrice → USDC.
// Returns null when there's no usable price or a non-positive amount.
export function estimateSaveEarnReceive(
	mode: SaveEarnMode,
	amount: number,
	price: number | null
): number | null {
	if (!price || price <= 0 || amount <= 0) return null;
	return mode === 'deposit' ? amount / price : amount * price;
}
