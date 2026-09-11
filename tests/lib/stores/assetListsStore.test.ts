import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { assetLists, normalizeListAddress, partitionByLists } from '$lib/stores/assetListsStore';

describe('normalizeListAddress', () => {
	it('lowercases and trims', () => {
		expect(normalizeListAddress(' 0xAbC ')).toBe('0xabc');
	});
});

describe('partitionByLists', () => {
	const items = [
		{ id: 'a', address: '0xAAA' },
		{ id: 'b', address: '0xBBB' },
		{ id: 'c', address: '0xCCC' },
		{ id: 'd', address: '0xDDD' }
	];

	it('puts favorites first, watched (non-starred) second, rest last', () => {
		const result = partitionByLists(
			items,
			(item) => item.address,
			['0xccc', '0xaaa'],
			['0xbbb', '0xaaa']
		);

		expect(result.favorites.map((i) => i.id)).toEqual(['a', 'c']);
		expect(result.watchlist.map((i) => i.id)).toEqual(['b']);
		expect(result.rest.map((i) => i.id)).toEqual(['d']);
	});

	it('preserves input order within each section', () => {
		const result = partitionByLists(items, (item) => item.address, ['0xCCC', '0xAAA'], []);
		expect(result.favorites.map((i) => i.id)).toEqual(['a', 'c']);
	});
});

describe('assetLists store', () => {
	afterEach(() => {
		assetLists.reset();
		localStorage.clear();
	});

	it('toggles favorites independently of watchlist', () => {
		assetLists.toggleFavorite('0xAbC');
		assetLists.toggleWatch('0xAbC');

		let state = get(assetLists);
		expect(state.favorites).toEqual(['0xabc']);
		expect(state.watchlist).toEqual(['0xabc']);
		expect(assetLists.isFavorite(state, '0xABC')).toBe(true);
		expect(assetLists.isWatched(state, '0xabc')).toBe(true);

		assetLists.toggleFavorite('0xabc');
		state = get(assetLists);
		expect(state.favorites).toEqual([]);
		expect(state.watchlist).toEqual(['0xabc']);
	});

	it('persists to localStorage', () => {
		assetLists.toggleFavorite('0x111');
		assetLists.toggleWatch('0x222');

		const raw = localStorage.getItem('st0x:asset-lists:v1');
		expect(raw).toBeTruthy();
		expect(JSON.parse(raw!)).toEqual({
			favorites: ['0x111'],
			watchlist: ['0x222']
		});
	});
});
