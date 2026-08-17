import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedRequest } from '$lib/stores/debouncedValue';

describe('createDebouncedRequest', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('publishes only the final value in a burst', () => {
		vi.useFakeTimers();
		const value = createDebouncedRequest<{ amount: string }>(300);

		value.set({ amount: 'first' });
		vi.advanceTimersByTime(200);
		value.set({ amount: 'second' });
		vi.advanceTimersByTime(299);

		expect(get(value)).toEqual({
			request: null,
			revision: 2,
			fingerprint: JSON.stringify({ amount: 'second' })
		});
		vi.advanceTimersByTime(1);
		expect(get(value)).toEqual({
			request: { amount: 'second' },
			revision: 2,
			fingerprint: JSON.stringify({ amount: 'second' })
		});
	});

	it('invalidates request A immediately so its late response cannot render for B', () => {
		vi.useFakeTimers();
		const value = createDebouncedRequest<{ amount: string }>(300);

		value.set({ amount: 'A' });
		vi.advanceTimersByTime(300);
		const requestA = get(value);
		expect(requestA).toEqual({
			request: { amount: 'A' },
			revision: 1,
			fingerprint: JSON.stringify({ amount: 'A' })
		});

		value.set({ amount: 'B' });
		const whileAResolves = get(value);
		expect(whileAResolves).toEqual({
			request: null,
			revision: 2,
			fingerprint: JSON.stringify({ amount: 'B' })
		});
		expect(whileAResolves.revision).not.toBe(requestA.revision);

		vi.advanceTimersByTime(300);
		expect(get(value)).toEqual({
			request: { amount: 'B' },
			revision: 2,
			fingerprint: JSON.stringify({ amount: 'B' })
		});
	});

	it('keeps the active revision for a semantically identical payload', () => {
		vi.useFakeTimers();
		const value = createDebouncedRequest<{ amount: string }>(300);

		value.set({ amount: '1' });
		vi.advanceTimersByTime(300);
		value.set({ amount: '1' });

		expect(get(value)).toEqual({
			request: { amount: '1' },
			revision: 1,
			fingerprint: JSON.stringify({ amount: '1' })
		});
	});

	it('uses the request fingerprint to avoid revision collisions across remounts', () => {
		vi.useFakeTimers();
		const firstMount = createDebouncedRequest<{ amount: string }>(300);
		const secondMount = createDebouncedRequest<{ amount: string }>(300);

		firstMount.set({ amount: '10' });
		secondMount.set({ amount: '999' });
		vi.advanceTimersByTime(300);

		expect(get(firstMount).revision).toBe(1);
		expect(get(secondMount).revision).toBe(1);
		expect(get(firstMount).fingerprint).not.toBe(get(secondMount).fingerprint);
	});
});
