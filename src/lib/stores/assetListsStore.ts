import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'st0x:asset-lists:v1';

export type AssetListsState = {
	favorites: string[];
	watchlist: string[];
};

const EMPTY: AssetListsState = { favorites: [], watchlist: [] };

export function normalizeListAddress(address: string): string {
	return address.trim().toLowerCase();
}

function uniqueNormalized(addresses: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const address of addresses) {
		if (typeof address !== 'string' || !address.trim()) continue;
		const key = normalizeListAddress(address);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
}

function readPersisted(): AssetListsState {
	if (!browser) return { ...EMPTY };
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...EMPTY };
		const parsed = JSON.parse(raw) as Partial<AssetListsState>;
		return {
			favorites: uniqueNormalized(Array.isArray(parsed.favorites) ? parsed.favorites : []),
			watchlist: uniqueNormalized(Array.isArray(parsed.watchlist) ? parsed.watchlist : [])
		};
	} catch {
		return { ...EMPTY };
	}
}

function persist(state: AssetListsState): void {
	if (!browser) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Quotas / privacy mode — degrade to in-memory only.
	}
}

function toggleMembership(list: string[], address: string): string[] {
	const key = normalizeListAddress(address);
	return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
}

/** Split a sorted asset list into Favorites → Watchlist → All (rest). */
export function partitionByLists<T>(
	items: T[],
	getKey: (item: T) => string,
	favorites: string[],
	watchlist: string[]
): { favorites: T[]; watchlist: T[]; rest: T[] } {
	const favSet = new Set(favorites.map(normalizeListAddress));
	const watchSet = new Set(watchlist.map(normalizeListAddress));
	const fav: T[] = [];
	const watch: T[] = [];
	const rest: T[] = [];

	for (const item of items) {
		const key = normalizeListAddress(getKey(item));
		if (favSet.has(key)) fav.push(item);
		else if (watchSet.has(key)) watch.push(item);
		else rest.push(item);
	}

	return { favorites: fav, watchlist: watch, rest };
}

function createAssetListsStore() {
	const { subscribe, update, set } = writable<AssetListsState>(readPersisted());

	return {
		subscribe,
		reset: () => {
			set({ ...EMPTY });
			persist({ ...EMPTY });
		},
		toggleFavorite: (address: string) => {
			update((state) => {
				const next = {
					...state,
					favorites: toggleMembership(state.favorites, address)
				};
				persist(next);
				return next;
			});
		},
		toggleWatch: (address: string) => {
			update((state) => {
				const next = {
					...state,
					watchlist: toggleMembership(state.watchlist, address)
				};
				persist(next);
				return next;
			});
		},
		isFavorite: (state: AssetListsState, address: string): boolean =>
			state.favorites.includes(normalizeListAddress(address)),
		isWatched: (state: AssetListsState, address: string): boolean =>
			state.watchlist.includes(normalizeListAddress(address))
	};
}

export const assetLists = createAssetListsStore();
