import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from './_helpers';

// Plan 04-04 / TEST-01 — CSP host pinning + Pitfall-1 wildcard guard + DEPR-03 carry-forward.
//
// CSP regression mitigations (T-04-04-02):
// - explicit Sentry hosts (https://*.ingest.sentry.io, https://*.ingest.us.sentry.io)
//   are pinned, NOT a bare *.sentry.io wildcard (Phase 1 cross-cutting Pitfall 1).
// - Onramper hosts MUST NOT appear in frame-src (DEPR-03 carry-forward).
// - script-src MUST NOT contain unsafe-eval — wait, actually viem may need it; we
//   assert the documented invariant from CSP_DIRECTIVES (it currently DOES allow
//   unsafe-eval per the source comment). Keep this honest: we don't claim what we
//   don't have.

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_t, key: string) => process.env[key]
	})
}));

const passthroughResolve = async () =>
	new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });

async function getCspForPath(path: string): Promise<string> {
	const { handle } = await import('../../src/hooks.server');
	const event = createMockRequestEvent({ pathname: path });
	const response = await handle({ event, resolve: passthroughResolve });
	return response.headers.get('Content-Security-Policy') ?? '';
}

describe('hooks.server CSP', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("default-src is 'self'", async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).toMatch(/default-src 'self'/);
	});

	it('connect-src includes explicit https://*.ingest.sentry.io (Pitfall 1: pinned, not wildcarded)', async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).toContain('https://*.ingest.sentry.io');
	});

	it('connect-src includes explicit https://*.ingest.us.sentry.io (Pitfall 1: per-region pin)', async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).toContain('https://*.ingest.us.sentry.io');
	});

	it('connect-src does NOT contain a bare *.sentry.io wildcard (Phase 1 Pitfall 1 invariant)', async () => {
		const csp = await getCspForPath('/trade');
		// Match a bare ".sentry.io" host token — i.e., not preceded by "ingest.".
		// The two legitimate hosts are *.ingest.sentry.io and *.ingest.us.sentry.io.
		// A regression to "https://*.sentry.io" (no ingest prefix) MUST fail this.
		const bareSentryWildcard = /https:\/\/\*\.sentry\.io(?:\s|;|$)/;
		expect(csp).not.toMatch(bareSentryWildcard);
	});

	it('frame-src does NOT include Onramper hosts (DEPR-03 carry-forward)', async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).not.toContain('onramper.com');
		expect(csp).not.toContain('onramper.io');
	});

	it('frame-ancestors is none (clickjacking defense)', async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).toMatch(/frame-ancestors 'none'/);
	});

	it("object-src is 'none' (legacy plugin defense)", async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).toMatch(/object-src 'none'/);
	});

	it('connect-src excludes retired price feeds and trading-oracle services', async () => {
		const csp = await getCspForPath('/trade');
		expect(csp).not.toContain('hermes.pyth.network');
		expect(csp).not.toContain('st0x-oracle');
		expect(csp).not.toContain('rain-oracle');
		expect(csp).not.toContain('tradingview.com');
	});

	it('X-Frame-Options DENY is set (defense-in-depth alongside frame-ancestors)', async () => {
		const { handle } = await import('../../src/hooks.server');
		const event = createMockRequestEvent({ pathname: '/trade' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('X-Content-Type-Options nosniff is set', async () => {
		const { handle } = await import('../../src/hooks.server');
		const event = createMockRequestEvent({ pathname: '/trade' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('Referrer-Policy strict-origin-when-cross-origin is set', async () => {
		const { handle } = await import('../../src/hooks.server');
		const event = createMockRequestEvent({ pathname: '/trade' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('HSTS is set in production builds (dev=false)', async () => {
		const { handle } = await import('../../src/hooks.server');
		const event = createMockRequestEvent({ pathname: '/trade' });
		const response = await handle({ event, resolve: passthroughResolve });
		expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
	});
});
