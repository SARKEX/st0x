/**
 * Sentry Session Replay config regression test (Plan 02-02 Task 1, OBS-06).
 *
 * Asserts `Sentry.init` in `src/hooks.client.ts` is configured per:
 *  - D-02 (no proactive recording, on-error buffer only):
 *      replaysSessionSampleRate === 0
 *      replaysOnErrorSampleRate === 1.0
 *  - D-03 (maximum DOM masking — Threat T-2-C mitigation):
 *      replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })
 *  - OBS-01 regression guard: beforeSend + beforeBreadcrumb still wired to scrubSentryEvent.
 *
 * Strategy: mock @sentry/sveltekit so `init`/`replayIntegration` are spy-able, import
 * hooks.client.ts (which triggers Sentry.init at module load), then inspect the spy
 * call args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Provide a DSN + non-dev env so the `enabled` gate would fire in production semantics.
// In test mode `dev` is true, so `enabled` will resolve to false — but `Sentry.init` is
// still called with the configured object regardless of `enabled` (the SDK itself decides
// whether to send). We assert on the configured shape, not on the runtime no-op.
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1' }
}));

// Override the global @sentry/sveltekit mock from vitest-setup.ts with one that
// surfaces `init` + `replayIntegration` as inspectable spies.
const initSpy = vi.fn();
const replayIntegrationSpy = vi.fn().mockReturnValue({ name: 'Replay' });

vi.mock('@sentry/sveltekit', () => {
	const noop = () => {};
	const noopHandler = () => async ({
		event,
		resolve
	}: {
		event: unknown;
		resolve: (e: unknown) => unknown;
	}) => resolve(event);
	return {
		init: initSpy,
		replayIntegration: replayIntegrationSpy,
		captureException: noop,
		captureMessage: noop,
		addBreadcrumb: noop,
		setUser: noop,
		setTag: noop,
		setContext: noop,
		setExtra: noop,
		withScope: (fn: (scope: unknown) => void) =>
			fn({ setTag: noop, setContext: noop, setExtra: noop }),
		sentryHandle: noopHandler,
		handleErrorWithSentry: () => () => undefined,
		sentrySvelteKit: () => ({ name: 'sentry-sveltekit-mock' })
	};
});

describe('hooks.client Sentry.init Replay configuration', () => {
	beforeEach(async () => {
		initSpy.mockClear();
		replayIntegrationSpy.mockClear();
		// Force re-import of hooks.client.ts so its module-load `Sentry.init` re-runs.
		vi.resetModules();
		await import('../../../src/hooks.client');
	});

	it('Test 1: replaysSessionSampleRate === 0 (D-02 — no proactive recording)', () => {
		expect(initSpy).toHaveBeenCalledTimes(1);
		const cfg = initSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(cfg.replaysSessionSampleRate).toBe(0);
	});

	it('Test 2: replaysOnErrorSampleRate === 1.0 (D-02 — full on-error buffer)', () => {
		const cfg = initSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(cfg.replaysOnErrorSampleRate).toBe(1.0);
	});

	it('Test 3: replayIntegration invoked with maskAllText: true + maskAllInputs: true (D-03)', () => {
		expect(replayIntegrationSpy).toHaveBeenCalledTimes(1);
		const replayOpts = replayIntegrationSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(replayOpts.maskAllText).toBe(true);
		expect(replayOpts.maskAllInputs).toBe(true);
	});

	it('Test 4: replayIntegration invoked with blockAllMedia: true (belt-and-braces, RESEARCH Pattern 4)', () => {
		const replayOpts = replayIntegrationSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(replayOpts.blockAllMedia).toBe(true);
	});

	it('Test 5: beforeSend + beforeBreadcrumb still wired (OBS-01 PII scrubber regression guard)', () => {
		const cfg = initSpy.mock.calls[0][0] as {
			beforeSend?: (e: unknown) => unknown;
			beforeBreadcrumb?: (b: unknown) => unknown;
			integrations?: unknown[];
		};
		expect(typeof cfg.beforeSend).toBe('function');
		expect(typeof cfg.beforeBreadcrumb).toBe('function');

		// Both handlers should pass through scrubSentryEvent — assert by feeding a payload
		// containing a 40-hex address and verifying it gets redacted.
		const dirty = { message: 'failure for 0xabcdef0123456789abcdef0123456789abcdef01' };
		const scrubbedSend = cfg.beforeSend!({ ...dirty }) as { message: string };
		expect(scrubbedSend.message).toContain('[REDACTED_ADDR]');
		const scrubbedCrumb = cfg.beforeBreadcrumb!({ ...dirty }) as { message: string };
		expect(scrubbedCrumb.message).toContain('[REDACTED_ADDR]');

		// integrations array contains the replayIntegration return value
		expect(Array.isArray(cfg.integrations)).toBe(true);
		expect(cfg.integrations).toContainEqual({ name: 'Replay' });
	});
});
