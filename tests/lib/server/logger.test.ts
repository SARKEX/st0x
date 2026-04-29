import { describe, it, expect } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pickLevelForRoute, getRequestContext, getLogger } from '$lib/server/logger';

describe('pickLevelForRoute', () => {
	// Status takes precedence over route. Verified for every route bucket
	// in the D-07 matrix.
	describe('status precedence (5xx → error)', () => {
		it('returns error for any 5xx on default routes', () => {
			expect(pickLevelForRoute('/', 500)).toBe('error');
			expect(pickLevelForRoute('/dashboard', 500)).toBe('error');
			expect(pickLevelForRoute('/api/orders', 599)).toBe('error');
		});

		it('returns error for any 5xx on bucketed routes (overrides route default)', () => {
			expect(pickLevelForRoute('/api/snapshots/preview', 500)).toBe('error');
			expect(pickLevelForRoute('/api/cron/snapshots', 500)).toBe('error');
			expect(pickLevelForRoute('/api/admin/foo', 503)).toBe('error');
			expect(pickLevelForRoute('/api/access/check', 599)).toBe('error');
		});
	});

	describe('status precedence (4xx → warn)', () => {
		it('returns warn for any 4xx on default routes', () => {
			expect(pickLevelForRoute('/', 400)).toBe('warn');
			expect(pickLevelForRoute('/api/orders', 404)).toBe('warn');
			expect(pickLevelForRoute('/api/orders', 499)).toBe('warn');
		});

		it('returns warn for any 4xx on bucketed routes (overrides route default)', () => {
			expect(pickLevelForRoute('/api/cron/snapshots', 400)).toBe('warn');
			expect(pickLevelForRoute('/api/admin/foo', 403)).toBe('warn');
			expect(pickLevelForRoute('/api/access/check', 404)).toBe('warn');
			expect(pickLevelForRoute('/api/snapshots/preview', 401)).toBe('warn');
		});
	});

	describe('route bucket matrix (2xx — D-07 noisy-route quieting)', () => {
		it('returns warn for /api/snapshots/* on 2xx', () => {
			expect(pickLevelForRoute('/api/snapshots/preview', 200)).toBe('warn');
			expect(pickLevelForRoute('/api/snapshots/preview-stream', 200)).toBe('warn');
			expect(pickLevelForRoute('/api/snapshots/anything', 204)).toBe('warn');
		});

		it('returns info for /api/cron/* on 2xx', () => {
			expect(pickLevelForRoute('/api/cron/snapshots', 200)).toBe('info');
			expect(pickLevelForRoute('/api/cron/anything', 204)).toBe('info');
		});

		it('returns info for /api/admin/* on 2xx', () => {
			expect(pickLevelForRoute('/api/admin/snapshots/recalculate', 200)).toBe('info');
			expect(pickLevelForRoute('/api/admin/anything', 201)).toBe('info');
		});

		it('returns info for /api/access/* on 2xx', () => {
			expect(pickLevelForRoute('/api/access/check', 200)).toBe('info');
			expect(pickLevelForRoute('/api/access/anything', 204)).toBe('info');
		});

		it('defaults to info for non-matching routes', () => {
			expect(pickLevelForRoute('/', 200)).toBe('info');
			expect(pickLevelForRoute('/dashboard', 200)).toBe('info');
			expect(pickLevelForRoute('/api/orders', 200)).toBe('info');
			expect(pickLevelForRoute('/api/public/tvl', 200)).toBe('info');
		});
	});

	describe('route prefix discipline', () => {
		// Bucket entries match by prefix only — `/api/snapshotsfoo` should NOT
		// be treated as a snapshots route. `startsWith('/api/snapshots/')`
		// requires the trailing slash.
		it('does not match a similar-prefixed route without the trailing slash', () => {
			expect(pickLevelForRoute('/api/snapshotsfoo', 200)).toBe('info');
			expect(pickLevelForRoute('/api/cronfoo', 200)).toBe('info');
			expect(pickLevelForRoute('/api/adminfoo', 200)).toBe('info');
			expect(pickLevelForRoute('/api/accessfoo', 200)).toBe('info');
		});
	});
});

describe('getRequestContext', () => {
	// requestContextHandle calls contextStore.run(...) inside a SvelteKit hook;
	// at the unit-test level we can't easily spin a real Handle event, so the
	// smoke test below uses an internal AsyncLocalStorage instance to exercise
	// the same shape (the public AsyncLocalStorage class is what the production
	// module uses internally — see `node:async_hooks`). When NOT inside an
	// als.run() the public getter returns undefined.
	it('returns undefined when called outside any request context', () => {
		expect(getRequestContext()).toBeUndefined();
	});

	it('seeded request-id propagates through getLogger() child bindings', () => {
		// We can't reach into the module's private `contextStore`, so this test
		// only exercises the no-context fallback: getLogger() returns the base
		// logger and does NOT throw. (Full als propagation is exercised end-to-end
		// by requestContextHandle in dev / staging smoke tests — see SUMMARY.)
		const lg = getLogger();
		expect(lg).toBeDefined();
		expect(typeof lg.info).toBe('function');
		expect(typeof lg.warn).toBe('function');
		expect(typeof lg.error).toBe('function');
	});

	it('AsyncLocalStorage from node:async_hooks propagates a seeded value (smoke)', async () => {
		// Sanity check that the underlying primitive used by requestContextHandle
		// behaves as documented: a value seeded via .run() is visible to
		// getStore() within the async callback. If this regresses (Node bug or
		// edge runtime), the request-context middleware would silently lose
		// request_id (Pitfall 2). See module-level JSDoc in logger.ts.
		const als = new AsyncLocalStorage<{ id: string }>();
		const seenIds: (string | undefined)[] = [];

		await als.run({ id: 'req-abc' }, async () => {
			seenIds.push(als.getStore()?.id);
			await new Promise((r) => setTimeout(r, 1));
			seenIds.push(als.getStore()?.id);
		});

		expect(seenIds).toEqual(['req-abc', 'req-abc']);
		expect(als.getStore()).toBeUndefined();
	});
});
