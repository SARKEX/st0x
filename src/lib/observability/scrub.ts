/**
 * PII scrubber for Sentry events. Runs in `beforeSend` AND `beforeBreadcrumb`.
 *
 * Strips:
 *  - `?signature=...` / `&signature=...` URL query params (must run BEFORE the 0x[130] regex
 *    so the URL-encoded form is caught — Pitfall 9)
 *  - `0x[130]` hex signatures
 *  - `0x[40]` hex wallet addresses
 *
 * Recursive over event/breadcrumb tree (Sentry events are deeply nested — one-pass replace
 * misses fields like breadcrumb data.url).
 *
 * Pure function — no side effects, no I/O, no Svelte stores.
 */

import type { Event, Breadcrumb } from '@sentry/sveltekit';

const ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const SIG_RE = /0x[a-fA-F0-9]{130}/g;
const SIG_QUERY_RE = /([?&])signature=[^&]*/g;

function redactString(s: string): string {
	return s
		.replace(SIG_QUERY_RE, '$1signature=[REDACTED]')
		.replace(SIG_RE, '[REDACTED_SIGNATURE]')
		.replace(ADDR_RE, '[REDACTED_ADDR]');
}

function walk(value: unknown): unknown {
	if (typeof value === 'string') return redactString(value);
	if (Array.isArray(value)) return value.map(walk);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = walk(v);
		}
		return out;
	}
	return value;
}

export function scrubSentryEvent<T extends Event | Breadcrumb>(input: T): T {
	return walk(input) as T;
}
