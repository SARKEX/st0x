import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// SEC-02 fail-closed test: mock both `$app/environment` and `$env/dynamic/private`.
// (a) `$app/environment` — Vite's resolution of `esm-env/dev-fallback.js` caches
//     `dev` at first node_modules transform; vitest's `vi.resetModules()` does not
//     re-evaluate node_modules, so the `dev` branch cannot be driven via NODE_ENV
//     alone. The mock exposes a live getter backed by a hoisted ref.
// (b) `$env/dynamic/private` — SvelteKit's runtime env proxy is not wired in vitest
//     by default. Mock it to read live from process.env via a Proxy so each test
//     can set/delete process.env.SESSION_SECRET freely.
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

describe('auth.ts SEC-02 fail-closed', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalSessionSecret = process.env.SESSION_SECRET;

	beforeEach(() => {
		vi.resetModules();
		devRef.value = true;
		process.env.NODE_ENV = 'test';
		delete process.env.SESSION_SECRET;
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
		if (originalSessionSecret !== undefined) {
			process.env.SESSION_SECRET = originalSessionSecret;
		} else {
			delete process.env.SESSION_SECRET;
		}
	});

	it('throws at module load when SESSION_SECRET missing in production', async () => {
		devRef.value = false;
		delete process.env.SESSION_SECRET;
		await expect(import('./auth')).rejects.toThrow(/SESSION_SECRET required in production/);
	});

	it('loads in dev/test mode without SESSION_SECRET', async () => {
		devRef.value = true;
		delete process.env.SESSION_SECRET;
		const mod = await import('./auth');
		expect(typeof mod.createSessionToken).toBe('function');
	});

	it('loads in production when SESSION_SECRET is set', async () => {
		devRef.value = false;
		process.env.SESSION_SECRET = 'test-secret-not-real';
		const mod = await import('./auth');
		const token = mod.createSessionToken(0);
		expect(token).toMatch(/^[a-f0-9]{64}$/);
	});
});
