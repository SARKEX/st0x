/**
 * Structured operational logging for subgraph/HTTP query failures.
 *
 * Emits newline-delimited JSON at a consistent shape so Vercel log search
 * can aggregate failure patterns (rate limits, outages, retry counts).
 *
 * Not a full observability layer — just enough structure to diagnose
 * upstream flakiness without grep-diving unstructured console spew.
 */

export type QueryFailureKind =
	| 'subgraph_page_failed'
	| 'subgraph_page_retry'
	| 'subgraph_pagination_interrupted'
	| 'public_endpoint_network_failed';

export interface QueryFailureEvent {
	kind: QueryFailureKind;
	endpoint?: string;
	itemsKey?: string;
	network?: string;
	credentialLabel?: St0xCredentialLabel;
	attempt?: number;
	maxAttempts?: number;
	skip?: number;
	itemsSoFar?: number;
	status?: number;
	permanent?: boolean;
	error: string;
}

/**
 * Log a query failure event as structured JSON.
 * Prefixes with `[monitor]` so it's easy to grep Vercel logs.
 */
export function logQueryFailure(event: QueryFailureEvent): void {
	try {
		// Surface a human-readable summary AND a structured payload on a single line.
		console.warn(
			`[monitor] ${event.kind}:`,
			JSON.stringify({ ts: new Date().toISOString(), ...event })
		);
	} catch {
		// Logging must never throw back into the caller.
		console.warn('[monitor] failed to serialize failure event', event.kind, event.error);
	}
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
import type { St0xCredentialLabel } from '$lib/types/st0x';
