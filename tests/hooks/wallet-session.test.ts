import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent, createMockSession } from './_helpers';

// Plan 04-04 / TEST-01 — SEC-03+04 wallet-session classification + D-04 atomic-flip
// invariant + D-04b "never re-signs per request" guarantee.
//
// PRIMARY INVARIANT (D-04 atomic flip, hooks.server.ts:275-296 + Plan 03-08b):
//   Authentication is established by the server-issued `session` cookie + KV record.
//   The legacy client-set `wallet-address` cookie is NOT trusted as auth proof.
//   Future regression that re-introduces wallet-address-cookie trust MUST fail here.
//
// PROTECTED PATH USED FOR ASSERTIONS:
//   /api/snapshots/* — listed in requiresWalletRegistration() at hooks.server.ts:265.
//   API path => no-wallet => 401 JSON; wallet => isWalletRegistered check.

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

const {
	mockReadSession,
	mockMaybeRefresh,
	mockVerifySession,
	mockIsRegistered,
	mockVerifyWalletSignature
} = vi.hoisted(() => ({
	mockReadSession: vi.fn(),
	mockMaybeRefresh: vi.fn(),
	mockVerifySession: vi.fn(),
	mockIsRegistered: vi.fn(),
	// D-04b: this MUST never be called per-request. We mock the auth/accessCodes
	// modules and assert the spy stays at zero.
	mockVerifyWalletSignature: vi.fn()
}));

vi.mock('$lib/server/walletSession', () => ({
	readSession: mockReadSession,
	maybeRefreshSession: mockMaybeRefresh
}));
vi.mock('$lib/server/auth', () => ({
	verifySessionToken: mockVerifySession,
	verifyWalletSignature: mockVerifyWalletSignature
}));
vi.mock('$lib/server/accessCodes', () => ({ isWalletRegistered: mockIsRegistered }));

const passthroughResolve = async () =>
	new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

describe('hooks.server wallet-session (SEC-03+04, D-04 atomic flip)', () => {
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

	it('valid session cookie + matching KV record => readSession invoked, request proceeds', async () => {
		const { sessionId, record } = createMockSession({
			walletAddress: '0xAbC0000000000000000000000000000000000001'
		});
		mockReadSession.mockResolvedValue(record);
		mockIsRegistered.mockResolvedValue(true);

		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: { session: sessionId }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
		expect(mockReadSession).toHaveBeenCalledWith(sessionId);
		expect(mockIsRegistered).toHaveBeenCalledWith(record.walletAddress);
	});

	it('missing session cookie on protected API path => 401 JSON (Authentication required)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/snapshots/foo' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toMatch(/Authentication required/);
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('expired session (KV returns null) => 401, NO verifyWalletSignature call (D-04b)', async () => {
		const { sessionId } = createMockSession({
			walletAddress: '0xAbC0000000000000000000000000000000000002'
		});
		mockReadSession.mockResolvedValue(null);

		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: { session: sessionId }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(401);
		// D-04b: per-request path NEVER re-prompts/re-verifies wallet signature.
		expect(mockVerifyWalletSignature).not.toHaveBeenCalled();
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('legacy wallet-address cookie WITHOUT session cookie is NOT authoritative (D-04 atomic flip)', async () => {
		// CRITICAL REGRESSION GUARD: a future change that re-introduces trust in the
		// legacy `wallet-address` cookie would silently bypass auth. This test pins
		// that hooks.server.ts ONLY consults the `session` cookie + KV.
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: {
				'wallet-address': '0xAbC0000000000000000000000000000000000003'
			}
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(401);
		expect(mockReadSession).not.toHaveBeenCalled();
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('malformed session cookie (not 64-hex) => readSession not called, 401 returned', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: { session: 'not-a-valid-hex-id' }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(401);
		// Regex guard at hooks.server.ts:290 stops malformed IDs from hitting KV.
		expect(mockReadSession).not.toHaveBeenCalled();
	});

	it('valid session but unregistered wallet => 401 with "Wallet not registered" body', async () => {
		const { sessionId, record } = createMockSession({
			walletAddress: '0xAbC0000000000000000000000000000000000004'
		});
		mockReadSession.mockResolvedValue(record);
		mockIsRegistered.mockResolvedValue(false);

		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: { session: sessionId }
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toMatch(/Wallet not registered/);
	});

	it('per-request path NEVER calls verifyWalletSignature across multiple invocations (D-04b)', async () => {
		const { sessionId, record } = createMockSession({
			walletAddress: '0xAbC0000000000000000000000000000000000005'
		});
		mockReadSession.mockResolvedValue(record);

		const handle = await loadHandle();
		for (let i = 0; i < 5; i++) {
			const event = createMockRequestEvent({
				pathname: '/api/snapshots/foo',
				cookies: { session: sessionId }
			});
			await handle({ event, resolve: passthroughResolve });
		}
		expect(mockVerifyWalletSignature).toHaveBeenCalledTimes(0);
	});

	it('readSession success triggers fire-and-forget maybeRefreshSession (D-04a sliding TTL)', async () => {
		const { sessionId, record } = createMockSession({
			walletAddress: '0xAbC0000000000000000000000000000000000006'
		});
		mockReadSession.mockResolvedValue(record);

		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/api/snapshots/foo',
			cookies: { session: sessionId }
		});
		await handle({ event, resolve: passthroughResolve });
		expect(mockMaybeRefresh).toHaveBeenCalledWith(sessionId, record);
	});

	it('protected page (/) without session DOES NOT 401 — lets client-side handle redirect', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/' });
		const response = await handle({ event, resolve: passthroughResolve });
		// Source comment: "For pages, allow through - client-side will redirect if needed"
		expect(response.status).toBe(200);
	});
});
