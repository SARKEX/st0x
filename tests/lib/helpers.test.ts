/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { convertDotNotationToObject } from '$lib/utils/helpers';

describe('helpers', () => {
	describe('convertDotNotationToObject', () => {
		it('should convert flat dot notation to nested object', () => {
			const input = {
				'user.name': 'John',
				'user.age': 30,
				'user.address.city': 'New York'
			};
			const result = convertDotNotationToObject(input);
			expect(result.user.name).toBe('John');
			expect(result.user.age).toBe(30);
			expect(result.user.address.city).toBe('New York');
		});

		it('should handle single level keys', () => {
			const input = { name: 'John', age: 30 };
			const result = convertDotNotationToObject(input);
			expect(result.name).toBe('John');
			expect(result.age).toBe(30);
		});

		it('should handle empty object', () => {
			expect(convertDotNotationToObject({})).toEqual({});
		});

		it('should handle deeply nested paths', () => {
			const result = convertDotNotationToObject({ 'a.b.c.d.e': 'deep' });
			expect(result.a.b.c.d.e).toBe('deep');
		});

		it('should handle null/undefined/empty values', () => {
			const input = {
				'obj.null': null,
				'obj.undefined': undefined,
				'obj.empty': ''
			};
			const result = convertDotNotationToObject(input);
			expect(result.obj.null).toBeNull();
			expect(result.obj.undefined).toBeUndefined();
			expect(result.obj.empty).toBe('');
		});

		it('should handle multiple nested paths at same level', () => {
			const input = {
				'config.db.host': 'localhost',
				'config.db.port': 5432,
				'config.cache.ttl': 3600
			};
			const result = convertDotNotationToObject(input);
			expect(result.config.db.host).toBe('localhost');
			expect(result.config.db.port).toBe(5432);
			expect(result.config.cache.ttl).toBe(3600);
		});

		it('should overwrite non-object values when converting', () => {
			const input = { a: 'string', 'a.b': 'nested' };
			const result = convertDotNotationToObject(input);
			expect(typeof result.a).toBe('object');
			expect(result.a.b).toBe('nested');
		});

		it('should handle array-like notation (numbers in keys)', () => {
			const input = { 'items.0.name': 'first', 'items.1.name': 'second' };
			const result = convertDotNotationToObject(input);
			expect(result.items['0'].name).toBe('first');
			expect(result.items['1'].name).toBe('second');
		});
	});
});
