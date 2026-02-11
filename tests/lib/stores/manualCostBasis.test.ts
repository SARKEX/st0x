import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock $app/environment to enable browser mode
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock localStorage
const localStorageMap = new Map<string, string>();
const localStorageMock = {
	getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => localStorageMap.set(key, value)),
	removeItem: vi.fn((key: string) => localStorageMap.delete(key)),
	clear: vi.fn(() => localStorageMap.clear())
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('manualCostBasisStore', () => {
	const wallet = '0xUser1';
	const legacyAddress = '0xLegacyToken';
	const wrappedAddress = '0xWrappedToken';

	beforeEach(() => {
		localStorageMap.clear();
		vi.clearAllMocks();
	});

	it('migrateEntry moves an entry from legacy to wrapped address', async () => {
		const { manualCostBasisStore } = await import('$lib/stores/manualCostBasis');

		manualCostBasisStore.loadForWallet(wallet);

		// Set an entry at the legacy address
		manualCostBasisStore.setEntry({
			tokenAddress: legacyAddress,
			quantity: 5,
			costPerUnit: 100,
			totalCost: 500,
			note: 'original purchase'
		});

		// Verify legacy entry exists
		const beforeMigrate = get(manualCostBasisStore);
		expect(beforeMigrate.get(legacyAddress.toLowerCase())).toBeDefined();
		expect(beforeMigrate.get(wrappedAddress.toLowerCase())).toBeUndefined();

		// Migrate
		manualCostBasisStore.migrateEntry(legacyAddress, wrappedAddress);

		// Verify migration
		const afterMigrate = get(manualCostBasisStore);
		expect(afterMigrate.get(legacyAddress.toLowerCase())).toBeUndefined();
		expect(afterMigrate.get(wrappedAddress.toLowerCase())).toBeDefined();

		const migrated = afterMigrate.get(wrappedAddress.toLowerCase())!;
		expect(migrated.tokenAddress).toBe(wrappedAddress.toLowerCase());
		expect(migrated.quantity).toBe(5);
		expect(migrated.costPerUnit).toBe(100);
		expect(migrated.totalCost).toBe(500);
		expect(migrated.note).toBe('original purchase');
	});

	it('migrateEntry is a no-op when source entry does not exist', async () => {
		const { manualCostBasisStore } = await import('$lib/stores/manualCostBasis');

		manualCostBasisStore.loadForWallet(wallet);

		// Migrate non-existent entry
		manualCostBasisStore.migrateEntry(legacyAddress, wrappedAddress);

		const entries = get(manualCostBasisStore);
		expect(entries.size).toBe(0);
	});

	it('migrateEntry is a no-op when no wallet is loaded', async () => {
		const { manualCostBasisStore } = await import('$lib/stores/manualCostBasis');

		// Don't load any wallet
		manualCostBasisStore.loadForWallet(null);

		// This should not throw
		manualCostBasisStore.migrateEntry(legacyAddress, wrappedAddress);

		const entries = get(manualCostBasisStore);
		expect(entries.size).toBe(0);
	});
});
