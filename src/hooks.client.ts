/**
 * SvelteKit client hook. Runs in the browser at module load (entry-point time).
 *
 * Wires `@sentry/sveltekit` for unhandled errors + promise rejections with PII scrubbing.
 * Errors-only configuration — no Replay, no Performance, no Feedback (free-tier conservation
 * + D-06 scope: this phase ships SDK integration only, no `+error.svelte` per D-12).
 */

import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { scrubSentryEvent } from '$lib/observability/scrub';

Sentry.init({
	dsn: env.PUBLIC_SENTRY_DSN,
	enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
	tracesSampleRate: 0,
	integrations: [],
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
