import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const { getKvMock } = vi.hoisted(() => ({
	getKvMock: vi.fn()
}));

vi.mock('$lib/server/kv', () => ({
	getKv: getKvMock
}));

import { withCache, withConditionalCache } from './cache';

afterEach(() => {
	vi.useRealTimers();
});

describe('withConditionalCache — stampede protection', () => {
	beforeEach(() => {
		getKvMock.mockReset();
		getKvMock.mockResolvedValue(null);
	});

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

describe('withCache — distributed stampede protection', () => {
	beforeEach(() => {
		getKvMock.mockReset();
	});

	it('waits for the shared result when another instance owns the lock', async () => {
		const shared = { value: 42 };
		const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(shared));
		const client = {
			get,
			set: vi.fn(async () => null),
			del: vi.fn(),
			eval: vi.fn()
		};
		getKvMock.mockResolvedValue(client);
		const compute = vi.fn(async () => ({ value: 99 }));

		await expect(
			withCache('distributed-wait', compute, 60, () => true, {
				lockTtlMs: 1_000,
				waitTimeoutMs: 500,
				pollMs: 10
			})
		).resolves.toEqual(shared);

		expect(compute).not.toHaveBeenCalled();
		expect(client.set).toHaveBeenCalledWith('distributed-wait:compute-lock', expect.any(String), {
			NX: true,
			PX: 1_000
		});
		expect(client.eval).not.toHaveBeenCalled();
	});

	it('writes a complete result before releasing an acquired shared lock', async () => {
		const events: string[] = [];
		const client = {
			get: vi.fn(async () => null),
			set: vi.fn(async (_key: string, _value: string, options: Record<string, unknown>) => {
				if ('NX' in options) {
					events.push('lock');
					return 'OK';
				}
				events.push('cache');
				return 'OK';
			}),
			del: vi.fn(),
			eval: vi.fn(async () => {
				events.push('release');
				return 1;
			})
		};
		getKvMock.mockResolvedValue(client);
		const compute = vi.fn(async () => ({ value: 42 }));

		await expect(
			withCache('distributed-owner', compute, 60, () => true, {
				lockTtlMs: 1_000,
				waitTimeoutMs: 500,
				pollMs: 10
			})
		).resolves.toEqual({ value: 42 });

		expect(compute).toHaveBeenCalledOnce();
		expect(events).toEqual(['lock', 'cache', 'release']);
		expect(client.eval).toHaveBeenCalledWith(expect.any(String), {
			keys: ['distributed-owner:compute-lock'],
			arguments: [expect.any(String)]
		});
	});

	it('fails open without wedging when Redis does not settle', async () => {
		vi.useFakeTimers();
		getKvMock.mockImplementation(() => new Promise(() => undefined));
		const compute = vi.fn(async () => ({ value: 42 }));

		const result = withCache('stalled-redis', compute, 60, () => true, {
			lockTtlMs: 120_000,
			waitTimeoutMs: 95_000
		});
		await vi.advanceTimersByTimeAsync(15_000);

		await expect(result).resolves.toEqual({ value: 42 });
		expect(compute).toHaveBeenCalledOnce();
	});
});
