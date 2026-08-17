import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedValue } from '$lib/stores/debouncedValue';

describe('createDebouncedValue', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('publishes only the final value in a burst', () => {
		vi.useFakeTimers();
		const value = createDebouncedValue('initial', 300);

		value.set('first');
		vi.advanceTimersByTime(200);
		value.set('second');
		vi.advanceTimersByTime(299);

		expect(get(value)).toBe('initial');
		vi.advanceTimersByTime(1);
		expect(get(value)).toBe('second');
	});

	it('cancels a pending value when cleared immediately', () => {
		vi.useFakeTimers();
		const value = createDebouncedValue<string | null>(null, 300);

		value.set('quote');
		value.setImmediately(null);
		vi.runAllTimers();

		expect(get(value)).toBeNull();
	});
});
