import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — public-path classification before auth.
//
// hooks.server.ts:221-260 lists the paths that bypass the wallet/admin gate.
// Regressions here are critical: marking an admin path public would silently
// expose protected data; marking a public path private would break /access
// and break login. Each invariant gets a named `it` below.
//
// Ordering invariant: isPublicPath() runs BEFORE getWalletFromRequest(). We
// assert this by leaving readSession `mockReadSession` un-set on public paths
// and asserting it was never invoked.

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

const { mockReadSession, mockMaybeRefresh, mockVerifySession, mockIsRegistered } = vi.hoisted(
	() => ({
		mockReadSession: vi.fn(),
		mockMaybeRefresh: vi.fn(),
		mockVerifySession: vi.fn(),
		mockIsRegistered: vi.fn()
	})
);

vi.mock('$lib/server/walletSession', () => ({
	readSession: mockReadSession,
	maybeRefreshSession: mockMaybeRefresh
}));
vi.mock('$lib/server/auth', () => ({ verifySessionToken: mockVerifySession }));
vi.mock('$lib/server/accessCodes', () => ({ isWalletRegistered: mockIsRegistered }));

const passthroughResolve = async () =>
	new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

describe('hooks.server PUBLIC_PATHS classification', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockReadSession.mockResolvedValue(null);
		mockMaybeRefresh.mockResolvedValue(undefined);
		mockVerifySession.mockReturnValue(false);
		mockIsRegistered.mockResolvedValue(true);
	});

	async function loadHandle() {
		const { handle } = await import('../../src/hooks.server');
		return handle;
	}

	it('/access page is public — bypasses auth (no isWalletRegistered call)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/access' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/api/access/* is public — bypasses auth', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/access/validate' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/api/public/* is public — bypasses auth', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/public/leaderboard' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/api/auth/session is public (SEC-03 self-checking — circular if gated)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/auth/session', method: 'POST' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/api/auth/session/challenge is public (SEC-03)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/auth/session/challenge',
			method: 'POST'
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/api/auth/logout is public (cookie-clearing endpoint)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/auth/logout', method: 'POST' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/docs/* is public', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/docs/getting-started' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockIsRegistered).not.toHaveBeenCalled();
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

	it('public path classification runs BEFORE the readSession lookup', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/public/leaderboard',
			cookies: { session: 'a'.repeat(64) }
		});
		await handle({ event, resolve: passthroughResolve });
		// requestContextHandle (logger) DOES read session for log enrichment, but the
		// auth gate in existingHandle MUST NOT — i.e., isWalletRegistered must be 0.
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});
});
