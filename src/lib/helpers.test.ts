/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapOrder, formatDate, convertDotNotationToObject, mapRoles, type Role } from './helpers';

// Mock data
const mockRoles: Role[] = [
	{
		roleName: 'DEPOSIT',
		roleHash: '0xhash1',
		roleHolders: [{ account: { address: '0x1234' } }, { account: { address: '0x5678' } }]
	},
	{
		roleName: 'DEPOSIT_ADMIN',
		roleHash: '0xhash1_admin',
		roleHolders: [{ account: { address: '0xabcd' } }]
	},
	{
		roleName: 'WITHDRAW',
		roleHash: '0xhash2',
		roleHolders: [{ account: { address: '0xef01' } }]
	}
];

describe('helpers', () => {
	describe('mapOrder', () => {
		it.each([
			{
				desc: 'basic sort',
				array: [
					{ name: 'c', value: 3 },
					{ name: 'a', value: 1 },
					{ name: 'b', value: 2 }
				],
				order: ['a', 'b', 'c'],
				key: 'name',
				checkIdx: [
					[0, 'a'],
					[1, 'b'],
					[2, 'c']
				]
			},
			{
				desc: 'partial order',
				array: [
					{ id: 'x', val: 1 },
					{ id: 'y', val: 2 },
					{ id: 'z', val: 3 }
				],
				order: ['z', 'x'],
				key: 'id',
				checkIdx: [[0, 'z'], [1, 'x']]
			},
			{
				desc: 'missing items in order',
				array: [{ type: 'A' }, { type: 'B' }, { type: 'C' }],
				order: ['B'],
				key: 'type',
				checkIdx: [[0, 'B']]
			}
		])('should handle $desc', ({ array, order, key, checkIdx }) => {
			const result = mapOrder(array, order, key);
			checkIdx.forEach(([idx, expected]) => {
				expect(result[idx][key]).toBe(expected);
			});
		});

		it('should handle empty array', () => {
			const result = mapOrder([], ['a', 'b'], 'key');
			expect(result).toEqual([]);
		});

		it('should handle single element', () => {
			const result = mapOrder([{ id: 'a' }], ['b', 'a'], 'id');
			expect(result).toEqual([{ id: 'a' }]);
		});

		it('should mutate the original array', () => {
			const array = [{ priority: 'low' }, { priority: 'high' }, { priority: 'medium' }];
			const result = mapOrder(array, ['high', 'medium', 'low'], 'priority');
			expect(result).toBe(array);
			expect(array[0].priority).toBe('high');
		});
	});

	describe('formatDate', () => {
		it.each([
			new Date('2024-01-15T10:30:00Z'),
			new Date('2024-12-31T23:59:59Z'),
			new Date('2024-02-29T00:00:00Z')
		])('should format date %s as YYYY-MM-DD', (date) => {
			const result = formatDate(date);
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

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

	describe('mapRoles', () => {
		it('should map roles and separate admin roles', () => {
			const result = mapRoles(mockRoles);
			const depositRole = result.find((r) => r.roleName === 'DEPOSIT');
			expect(depositRole).toBeDefined();
			expect(depositRole?.roleHolders).toHaveLength(2);
			expect(depositRole?.adminRoleHolders).toHaveLength(1);
		});

		it('should assign correct readable names and role types', () => {
			const result = mapRoles(mockRoles);
			const depositRole = result.find((r) => r.roleName === 'DEPOSIT');
			expect(depositRole?.readableName).toBe('Depositor');
			expect(depositRole?.roleType).toBe('operator');
		});

		it('should handle roles without admin counterpart', () => {
			const roles: Role[] = [
				{
					roleName: 'WITHDRAW',
					roleHash: '0xhash2',
					roleHolders: [{ account: { address: '0x1111' } }]
				}
			];
			const result = mapRoles(roles);
			expect(result[0].roleHolders).toHaveLength(1);
			expect(result[0].adminRoleHolders).toHaveLength(0);
		});

		it('should handle empty roles array', () => {
			expect(mapRoles([])).toEqual([]);
		});

		it('should combine multiple role holders', () => {
			const roles: Role[] = [
				{
					roleName: 'CERTIFY',
					roleHash: '0xhash3',
					roleHolders: [{ account: { address: '0xaaaa' } }, { account: { address: '0xbbbb' } }]
				},
				{
					roleName: 'CERTIFY_ADMIN',
					roleHash: '0xhash3_admin',
					roleHolders: [{ account: { address: '0xcccc' } }, { account: { address: '0xdddd' } }]
				}
			];
			const result = mapRoles(roles);
			expect(result[0].roleHolders).toHaveLength(2);
			expect(result[0].adminRoleHolders).toHaveLength(2);
		});

		it('should only include known roles', () => {
			const roles: Role[] = [
				{
					roleName: 'UNKNOWN_ROLE',
					roleHash: '0xunknown',
					roleHolders: [{ account: { address: '0x1234' } }]
				},
				{
					roleName: 'DEPOSIT',
					roleHash: '0xhash1',
					roleHolders: [{ account: { address: '0x5678' } }]
				}
			];
			const result = mapRoles(roles);
			expect(result).toHaveLength(1);
			expect(result[0].roleName).toBe('DEPOSIT');
		});

		it('should preserve role holder data', () => {
			const roles: Role[] = [
				{
					roleName: 'WITHDRAW',
					roleHash: '0xhash2',
					roleHolders: [{ account: { address: '0xtest1' } }, { account: { address: '0xtest2' } }]
				}
			];
			const result = mapRoles(roles);
			expect(result[0].roleHolders[0].account.address).toBe('0xtest1');
			expect(result[0].roleHolders[1].account.address).toBe('0xtest2');
		});
	});
});
