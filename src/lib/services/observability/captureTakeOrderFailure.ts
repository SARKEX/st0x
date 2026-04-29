/**
 * Take-order failure capture (OBS-03 / D-08 / D-15).
 *
 * Browser-tier dual-sink dispatcher for `executeMarketOrder` failure paths:
 *
 *   1. `Sentry.captureException(err, { tags, extra: transcript })` — immediate alert
 *      + breadcrumb context. PII scrubbing handled by `beforeSend` in
 *      `src/hooks.client.ts` (Plan 01-04) — the recursive `scrubSentryEvent` walker
 *      redacts wallet addresses (`0x[40]`) and signatures (`0x[130]`) anywhere in the
 *      event payload before it leaves the browser.
 *
 *   2. `console.error('[take-order failed]', JSON.stringify({ts, reason, ...transcript, error}))`
 *      — long-term searchability via PostHog session replay (admin-only-readable per
 *      INTEGRATIONS.md `maskAllInputs: true`) and Vercel browser-console capture.
 *
 * Per CONTEXT D-15: this is NOT a server-relayed endpoint. `marketOrderExecution.ts`
 * runs client-side; pino (server-only, Plan 01-05) does NOT receive these events. If
 * a future server-relayed take-order path is introduced, OBS-03 server-tier capture
 * would go through pino instead; no such path exists today.
 *
 * Acceptance test (D-08): a dev given a single failure log entry can re-run the exact
 * subgraph quote + on-chain state read without contacting the user. The Sentry event
 * JSON OR the console-line JSON satisfies this.
 */

import * as Sentry from '@sentry/sveltekit';
import type { ProcessedQuote } from '$lib/services/marketOrderExecution';

export type TakeOrderFailureReason =
	| 'no_quotes_available'
	| 'no_walk_fills'
	| 'unhydrated_fills'
	| 'aggregated_failed'
	| 'caught_exception';

export interface TakeOrderTranscript {
	// Quote-side state — replay vector for D-08 acceptance test
	subgraphQuoteHash: string | null;          // SHA-256 hex of fullQuotePayload (Task 2 populates)
	fullQuotePayload: ProcessedQuote[];        // exact quotes the local walk used
	// On-chain read at the moment of submission (D-08 LIMITATION: vaultBalance stays
	// null in Phase 1 — populating it requires a new on-chain read at submission time
	// which is Phase 2 / TRADE-03 territory.)
	onChainStateRead: {
		orderHash: string | null;
		vaultBalance: string | null;
		IOIndex: { input: number | null; output: number | null };
	};
	// Derivation
	ratio: string | null;                      // hex Float, from quote.ratio
	slippageBps: number;
	priceCap: string | null;                   // human decimal passed to SDK
	// Side semantics (per src/lib/types/orderPerspective.ts)
	side: 'bid' | 'ask';                       // counterparty side from filterQuotesForSide
	takerAction: 'Buy' | 'Sell';
	userAction: 'Buy' | 'Sell';
	mode: 'buyUpTo' | 'spendUpTo';             // anchored type
	// Identity
	walletAddress: string | null;              // Sentry's beforeSend scrubs the address
	// Cross-correlation
	request_id: string | null;                 // null on browser-only paths (logger.ts is server-only)
	timestamp: string;                         // ISO 8601
}

/**
 * Dispatch a take-order failure transcript to both observability sinks.
 *
 * Logging never throws back into the caller (project convention from
 * `src/lib/utils/monitoring.ts` and `src/lib/server/auditLog.ts`). Both sinks are
 * wrapped in try/catch so a Sentry SDK glitch or a JSON serialization edge case
 * cannot crash the trade UI.
 */
export function captureTakeOrderFailure(
	err: unknown,
	transcript: TakeOrderTranscript,
	reason: TakeOrderFailureReason
): void {
	const errorMessage = err instanceof Error ? err.message : String(err);

	// Sink 1: Sentry — immediate alert + breadcrumb context with PII scrubbed by beforeSend
	try {
		Sentry.captureException(err, {
			tags: { failure_reason: reason, side: transcript.side },
			extra: {
				...transcript,
				errorMessage
			}
		});
	} catch (sentryErr) {
		// Logging never throws back into caller (project convention)
		console.error('[captureTakeOrderFailure] Sentry sink failed:', sentryErr);
	}

	// Sink 2: console.error JSON line — captured by PostHog session replay + Vercel browser console
	try {
		console.error(
			'[take-order failed]',
			JSON.stringify({
				ts: transcript.timestamp,
				reason,
				...transcript,
				error: errorMessage
			})
		);
	} catch (jsonErr) {
		console.error('[captureTakeOrderFailure] failed to serialize transcript:', jsonErr);
	}
}
