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

describe('SEC-04 session-bound CSRF', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalSessionSecret = process.env.SESSION_SECRET;
	const originalCsrfSecret = process.env.CSRF_SECRET;

	beforeEach(() => {
		vi.resetModules();
		devRef.value = true;
		process.env.NODE_ENV = 'test';
		// Provide a stable test secret so module-load doesn't need fail-closed pathway
		process.env.SESSION_SECRET = 'sec-04-test-session-secret';
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

	it('round-trip: generateCsrfTokenForSession + validateCsrfTokenForSession returns true (32-hex-char token)', async () => {
		const { generateCsrfTokenForSession, validateCsrfTokenForSession } = await import('./csrf');
		const sessionId = 'a'.repeat(64);
		const token = generateCsrfTokenForSession(sessionId);
		expect(token).toMatch(/^[a-f0-9]{32}$/);
		expect(validateCsrfTokenForSession(token, sessionId)).toBe(true);
	});

	it('cross-session token rejected (HMAC mismatch)', async () => {
		const { generateCsrfTokenForSession, validateCsrfTokenForSession } = await import('./csrf');
		const tokenA = generateCsrfTokenForSession('session-A');
		expect(validateCsrfTokenForSession(tokenA, 'session-B')).toBe(false);
	});

	it('missing inputs rejected (defensive)', async () => {
		const { generateCsrfTokenForSession, validateCsrfTokenForSession } = await import('./csrf');
		const sessionId = 'session-id';
		const token = generateCsrfTokenForSession(sessionId);
		expect(validateCsrfTokenForSession('', sessionId)).toBe(false);
		expect(validateCsrfTokenForSession(token, '')).toBe(false);
		expect(validateCsrfTokenForSession(token, undefined as never)).toBe(false);
		expect(validateCsrfTokenForSession(undefined as never, sessionId)).toBe(false);
	});

	it('length-mismatched token rejected before timingSafeEqual is called', async () => {
		const { validateCsrfTokenForSession } = await import('./csrf');
		// Short token cannot match a 32-hex-char HMAC
		expect(validateCsrfTokenForSession('short', 'any-session-id')).toBe(false);
	});

	it('uses crypto.timingSafeEqual for constant-time compare', async () => {
		const crypto = await import('crypto');
		const spy = vi.spyOn(crypto.default, 'timingSafeEqual');
		const { generateCsrfTokenForSession, validateCsrfTokenForSession } = await import('./csrf');

		const sessionId = 'spy-session-id';
		const token = generateCsrfTokenForSession(sessionId);
		validateCsrfTokenForSession(token, sessionId);

		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
