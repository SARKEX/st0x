import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — admin route gating (T-04-04-03 mitigation).
//
// hooks.server.ts:415-437 protects /admin/* (except /admin/login) by requiring a
// valid `auth-session` cookie + `auth-timestamp` cookie that pass
// verifySessionToken(). Missing/invalid => 303 redirect to /admin/login.
//
// Plus the bypass branch at 443-451: an admin session can satisfy
// requiresWalletRegistration() for /api/snapshots/* (page makes fetch calls).

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
	new Response('admin-area', { status: 200, headers: { 'Content-Type': 'text/plain' } });

describe('hooks.server admin-gate (T-04-04-03)', () => {
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

	it('rejects /admin without auth-session cookie => 303 redirect to /admin/login', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/admin/login');
		expect(mockVerifySession).not.toHaveBeenCalled();
	});

	it('rejects /admin/users with invalid auth-session token => 303 redirect', async () => {
		mockVerifySession.mockReturnValue(false);
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/admin/users',
			cookies: {
				'auth-session': 'invalid-token',
				'auth-timestamp': String(Date.now())
			}
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/admin/login');
		expect(mockVerifySession).toHaveBeenCalledTimes(1);
	});

	it('allows /admin with valid auth-session token (admin gate passes)', async () => {
		mockVerifySession.mockReturnValue(true);
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/admin',
			cookies: {
				'auth-session': 'valid-token-hex',
				'auth-timestamp': String(Date.now())
			}
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('admin-area');
	});

	it('rejects /admin with auth-session but missing/non-finite auth-timestamp', async () => {
		mockVerifySession.mockReturnValue(true);
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/admin',
			cookies: {
				'auth-session': 'valid-token-hex',
				'auth-timestamp': 'not-a-number'
			}
		});
		const response = await handle({ event, resolve: passthroughResolve });
		// Number.isFinite(NaN) is false => valid is false => redirect.
		expect(response.status).toBe(303);
		expect(mockVerifySession).not.toHaveBeenCalled();
	});

	it('admin session bypasses wallet-registration on /api/snapshots/* (admin-side fetch path)', async () => {
		mockVerifySession.mockReturnValue(true);
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: {
				'auth-session': 'valid',
				'auth-timestamp': String(Date.now())
			}
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		// Critical: admin-session bypass must NOT call into the wallet-registration check.
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('/admin/login is publicly reachable (so admin can authenticate in the first place)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin/login' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockVerifySession).not.toHaveBeenCalled();
	});

	it('admin-gate sets X-Frame-Options DENY on the redirect response', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin' });
		const response = await handle({ event, resolve: passthroughResolve });
		// addSecurityHeaders runs on the redirect path too — confirms the gate doesn't
		// leak responses without security headers.
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});
});
