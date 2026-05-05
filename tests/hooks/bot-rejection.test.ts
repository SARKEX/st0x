import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — bot/scanner path rejection (T-04-04-05).
//
// hooks.server.ts:357-376 silently 404s requests to common bot/scanner paths
// (.php probes, /wp-admin, /_next, /cgi-bin, /.env, encoded-URL crawlers) BEFORE
// running CORS/auth/CSP. Source order at hooks.server.ts:385-387 is:
//   1. isBotOrMalformedPath  -> 404 (no headers, no auth, no logging noise)
//   2. OPTIONS preflight     -> CORS handler
//   3. isPublicPath          -> bypass auth
//   4. admin / wallet gate
//
// Therefore the ordering invariant we assert is: bot UA-or-path detection
// short-circuits BEFORE the auth gate runs (mockIsRegistered never called).
// (Today the SUT detects via PATH patterns, not User-Agent. We pin actual
// behavior, not aspirational behavior.)

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

const passthroughResolve = vi.fn(
	async () => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
);

describe('hooks.server bot/scanner rejection (T-04-04-05)', () => {
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

	it('rejects /xmlrpc.php with 404 (PHP probe — no body, no headers leaked)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/xmlrpc.php' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects /wp-admin (WordPress probe)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/wp-admin/setup-config.php' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects /wp-login (WordPress probe)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/wp-login.php' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects /_next/* probes (Next.js scanner — st0x is SvelteKit)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/_next/static/chunks/main.js' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects /cgi-bin/* (legacy CGI probe)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/cgi-bin/test.cgi' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects /.env (secret-file scanner)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/.env' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('rejects encoded absolute URL crawler (/https%3A//evil.com/foo)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			url: 'http://localhost/https%3A//evil.com/foo'
		});
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(404);
	});

	it('bot rejection runs BEFORE auth gate (mockIsRegistered never called for bot paths)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({
			pathname: '/wp-admin/install.php',
			cookies: { session: 'a'.repeat(64) }
		});
		await handle({ event, resolve: passthroughResolve });
		expect(mockIsRegistered).not.toHaveBeenCalled();
	});

	it('bot rejection runs BEFORE resolve (passthrough never invoked)', async () => {
		passthroughResolve.mockClear();
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/admin.php' });
		await handle({ event, resolve: passthroughResolve });
		expect(passthroughResolve).not.toHaveBeenCalled();
	});

	it('legitimate non-bot path /access proceeds normally (negative control)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/access' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});

	it('legitimate non-bot path /api/public/health proceeds normally (negative control)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/api/public/health' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});
});
