import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('auth.ts SEC-02 fail-closed', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalSessionSecret = process.env.SESSION_SECRET;

	beforeEach(() => {
		vi.resetModules();
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
		process.env.NODE_ENV = 'production';
		delete process.env.SESSION_SECRET;
		await expect(import('./auth')).rejects.toThrow(/SESSION_SECRET required in production/);
	});

	it('loads in dev/test mode without SESSION_SECRET', async () => {
		process.env.NODE_ENV = 'test';
		delete process.env.SESSION_SECRET;
		const mod = await import('./auth');
		expect(typeof mod.createSessionToken).toBe('function');
	});

	it('loads in production when SESSION_SECRET is set', async () => {
		process.env.NODE_ENV = 'production';
		process.env.SESSION_SECRET = 'test-secret-not-real';
		const mod = await import('./auth');
		const token = mod.createSessionToken(0);
		expect(token).toMatch(/^[a-f0-9]{64}$/);
	});
});
