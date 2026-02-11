import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface ManualCostBasisEntry {
	tokenAddress: string;
	quantity: number; // How many tokens this cost basis applies to
	costPerUnit: number; // Manual cost basis per unit (0 = gift/airdrop)
	totalCost: number; // quantity * costPerUnit
	note?: string; // Optional note (e.g., "gift", "purchased on Coinbase")
	createdAt: number; // Timestamp
	updatedAt: number; // Timestamp
}

// Map of tokenAddress -> ManualCostBasisEntry
type ManualCostBasisMap = Map<string, ManualCostBasisEntry>;

// Store keyed by wallet address
const STORAGE_KEY_PREFIX = 'st0x:manualCostBasis:';

function getStorageKey(walletAddress: string): string {
	return `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

function loadFromStorage(walletAddress: string): ManualCostBasisMap {
	if (!browser || !walletAddress) return new Map();

	try {
		const stored = localStorage.getItem(getStorageKey(walletAddress));
		if (!stored) return new Map();

		const parsed = JSON.parse(stored) as [string, ManualCostBasisEntry][];
		return new Map(parsed);
	} catch {
		return new Map();
	}
}

function saveToStorage(walletAddress: string, entries: ManualCostBasisMap): void {
	if (!browser || !walletAddress) return;

	try {
		const serialized = JSON.stringify(Array.from(entries.entries()));
		localStorage.setItem(getStorageKey(walletAddress), serialized);
	} catch (e) {
		console.error('Failed to save manual cost basis to localStorage:', e);
	}
}

function createManualCostBasisStore() {
	const store = writable<ManualCostBasisMap>(new Map());
	let currentWallet: string | null = null;

	return {
		subscribe: store.subscribe,

		loadForWallet(walletAddress: string | null): void {
			if (!walletAddress) {
				store.set(new Map());
				currentWallet = null;
				return;
			}

			currentWallet = walletAddress.toLowerCase();
			const entries = loadFromStorage(currentWallet);
			store.set(entries);
		},

		getEntry(tokenAddress: string): ManualCostBasisEntry | undefined {
			const entries = get(store);
			return entries.get(tokenAddress.toLowerCase());
		},

		setEntry(entry: Omit<ManualCostBasisEntry, 'createdAt' | 'updatedAt'>): void {
			if (!currentWallet) return;

			const entries = get(store);
			const normalizedAddress = entry.tokenAddress.toLowerCase();
			const existing = entries.get(normalizedAddress);

			const now = Date.now();
			const newEntry: ManualCostBasisEntry = {
				...entry,
				tokenAddress: normalizedAddress,
				totalCost: entry.quantity * entry.costPerUnit,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			};

			entries.set(normalizedAddress, newEntry);
			store.set(new Map(entries));
			saveToStorage(currentWallet, entries);
		},

		removeEntry(tokenAddress: string): void {
			if (!currentWallet) return;

			const entries = get(store);
			entries.delete(tokenAddress.toLowerCase());
			store.set(new Map(entries));
			saveToStorage(currentWallet, entries);
		},

		/** Migrate an entry from one token address to another (e.g., legacy → wrapped) */
		migrateEntry(fromAddress: string, toAddress: string): void {
			if (!currentWallet) return;

			const entries = get(store);
			const normalizedFrom = fromAddress.toLowerCase();
			const normalizedTo = toAddress.toLowerCase();

			const existing = entries.get(normalizedFrom);
			if (!existing) return;

			// Move entry to the new address
			const migrated: ManualCostBasisEntry = {
				...existing,
				tokenAddress: normalizedTo,
				updatedAt: Date.now()
			};

			entries.set(normalizedTo, migrated);
			entries.delete(normalizedFrom);
			store.set(new Map(entries));
			saveToStorage(currentWallet, entries);
		},

		clearAll(): void {
			if (!currentWallet) return;

			store.set(new Map());
			saveToStorage(currentWallet, new Map());
		}
	};
}

export const manualCostBasisStore = createManualCostBasisStore();
