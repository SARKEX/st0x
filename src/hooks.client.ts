/**
 * SvelteKit client hook. Runs in the browser at module load (entry-point time).
 *
 * Wires `@sentry/sveltekit` for unhandled errors + promise rejections with PII scrubbing
 * AND on-error Session Replay (OBS-06, Plan 02-02).
 *
 * Replay configuration (per Plan 02-02 D-02 + D-03):
 *  - replaysSessionSampleRate: 0 — no proactive recording (free-tier conservation)
 *  - replaysOnErrorSampleRate: 1.0 — buffer the last ~30-60s and flush on every error
 *  - maskAllText + maskAllInputs + blockAllMedia — maximum DOM masking (Threat T-2-C)
 *
 * The CSP `worker-src 'self' blob:` directive (in `$lib/server/csp`) is required by
 * Replay's compression worker — `tests/lib/server/csp.test.ts` is the regression
 * guard for Pitfall 3.
 *
 * `beforeSend` and `beforeBreadcrumb` remain wired to `scrubSentryEvent` (OBS-01) — do
 * NOT remove these handlers; `tests/lib/observability/sentryReplayConfig.test.ts` Test 5
 * is the regression guard.
 */

import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { scrubSentryEvent } from '$lib/observability/scrub';

Sentry.init({
	dsn: env.PUBLIC_SENTRY_DSN,
	enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
	tracesSampleRate: 0,
	replaysSessionSampleRate: 0, // D-02: no proactive recording — on-error buffer only
	replaysOnErrorSampleRate: 1.0, // D-02: full on-error buffer
	integrations: [
		Sentry.replayIntegration({
			maskAllText: true, // D-03: maximum privacy (Threat T-2-C)
			maskAllInputs: true, // D-03
			blockAllMedia: true // belt-and-braces — no media on trade page anyway
		})
	],
	beforeSend(event) {
		return scrubSentryEvent(event);
	},
	beforeBreadcrumb(breadcrumb) {
		return scrubSentryEvent(breadcrumb);
	}
});

const myErrorHandler = ({ error, event }: { error: unknown; event: unknown }) => {
	console.error('[hooks.client] Unhandled client error:', error, event);
};

export const handleError = Sentry.handleErrorWithSentry(myErrorHandler);
