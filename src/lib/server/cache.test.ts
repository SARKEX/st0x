import { describe, it, expect, vi } from 'vitest';

// No Redis in tests → getKv resolves to null, so every call takes the
// "cache miss → compute" path. That's exactly the cold path where a
// stampede would occur.
vi.mock('$lib/server/kv', () => ({
	getKv: vi.fn(async () => null)
}));

import { withConditionalCache } from './cache';

describe('withConditionalCache — stampede protection', () => {
	it('runs the computation only once for concurrent calls with the same key', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			await new Promise((r) => setTimeout(r, 20));
			return { value: 42 };
		};

		const results = await Promise.all([
			withConditionalCache('stampede-key', fn, () => true, 60),
			withConditionalCache('stampede-key', fn, () => true, 60),
			withConditionalCache('stampede-key', fn, () => true, 60)
		]);

		expect(calls).toBe(1);
		for (const r of results) {
			expect(r).toEqual({ value: 42 });
		}
	});

	it('releases the lock so a later (serial) call recomputes — no permanent wedging', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			return calls;
		};

		await withConditionalCache('release-key', fn, () => true, 60);
		await withConditionalCache('release-key', fn, () => true, 60);

		expect(calls).toBe(2);
	});

	it('releases the lock even when the computation throws', async () => {
		const boom = async () => {
			throw new Error('upstream failed');
		};

		await expect(withConditionalCache('throw-key', boom, () => true, 60)).rejects.toThrow(
			'upstream failed'
		);

		// A subsequent call must be able to run again (lock not wedged by the rejection).
		let ran = false;
		const ok = async () => {
			ran = true;
			return 'recovered';
		};
		await expect(withConditionalCache('throw-key', ok, () => true, 60)).resolves.toBe('recovered');
		expect(ran).toBe(true);
	});
});
