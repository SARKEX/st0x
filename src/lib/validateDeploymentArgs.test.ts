import { describe, it, expect } from 'vitest';
import {
	validateSelectedAmount,
	validatePeriod,
	validateBaseline,
	validateOverrideDepositAmount
} from './validateDeploymentArgs';

describe('validateDeploymentArgs', () => {
	describe('validateSelectedAmount', () => {
		it('should return undefined for valid positive amounts', () => {
			expect(validateSelectedAmount('1')).toBeUndefined();
			expect(validateSelectedAmount('100')).toBeUndefined();
			expect(validateSelectedAmount('0.5')).toBeUndefined();
			expect(validateSelectedAmount('999999999')).toBeUndefined();
		});

		it('should require a value', () => {
			expect(validateSelectedAmount(undefined)).toBe('Amount is required');
			expect(validateSelectedAmount('')).toBe('Amount is required');
		});

		it('should require positive values', () => {
			expect(validateSelectedAmount('0')).toBe('Amount must be greater than 0');
			expect(validateSelectedAmount('-1')).toBe('Amount must be greater than 0');
			expect(validateSelectedAmount('-100')).toBe('Amount must be greater than 0');
		});
	});

	describe('validatePeriod', () => {
		it('should return undefined for valid positive periods', () => {
			expect(validatePeriod('1')).toBeUndefined();
			expect(validatePeriod('365')).toBeUndefined();
			expect(validatePeriod('10000')).toBeUndefined();
		});

		it('should require a value', () => {
			expect(validatePeriod(undefined)).toBe('Period is required');
			expect(validatePeriod('')).toBe('Period is required');
		});

		it('should require positive values', () => {
			expect(validatePeriod('0')).toBe('Period must be greater than 0');
			expect(validatePeriod('-1')).toBe('Period must be greater than 0');
		});
	});

	describe('validateBaseline', () => {
		it('should return undefined for any non-empty value', () => {
			expect(validateBaseline('0')).toBeUndefined();
			expect(validateBaseline('100')).toBeUndefined();
			expect(validateBaseline('-1')).toBeUndefined();
			expect(validateBaseline('anything')).toBeUndefined();
		});

		it('should require a value', () => {
			expect(validateBaseline(undefined)).toBe('Baseline is required');
			expect(validateBaseline('')).toBe('Baseline is required');
		});

		it('should not enforce positive constraint', () => {
			expect(validateBaseline('0')).toBeUndefined();
			expect(validateBaseline('-100')).toBeUndefined();
		});
	});

	describe('validateOverrideDepositAmount', () => {
		it('should return undefined for any non-empty value', () => {
			expect(validateOverrideDepositAmount('0')).toBeUndefined();
			expect(validateOverrideDepositAmount('1000')).toBeUndefined();
			expect(validateOverrideDepositAmount('-1')).toBeUndefined();
			expect(validateOverrideDepositAmount('test')).toBeUndefined();
		});

		it('should require a value', () => {
			expect(validateOverrideDepositAmount(undefined)).toBe('Override deposit amount is required');
			expect(validateOverrideDepositAmount('')).toBe('Override deposit amount is required');
		});

		it('should not enforce positive constraint', () => {
			expect(validateOverrideDepositAmount('0')).toBeUndefined();
			expect(validateOverrideDepositAmount('-100')).toBeUndefined();
		});
	});

	describe('validator edge cases', () => {
		it('should handle whitespace in validation', () => {
			// Note: The validators don't trim, so whitespace values are treated as invalid if empty
			expect(validateSelectedAmount('   ')).toBe('Amount is required');
			expect(validatePeriod('   ')).toBe('Period is required');
		});

		it('should handle scientific notation', () => {
			// These should be valid since Number() can parse them
			expect(validateSelectedAmount('1e10')).toBeUndefined();
			expect(validatePeriod('1e5')).toBeUndefined();
		});

		it('should handle NaN properly', () => {
			// Number('NaN') returns NaN, which is not > 0
			expect(validateSelectedAmount('NaN')).toBe('Amount must be greater than 0');
		});
	});
});
