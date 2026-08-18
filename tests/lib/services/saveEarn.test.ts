import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import {
	buildSaveEarnOrder,
	normalizeSaveEarnDeposit,
	projectedYearlyYield,
	estimateSaveEarnReceive
} from '$lib/services/saveEarn';
import { SGOV_APY } from '$lib/config/earn';

const USDC = { address: '0xusdc', decimals: 6, symbol: 'USDC' };
const SGOV = { address: '0xsgov', decimals: 18, symbol: 'wtSGOV' };

describe('buildSaveEarnOrder', () => {
	describe('deposit (Buy wtSGOV, spend USDC)', () => {
		it('maps to a spend-mode Buy with USDC-decimal amount', () => {
			const params = buildSaveEarnOrder({
				mode: 'deposit',
				depositUsdc: 100,
				withdrawWtsgov: 0,
				sgovToken: SGOV,
				paymentToken: USDC
			});
			expect(params.orderSide).toBe('Buy');
			expect(params.inputMode).toBe('spend');
			expect(params.amount).toBe(parseUnits('100', 6)); // 100_000_000n
			expect(params.assetToken).toEqual(SGOV);
			expect(params.paymentToken).toEqual(USDC);
		});

		it('floors fractional dollars so we never spend more than the integer shown', () => {
			const params = buildSaveEarnOrder({
				mode: 'deposit',
				depositUsdc: 100.99,
				withdrawWtsgov: 0,
				sgovToken: SGOV,
				paymentToken: USDC
			});
			expect(params.amount).toBe(parseUnits('100', 6));
		});

		it('clamps negative input to a zero amount', () => {
			const params = buildSaveEarnOrder({
				mode: 'deposit',
				depositUsdc: -50,
				withdrawWtsgov: 0,
				sgovToken: SGOV,
				paymentToken: USDC
			});
			expect(params.amount).toBe(0n);
		});
	});

	describe('withdraw (Sell wtSGOV, receive USDC)', () => {
		it('maps to an amount-mode Sell with asset-decimal amount', () => {
			const params = buildSaveEarnOrder({
				mode: 'withdraw',
				depositUsdc: 0,
				withdrawWtsgov: 1.5,
				sgovToken: SGOV,
				paymentToken: USDC
			});
			expect(params.orderSide).toBe('Sell');
			expect(params.inputMode).toBe('amount');
			expect(params.amount).toBe(parseUnits('1.5', 18)); // 1_500000000000000000n
			expect(params.assetToken).toEqual(SGOV);
			expect(params.paymentToken).toEqual(USDC);
		});

		it('handles very small fractions without throwing (no scientific-notation string)', () => {
			// String(0.0000001) === "1e-7", which parseUnits rejects. The service
			// uses toFixed(decimals) to stay exponent-free.
			const build = () =>
				buildSaveEarnOrder({
					mode: 'withdraw',
					depositUsdc: 0,
					withdrawWtsgov: 0.0000001,
					sgovToken: SGOV,
					paymentToken: USDC
				});
			expect(build).not.toThrow();
			expect(build().amount).toBe(parseUnits('0.0000001', 18));
		});

		it('clamps negative input to a zero amount', () => {
			const params = buildSaveEarnOrder({
				mode: 'withdraw',
				depositUsdc: 0,
				withdrawWtsgov: -3,
				sgovToken: SGOV,
				paymentToken: USDC
			});
			expect(params.amount).toBe(0n);
		});
	});
});

describe('normalizeSaveEarnDeposit', () => {
	it('keeps displayed and submitted deposits on the same whole-dollar amount', () => {
		expect(normalizeSaveEarnDeposit(100.99)).toBe(100);
		expect(normalizeSaveEarnDeposit(0.99)).toBe(0);
		expect(normalizeSaveEarnDeposit(-1)).toBe(0);
	});
});

describe('projectedYearlyYield', () => {
	it('applies the SGOV yield', () => {
		expect(projectedYearlyYield(10_000)).toBeCloseTo(10_000 * (SGOV_APY / 100), 6);
	});

	it('is zero for non-positive deposits', () => {
		expect(projectedYearlyYield(0)).toBe(0);
		expect(projectedYearlyYield(-100)).toBe(0);
	});
});

describe('estimateSaveEarnReceive', () => {
	it('divides USDC by the ask price on deposit', () => {
		expect(estimateSaveEarnReceive('deposit', 100, 100)).toBeCloseTo(1, 6);
		expect(estimateSaveEarnReceive('deposit', 250, 100.8)).toBeCloseTo(250 / 100.8, 6);
	});

	it('multiplies wtSGOV by the bid price on withdraw', () => {
		expect(estimateSaveEarnReceive('withdraw', 2, 50)).toBeCloseTo(100, 6);
	});

	it('returns null without a usable price or amount', () => {
		expect(estimateSaveEarnReceive('deposit', 100, null)).toBeNull();
		expect(estimateSaveEarnReceive('deposit', 100, 0)).toBeNull();
		expect(estimateSaveEarnReceive('withdraw', 100, -1)).toBeNull();
		expect(estimateSaveEarnReceive('deposit', 0, 100)).toBeNull();
	});
});
