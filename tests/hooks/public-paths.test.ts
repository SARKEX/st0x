import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — public-path classification before auth.
//
// hooks.server.ts lists the paths that bypass the admin gate. Regressions here
// are critical: marking an admin path public would silently expose protected
// data; marking a public path private would break login. Each invariant gets a
// named `it` below.

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

const { mockVerifySession } = vi.hoisted(() => ({
	mockVerifySession: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ verifySessionToken: mockVerifySession }));

const passthroughResolve = async () =>
	new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

describe('hooks.server PUBLIC_PATHS classification', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockVerifySession.mockReturnValue(false);
	});

	async function loadHandle() {
		const { handle } = await import('../../src/hooks.server');
		return handle;
	}

	it('/api/public/* is public — bypasses auth', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/public/leaderboard' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('/api/auth/session is public (SEC-03 self-checking — circular if gated)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/auth/session', method: 'POST' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('/api/auth/session/challenge is public (SEC-03)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/auth/session/challenge',
			method: 'POST'
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('/api/auth/logout is public (cookie-clearing endpoint)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/auth/logout', method: 'POST' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('/docs/* is public', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/docs/getting-started' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('/admin/login is public (so admins CAN log in)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin/login' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockVerifySession).not.toHaveBeenCalled();
	});

	it('/admin (other than /admin/login) is NOT public — admin gate runs', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin' });
		const response = await handle({ event, resolve: passthroughResolve });
		// No auth-session cookie => redirect to /admin/login (303).
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/admin/login');
	});

	it('protected page / (root) is NOT public — wallet gate runs (no session => 200, lets client-side handle)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/' });
		const response = await handle({ event, resolve: passthroughResolve });
		// No wallet, page (not API) => proceed (per source comment "client-side will redirect")
		expect(response.status).toBe(200);
	});

	it('public path classification short-circuits to allow (no admin gate)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/public/leaderboard',
			cookies: { session: 'a'.repeat(64) }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		// Public paths must never reach the admin auth gate.
		expect(mockVerifySession).not.toHaveBeenCalled();
	});
});
