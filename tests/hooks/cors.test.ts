import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — CORS classification, preflight handling, header allowlist.
//
// SUT: src/hooks.server.ts `handle` (the sequence(requestContext, sentry, existing)).
// We mock the auth/session deps so the CORS layer is isolated. Sentry is globally
// stubbed in vitest-setup.ts (sentryHandle = passthrough); we further mock
// $env/dynamic/private to control VERCEL_URL and $app/environment to keep `dev`
// at false (so localhost/HSTS branches aren't accidentally exercised here).

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

describe('hooks.server CORS', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		delete process.env.VERCEL_URL;
	});

	async function loadHandle() {
		const mod = await import('../../src/hooks.server');
		return mod.handle;
	}

	const passthroughResolve = async (_event: unknown) =>
		new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

	it('allows production domain https://st0x.io for internal API requests', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://st0x.io' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://st0x.io');
	});

	it('allows production domain https://www.st0x.io', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://www.st0x.io' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://www.st0x.io');
	});

	it('allows Vercel preview origin from VERCEL_URL env', async () => {
		process.env.VERCEL_URL = 'st0x-pr-42.vercel.app';
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://st0x-pr-42.vercel.app' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://st0x-pr-42.vercel.app'
		);
	});

	it('public endpoint /api/public/* allows any origin (Access-Control-Allow-Origin: *)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/public/health',
			headers: { Origin: 'https://random-third-party.example.com' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('rejects unknown origin for protected internal API path (no ACAO header echoed)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://evil.example.com' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	it('OPTIONS preflight returns 204 with Allow-Methods + Allow-Headers + Max-Age', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			method: 'OPTIONS',
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://st0x.io' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
		const allowedHeaders = response.headers.get('Access-Control-Allow-Headers') ?? '';
		expect(allowedHeaders).toContain('Content-Type');
		expect(allowedHeaders).toContain('Authorization');
		expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
	});

	it('OPTIONS preflight from disallowed origin returns 403', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			method: 'OPTIONS',
			pathname: '/api/snapshots/foo',
			headers: { Origin: 'https://evil.example.com' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(403);
	});

	it('exposes rate-limit headers via Access-Control-Expose-Headers on API responses', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/public/health',
			headers: { Origin: 'https://anyone.example.com' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		const exposed = response.headers.get('Access-Control-Expose-Headers') ?? '';
		expect(exposed).toContain('X-RateLimit-Remaining');
		expect(exposed).toContain('Retry-After');
	});
});
