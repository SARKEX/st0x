import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	mapOrder,
	formatDate,
	convertDotNotationToObject,
	mapRoles,
	type Role
} from './helpers';

// Mock data
const mockRoles: Role[] = [
	{
		roleName: 'DEPOSIT',
		roleHash: '0xhash1',
		roleHolders: [
			{ account: { address: '0x1234' } },
			{ account: { address: '0x5678' } }
		]
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
		it('should sort array based on specified order', () => {
			const array = [
				{ name: 'c', value: 3 },
				{ name: 'a', value: 1 },
				{ name: 'b', value: 2 }
			];
			const order = ['a', 'b', 'c'];

			const result = mapOrder(array, order, 'name');
			expect(result[0].name).toBe('a');
			expect(result[1].name).toBe('b');
			expect(result[2].name).toBe('c');
		});

		it('should handle partial order specification', () => {
			const array = [
				{ id: 'x', val: 1 },
				{ id: 'y', val: 2 },
				{ id: 'z', val: 3 }
			];
			const order = ['z', 'x'];

			const result = mapOrder(array, order, 'id');
			// z and x are specified, y is not, so y comes last
			expect(result[0].id).toBe('z');
			expect(result[1].id).toBe('x');
			expect(result[2].id).toBe('y');
		});

		it('should handle missing items in order', () => {
			const array = [
				{ type: 'A' },
				{ type: 'B' },
				{ type: 'C' }
			];
			const order = ['B'];

			const result = mapOrder(array, order, 'type');
			// B is specified first, then A and C (not in order list)
			expect(result[0].type).toBe('B');
		});

		it('should handle empty array', () => {
			const array: any[] = [];
			const order = ['a', 'b'];

			const result = mapOrder(array, order, 'key');
			expect(result).toEqual([]);
		});

		it('should handle single element', () => {
			const array = [{ id: 'a' }];
			const order = ['b', 'a'];

			const result = mapOrder(array, order, 'id');
			expect(result).toEqual([{ id: 'a' }]);
		});

		it('should mutate the original array', () => {
			const array = [
				{ priority: 'low' },
				{ priority: 'high' },
				{ priority: 'medium' }
			];
			const order = ['high', 'medium', 'low'];

			const result = mapOrder(array, order, 'priority');
			expect(result).toBe(array); // Should be same reference
			expect(array[0].priority).toBe('high');
		});
	});

	describe('formatDate', () => {
		it('should format date as YYYY-MM-DD', () => {
			const date = new Date('2024-01-15T10:30:00Z');
			const result = formatDate(date);
			// Result depends on local timezone, but format should be YYYY-MM-DD
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		it('should pad month and day with zeros', () => {
			const date = new Date('2024-01-01T00:00:00Z');
			const result = formatDate(date);
			expect(result).toMatch(/2024-01-\d{2}/);
		});

		it('should handle end of year', () => {
			const date = new Date('2024-12-31T23:59:59Z');
			const result = formatDate(date);
			expect(result).toMatch(/2024-12-31/);
		});

		it('should handle leap year date', () => {
			const date = new Date('2024-02-29T00:00:00Z');
			const result = formatDate(date);
			expect(result).toMatch(/2024-02-\d{2}/);
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
			const input = {
				name: 'John',
				age: 30
			};

			const result = convertDotNotationToObject(input);
			expect(result.name).toBe('John');
			expect(result.age).toBe(30);
		});

		it('should handle empty object', () => {
			const input = {};
			const result = convertDotNotationToObject(input);
			expect(result).toEqual({});
		});

		it('should handle deeply nested paths', () => {
			const input = {
				'a.b.c.d.e': 'deep'
			};

			const result = convertDotNotationToObject(input);
			expect(result.a.b.c.d.e).toBe('deep');
		});

		it('should handle null and undefined values', () => {
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
			const input = {
				'a': 'string',
				'a.b': 'nested'
			};

			const result = convertDotNotationToObject(input);
			// When we hit 'a.b', 'a' should be converted to an object
			expect(typeof result.a).toBe('object');
			expect(result.a.b).toBe('nested');
		});

		it('should handle array-like notation (numbers in keys)', () => {
			const input = {
				'items.0.name': 'first',
				'items.1.name': 'second'
			};

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

		it('should assign correct readable names', () => {
			const result = mapRoles(mockRoles);

			const depositRole = result.find((r) => r.roleName === 'DEPOSIT');
			expect(depositRole?.readableName).toBe('Depositor');
		});

		it('should assign correct role types', () => {
			const result = mapRoles(mockRoles);

			const depositRole = result.find((r) => r.roleName === 'DEPOSIT');
			expect(depositRole?.roleType).toBe('operator');

			const withdrawRole = result.find((r) => r.roleName === 'WITHDRAW');
			expect(withdrawRole?.roleType).toBe('operator');
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
			const withdrawRole = result[0];
			expect(withdrawRole.roleHolders).toHaveLength(1);
			expect(withdrawRole.adminRoleHolders).toHaveLength(0);
		});

		it('should handle empty roles array', () => {
			const result = mapRoles([]);
			expect(result).toEqual([]);
		});

		it('should combine multiple role holders', () => {
			const roles: Role[] = [
				{
					roleName: 'CERTIFY',
					roleHash: '0xhash3',
					roleHolders: [
						{ account: { address: '0xaaaa' } },
						{ account: { address: '0xbbbb' } }
					]
				},
				{
					roleName: 'CERTIFY_ADMIN',
					roleHash: '0xhash3_admin',
					roleHolders: [
						{ account: { address: '0xcccc' } },
						{ account: { address: '0xdddd' } }
					]
				}
			];

			const result = mapRoles(roles);
			const certifyRole = result[0];
			expect(certifyRole.roleHolders).toHaveLength(2);
			expect(certifyRole.adminRoleHolders).toHaveLength(2);
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
			// Only DEPOSIT should be included
			expect(result).toHaveLength(1);
			expect(result[0].roleName).toBe('DEPOSIT');
		});

		it('should preserve role holder data', () => {
			const roles: Role[] = [
				{
					roleName: 'WITHDRAW',
					roleHash: '0xhash2',
					roleHolders: [
						{ account: { address: '0xtest1' } },
						{ account: { address: '0xtest2' } }
					]
				}
			];

			const result = mapRoles(roles);
			const withdrawRole = result[0];
			expect(withdrawRole.roleHolders[0].account.address).toBe('0xtest1');
			expect(withdrawRole.roleHolders[1].account.address).toBe('0xtest2');
		});
	});
});
