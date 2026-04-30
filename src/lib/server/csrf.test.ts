import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// SEC-02 fail-closed test: mock both `$app/environment` and `$env/dynamic/private`.
// Same boilerplate as auth.test.ts — see that file for the rationale.
// Round-trip coverage on session-bound CSRF lives in Plan 03-08a (SEC-04) which
// will replace generateCsrfToken/validateCsrfToken with session-bound variants.
const { devRef } = vi.hoisted(() => ({ devRef: { value: true } }));

vi.mock('$app/environment', () => ({
	get dev() {
		return devRef.value;
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy(
		{},
		{
			get: (_target, key: string) => process.env[key]
		}
	)
}));

describe('csrf.ts SEC-02 fail-closed', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalSessionSecret = process.env.SESSION_SECRET;
	const originalCsrfSecret = process.env.CSRF_SECRET;

	beforeEach(() => {
		vi.resetModules();
		devRef.value = true;
		process.env.NODE_ENV = 'test';
		delete process.env.SESSION_SECRET;
		delete process.env.CSRF_SECRET;
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
		if (originalSessionSecret !== undefined) {
			process.env.SESSION_SECRET = originalSessionSecret;
		} else {
			delete process.env.SESSION_SECRET;
		}
		if (originalCsrfSecret !== undefined) {
			process.env.CSRF_SECRET = originalCsrfSecret;
		} else {
			delete process.env.CSRF_SECRET;
		}
	});

	it('throws at module load when both CSRF_SECRET and SESSION_SECRET missing in production', async () => {
		devRef.value = false;
		await expect(import('./csrf')).rejects.toThrow(
			/CSRF_SECRET or SESSION_SECRET required in production/
		);
	});

	it('loads in production when SESSION_SECRET is set (A4 aliasing)', async () => {
		devRef.value = false;
		process.env.SESSION_SECRET = 'test-session-secret';
		const mod = await import('./csrf');
		expect(mod).toBeDefined();
	});

	it('loads in production when only CSRF_SECRET is set', async () => {
		devRef.value = false;
		process.env.CSRF_SECRET = 'test-csrf-secret';
		const mod = await import('./csrf');
		expect(mod).toBeDefined();
	});

	it('loads in dev/test without either secret', async () => {
		devRef.value = true;
		const mod = await import('./csrf');
		expect(mod).toBeDefined();
	});
});
