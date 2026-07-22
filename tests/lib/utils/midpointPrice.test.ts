import { describe, it, expect } from 'vitest';
import {
	isValidTwoSided,
	pickBestBidAsk,
	resolveMidpoint,
	resolveMidpoints,
	type LastKnownMidpoint
} from '$lib/utils/midpointPrice';

describe('pickBestBidAsk', () => {
	it('merges variant entries taking the highest bid and lowest ask, ignoring blanks', () => {
		const merged = pickBestBidAsk([
			{ bid: 100, ask: 105 },
			{ bid: 101, ask: 104 }, // better on both sides
			{ ask: 106 }, // worse ask ignored
			undefined,
			{ bid: 0, ask: -1 } // non-positive ignored
		]);
		expect(merged).toEqual({ bid: 101, ask: 104 });
	});

	it('returns undefined sides when no positive values exist', () => {
		expect(pickBestBidAsk([{ bid: 0 }, undefined, {}])).toEqual({ bid: undefined, ask: undefined });
	});
});

describe('isValidTwoSided', () => {
	it('is true only when both bid and ask are finite and positive', () => {
		expect(isValidTwoSided(10, 11)).toBe(true);
		expect(isValidTwoSided(0, 11)).toBe(false);
		expect(isValidTwoSided(10, 0)).toBe(false);
		expect(isValidTwoSided(-1, 11)).toBe(false);
		expect(isValidTwoSided(10, undefined)).toBe(false);
		expect(isValidTwoSided(undefined, 11)).toBe(false);
		expect(isValidTwoSided(NaN, 11)).toBe(false);
		expect(isValidTwoSided(10, Infinity)).toBe(false);
	});
});

describe('resolveMidpoint', () => {
	const NOW = 1_700_000_000_000;

	it('returns a live midpoint when both sides are present and positive', () => {
		const { price, nextLastKnown } = resolveMidpoint({ bid: 100, ask: 102 }, undefined, NOW);
		expect(price.source).toBe('live');
		expect(price.price).toBe(101);
		expect(price.bid).toBe(100);
		expect(price.ask).toBe(102);
		expect(price.asOf).toBe(NOW);
		expect(nextLastKnown).toEqual({ mid: 101, bid: 100, ask: 102, updatedAt: NOW });
	});

	it('never derives a live price when one side is zero — falls back to last known', () => {
		const lastKnown: LastKnownMidpoint = { mid: 50, bid: 49, ask: 51, updatedAt: 123 };
		const { price, nextLastKnown } = resolveMidpoint({ bid: 0, ask: 102 }, lastKnown, NOW);
		expect(price.source).toBe('cached');
		expect(price.price).toBe(50);
		expect(price.bid).toBe(49);
		expect(price.ask).toBe(51);
		expect(price.asOf).toBe(123);
		// last known is preserved unchanged (we learned nothing new)
		expect(nextLastKnown).toBe(lastKnown);
	});

	it('falls back to last known when a side is missing entirely', () => {
		const lastKnown: LastKnownMidpoint = { mid: 50, bid: 49, ask: 51, updatedAt: 123 };
		const { price } = resolveMidpoint({ ask: 102 }, lastKnown, NOW);
		expect(price.source).toBe('cached');
		expect(price.price).toBe(50);
	});

	it('returns unavailable (N/A) when invalid and there is no cached price', () => {
		const { price, nextLastKnown } = resolveMidpoint({ bid: 0 }, undefined, NOW);
		expect(price.source).toBe('unavailable');
		expect(price.price).toBeNull();
		expect(price.asOf).toBeNull();
		expect(nextLastKnown).toBeUndefined();
	});

	it('still returns a midpoint for a crossed book (both sides positive)', () => {
		const { price } = resolveMidpoint({ bid: 103, ask: 101 }, undefined, NOW);
		expect(price.source).toBe('live');
		expect(price.price).toBe(102);
	});
});

describe('resolveMidpoints', () => {
	const NOW = 1_700_000_000_000;

	it('resolves each token, updates only live tokens in nextLastKnown, and counts live tokens', () => {
		const lastKnown: Record<string, LastKnownMidpoint> = {
			'0xaaa': { mid: 10, bid: 9, ask: 11, updatedAt: 1 },
			'0xbbb': { mid: 20, bid: 19, ask: 21, updatedAt: 2 }
		};
		const tokens = [
			{ address: '0xAAA', bid: 100, ask: 102 }, // live (mixed-case addr should normalize)
			{ address: '0xbbb', bid: 0, ask: 21 }, // invalid → cached fallback
			{ address: '0xccc' } // invalid, no history → unavailable
		];

		const { prices, nextLastKnown, liveCount } = resolveMidpoints(tokens, lastKnown, NOW);

		expect(prices['0xaaa'].source).toBe('live');
		expect(prices['0xaaa'].price).toBe(101);
		expect(prices['0xbbb'].source).toBe('cached');
		expect(prices['0xbbb'].price).toBe(20);
		expect(prices['0xccc'].source).toBe('unavailable');
		expect(prices['0xccc'].price).toBeNull();

		expect(liveCount).toBe(1);
		// live token updated
		expect(nextLastKnown['0xaaa']).toEqual({ mid: 101, bid: 100, ask: 102, updatedAt: NOW });
		// cached token's history preserved unchanged
		expect(nextLastKnown['0xbbb']).toEqual(lastKnown['0xbbb']);
		// unavailable token gains no history entry
		expect(nextLastKnown['0xccc']).toBeUndefined();
	});
});
