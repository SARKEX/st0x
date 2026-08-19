import { describe, it, expect } from 'vitest';
import {
	isSgov,
	formatApy,
	SGOV_APY,
	SGOV_MARKET_CLOSED_MESSAGE,
	SGOV_TRADING_SCHEDULE,
	SGOV_WRAPPED_ADDRESS,
	SGOV_UNWRAPPED_ADDRESS
} from '$lib/config/earn';

describe('isSgov', () => {
	it('recognises the wrapped and unwrapped SGOV addresses', () => {
		expect(isSgov(SGOV_WRAPPED_ADDRESS)).toBe(true);
		expect(isSgov(SGOV_UNWRAPPED_ADDRESS)).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isSgov(SGOV_WRAPPED_ADDRESS.toLowerCase())).toBe(true);
		expect(isSgov(SGOV_WRAPPED_ADDRESS.toUpperCase())).toBe(true);
	});

	it('returns false for nullish or empty input', () => {
		expect(isSgov(null)).toBe(false);
		expect(isSgov(undefined)).toBe(false);
		expect(isSgov('')).toBe(false);
	});

	it('returns false for an unrelated address', () => {
		expect(isSgov('0x000000000000000000000000000000000000dead')).toBe(false);
	});
});

describe('formatApy', () => {
	it('defaults to two decimals, trailing zeros trimmed', () => {
		expect(formatApy()).toBe(parseFloat(SGOV_APY.toFixed(2)).toString());
	});

	it('honours a requested precision, trailing zeros trimmed', () => {
		expect(formatApy(0)).toBe(parseFloat(SGOV_APY.toFixed(0)).toString());
		expect(formatApy(1)).toBe(parseFloat(SGOV_APY.toFixed(1)).toString());
	});

	it('never renders trailing zeros (a round rate is "3", not "3.00")', () => {
		expect(formatApy()).not.toMatch(/\.\d*0$/);
	});
});

describe('SGOV trading availability copy', () => {
	it('states the complete regular-hours schedule', () => {
		expect(SGOV_TRADING_SCHEDULE).toBe(
			'Monday–Friday, 9:30 AM–4:00 PM ET, excluding market holidays'
		);
	});

	it('explains that earn and withdrawal orders are unavailable while closed', () => {
		expect(SGOV_MARKET_CLOSED_MESSAGE).toBe(
			`SGOV trading is currently closed. Earn and withdrawal orders can be placed ${SGOV_TRADING_SCHEDULE}.`
		);
	});
});
