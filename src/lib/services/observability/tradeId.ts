/**
 * Trade-ID lifecycle (OBS-09 Plan 02-01 Task 1).
 *
 * Browser-side primitive providing the correlation key that ties together:
 *  - PostHog events (via `tradeEvents.ts` wrapper — every event carries `trade_id`)
 *  - Sentry events (via `Sentry.setTag('trade_id', ...)` — included in scope)
 *
 * Server-side correlation via an `X-Trade-Id` request header is a planned
 * follow-up; until a fetch-interceptor seam is wired the header is not sent
 * by the browser, so the constant + server-side validator were removed to
 * keep this module honest. Re-add both with the interceptor in a future PR.
 *
 * D-claim (OBS-09): mint at submit-click only.
 *
 * Threat T-2-E (cross-request leakage via module-level state) is mitigated by
 * the `withTradeId` wrapper, which owns the mint/clear lifecycle.
 *
 * Project convention: logging never throws back into the caller. Every Sentry call is
 * wrapped in try/catch — see `captureTakeOrderFailure.ts` for the same pattern.
 */

import * as Sentry from '@sentry/sveltekit';

let current: string | null = null;

export function mintTradeId(): string {
	current = crypto.randomUUID();
	try {
		Sentry.setTag('trade_id', current);
	} catch (err) {
		// Logging never throws back into caller (project convention)
		console.error('[tradeId] Sentry.setTag failed:', err);
	}
	return current;
}

export function getCurrentTradeId(): string | null {
	return current;
}

export function clearTradeId(): void {
	current = null;
	try {
		Sentry.setTag('trade_id', undefined as unknown as string);
	} catch (err) {
		console.error('[tradeId] Sentry.setTag clear failed:', err);
	}
}

/**
 * Mint a trade_id, run `fn`, and clear it in `finally` — the canonical
 * Pitfall 2 (T-2-E) discipline as a single primitive so call sites don't
 * each have to remember it.
 *
 * Limit deploys with a pre-deploy warning modal need to span a UI event
 * boundary (button → modal-confirm) and so keep the mint/clear lifecycle
 * inline.
 */
export async function withTradeId<T>(fn: () => Promise<T> | T): Promise<T> {
	mintTradeId();
	try {
		return await fn();
	} finally {
		clearTradeId();
	}
}
