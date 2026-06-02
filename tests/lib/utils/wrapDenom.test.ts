/**
 * Wrap-ratio denomination helper tests.
 *
 * The helpers under test sit between the orderbook (USD per wt*, qty in wt*)
 * and the UI (USD per share, qty in shares). Get the direction wrong and the
 * trade page renders prices that look 1.0027× off — invisible enough to ship
 * but big enough to be the difference between a sane bid and an offer that
 * looks like an arbitrage opportunity (it isn't). These tests pin the
 * direction with wtSGOV's real 1.0027 ratio and a couple of round-number
 * synthetics.
 */
import { describe, it, expect } from 'vitest';
import {
	displayAmount,
	displayPrice,
	displaySymbol,
	priceScale
} from '../../../src/lib/utils/wrapDenom';

const SGOV_RATIO = 1.002700626096609112; // wtSGOV at block 46604184 (fixture)

describe('wrapDenom — displaySymbol', () => {
	it('returns the wrapped symbol unchanged in wrapped mode', () => {
		expect(displaySymbol('wtSGOV', 'wrapped')).toBe('wtSGOV');
		expect(displaySymbol('USDC', 'wrapped')).toBe('USDC');
	});

	it("strips the leading 'wt' prefix in unwrapped mode", () => {
		expect(displaySymbol('wtSGOV', 'unwrapped')).toBe('tSGOV');
		expect(displaySymbol('wtCOIN', 'unwrapped')).toBe('tCOIN');
		expect(displaySymbol('wtNVDA', 'unwrapped')).toBe('tNVDA');
	});

	it('only strips a leading wt — interior wt is preserved', () => {
		expect(displaySymbol('wwt', 'unwrapped')).toBe('wwt');
		expect(displaySymbol('TWT', 'unwrapped')).toBe('TWT'); // case-sensitive on the prefix
	});

	it('honors an explicit override over the wt→t derivation', () => {
		// Useful when the underlying isn't a literal prefix-strip of the wrapped
		// symbol (e.g. registry-driven custom labels).
		expect(displaySymbol('wtCOIN', 'unwrapped', 'COIN')).toBe('COIN');
		expect(displaySymbol('wtCOIN', 'wrapped', 'COIN')).toBe('wtCOIN'); // wrapped wins
	});
});

describe('wrapDenom — displayAmount (wt qty → share qty)', () => {
	it('is identity in wrapped mode regardless of ratio', () => {
		expect(displayAmount(2, 'wrapped', SGOV_RATIO)).toBe(2);
		expect(displayAmount(2, 'wrapped', 1)).toBe(2);
		expect(displayAmount(0, 'wrapped', SGOV_RATIO)).toBe(0);
	});

	it('multiplies by ratio in unwrapped mode — 1 wt holds `ratio` shares', () => {
		// 2 wtSGOV ⇒ 2 × 1.0027… tSGOV
		expect(displayAmount(2, 'unwrapped', SGOV_RATIO)).toBeCloseTo(2.005401252193218, 10);
		// Round-number sanity check
		expect(displayAmount(10, 'unwrapped', 1.25)).toBe(12.5);
	});

	it('is identity when ratio is exactly 1 (parity wrapper, the common case)', () => {
		expect(displayAmount(2, 'unwrapped', 1)).toBe(2);
	});

	it('returns null for null/undefined/NaN/Infinity inputs', () => {
		expect(displayAmount(null, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayAmount(undefined, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayAmount(NaN, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayAmount(Infinity, 'unwrapped', SGOV_RATIO)).toBeNull();
	});

	it('falls through to ratio=1 when the ratio is missing or non-positive (defensive)', () => {
		// A stale store, a parity wrapper that didn't make it into the fixture,
		// or a divide-by-zero attempt should not crater the column.
		expect(displayAmount(2, 'unwrapped', null)).toBe(2);
		expect(displayAmount(2, 'unwrapped', undefined)).toBe(2);
		expect(displayAmount(2, 'unwrapped', 0)).toBe(2);
		expect(displayAmount(2, 'unwrapped', -1)).toBe(2);
		expect(displayAmount(2, 'unwrapped', NaN)).toBe(2);
	});
});

describe('wrapDenom — displayPrice (USD/wt → USD/share)', () => {
	it('is identity in wrapped mode regardless of ratio', () => {
		expect(displayPrice(100, 'wrapped', SGOV_RATIO)).toBe(100);
		expect(displayPrice(100, 'wrapped', 1)).toBe(100);
	});

	it('divides by ratio in unwrapped mode — share price = wt price ÷ ratio', () => {
		// USD per share is *cheaper* than USD per wt because 1 wt holds >1 share.
		// 100.27 USD/wt ÷ 1.0027… ≈ 100.00 USD/share
		expect(displayPrice(100.2700626096609, 'unwrapped', SGOV_RATIO)).toBeCloseTo(100, 8);
		expect(displayPrice(125, 'unwrapped', 1.25)).toBe(100);
	});

	it('is identity when ratio is exactly 1', () => {
		expect(displayPrice(100, 'unwrapped', 1)).toBe(100);
	});

	it('returns null for null/undefined/NaN/Infinity inputs', () => {
		expect(displayPrice(null, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayPrice(undefined, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayPrice(NaN, 'unwrapped', SGOV_RATIO)).toBeNull();
		expect(displayPrice(Infinity, 'unwrapped', SGOV_RATIO)).toBeNull();
	});

	it('falls through to ratio=1 when the ratio is missing or non-positive', () => {
		expect(displayPrice(100, 'unwrapped', null)).toBe(100);
		expect(displayPrice(100, 'unwrapped', 0)).toBe(100); // critical: never /0
		expect(displayPrice(100, 'unwrapped', -1)).toBe(100);
		expect(displayPrice(100, 'unwrapped', NaN)).toBe(100);
	});
});

describe('wrapDenom — priceScale', () => {
	it('returns 1 in wrapped mode', () => {
		expect(priceScale('wrapped', SGOV_RATIO)).toBe(1);
		expect(priceScale('wrapped', 1)).toBe(1);
		expect(priceScale('wrapped', 0)).toBe(1);
	});

	it('returns 1/ratio in unwrapped mode', () => {
		expect(priceScale('unwrapped', 1.25)).toBe(0.8);
		expect(priceScale('unwrapped', SGOV_RATIO)).toBeCloseTo(1 / SGOV_RATIO, 12);
		expect(priceScale('unwrapped', 1)).toBe(1);
	});

	it('falls through to identity when ratio is missing or non-positive', () => {
		expect(priceScale('unwrapped', null)).toBe(1);
		expect(priceScale('unwrapped', undefined)).toBe(1);
		expect(priceScale('unwrapped', 0)).toBe(1);
		expect(priceScale('unwrapped', -1)).toBe(1);
		expect(priceScale('unwrapped', NaN)).toBe(1);
	});

	it("matches displayPrice for chart-scale use (multiplying OHLC by priceScale equals divide-by-ratio)", () => {
		// This is the contract the trade page relies on: the chart multiplies
		// every OHLC point by `priceScale`, the OrdersTable calls displayPrice
		// per row. The two paths must produce the same number for the same
		// (price, denomination, ratio) triple, otherwise the orderbook depth
		// chart and the orders table would disagree on the displayed price.
		const samples = [50, 99.5, 100.27, 1234.5678];
		for (const px of samples) {
			const viaScale = px * priceScale('unwrapped', SGOV_RATIO);
			const viaDirect = displayPrice(px, 'unwrapped', SGOV_RATIO);
			expect(viaScale).toBeCloseTo(viaDirect!, 12);
		}
	});
});

describe('wrapDenom — round-trip invariants', () => {
	it('amount × price is conserved across denominations (notional USD does not change)', () => {
		// 2 wt at $100.27/wt = $200.54 notional.
		// 2.0054 shares at $100/share = $200.54 notional.
		const wtAmount = 2;
		const wtPrice = 100.2700626096609;
		const wrappedNotional =
			displayAmount(wtAmount, 'wrapped', SGOV_RATIO)! *
			displayPrice(wtPrice, 'wrapped', SGOV_RATIO)!;
		const unwrappedNotional =
			displayAmount(wtAmount, 'unwrapped', SGOV_RATIO)! *
			displayPrice(wtPrice, 'unwrapped', SGOV_RATIO)!;
		expect(unwrappedNotional).toBeCloseTo(wrappedNotional, 8);
	});
});
