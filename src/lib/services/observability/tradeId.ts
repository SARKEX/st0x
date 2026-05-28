/**
 * Trade-ID lifecycle (OBS-09 Plan 02-01 Task 1).
 *
 * Browser-side primitive providing the correlation key that ties together:
 *  - PostHog events (via `tradeEvents.ts` wrapper — every event carries `trade_id`)
 *  - Sentry events (via `Sentry.setTag('trade_id', ...)` — included in scope)
 *  - Server pino logs (via the `X-Trade-Id` request header — see `src/lib/server/logger.ts`)
 *
 * D-claim (OBS-09): mint at submit-click only — call sites are wired in Plan 03.
 * This module exposes only the lifecycle primitives:
 *   `mintTradeId()`, `getCurrentTradeId()`, `clearTradeId()`, `TRADE_ID_HEADER`.
 *
 * Threat T-2-E (cross-request leakage via module-level state) is mitigated in Plan 03
 * by the try/finally `clearTradeId()` discipline at every submit site (Pitfall 2).
 *
 * Project convention: logging never throws back into the caller. Every Sentry call is
 * wrapped in try/catch — see `captureTakeOrderFailure.ts` for the same pattern.
 */

import * as Sentry from '@sentry/sveltekit';

export const TRADE_ID_HEADER = 'X-Trade-Id';

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
