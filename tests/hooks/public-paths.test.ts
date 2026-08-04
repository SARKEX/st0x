import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — public-path classification before resolve.
//
// hooks.server.ts lists the paths that are explicitly public. Every other path
// simply falls through to resolve (there is no longer a server-side auth gate),
// so these assertions pin the self-checking endpoints (session login/logout) +
// public API.

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

const passthroughResolve = async () =>
	new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

describe('hooks.server PUBLIC_PATHS classification', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
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

	it('page / (root) falls through to resolve (no server-side gate; client handles auth)', async () => {
		const handle = await loadHandle();
		const event = createMockRequestEvent({ pathname: '/' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.status).toBe(200);
	});
});
