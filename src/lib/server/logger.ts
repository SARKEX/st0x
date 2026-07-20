/**
 * Server-side structured logger (pino) + request-context propagation (AsyncLocalStorage).
 *
 * Phase 1 / OBS-02 (D-07): JSON output to stdout — Vercel Logs picks it up. No external
 * drain in this phase. Required fields: request_id, wallet, route, method, status,
 * latency_ms, level, msg, error.*. Per-route log-level matrix in `pickLevelForRoute`.
 *
 * NODE-ONLY: This module imports `node:async_hooks` (AsyncLocalStorage) and
 * `node:crypto` (randomUUID). Vercel's Edge runtime does NOT support `node:async_hooks` —
 * verified at install time that no route in `src/routes/` exports
 * `config = { runtime: 'edge' }` (Pitfall 2). If a future route opts into Edge, that route
 * opts out of `getLogger()` / `getRequestContext()` (the loss is observability, not safety).
 *
 * Wallet retention (D-07): pino logs retain the FULL wallet address — Vercel Logs is
 * admin-only-readable. Sentry's beforeSend scrubber (src/lib/observability/scrub.ts)
 * handles third-party SaaS exposure separately. DO NOT truncate wallets here.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { readSession } from './walletSession';

interface RequestContext {
	request_id: string;
	wallet: string | null;
	route: string;
	method: string;
	start_ms: number;
}

const contextStore = new AsyncLocalStorage<RequestContext>();

// Base logger — JSON stdout in prod; debug level in dev.
// `redact` covers Authorization headers, cookies, and any field literally named
// `signature` / `privateKey` at any depth (T-05-01 mitigation).
const baseLogger: Logger = pino({
	level: dev ? 'debug' : 'info',
	base: {
		app: 'st0x',
		env: dev ? 'dev' : 'prod'
	},
	formatters: {
		level: (label) => ({ level: label })
	},
	redact: {
		paths: ['req.headers.authorization', 'req.headers.cookie', '*.signature', '*.privateKey'],
		censor: '[REDACTED]'
	},
	timestamp: pino.stdTimeFunctions.isoTime
});

/**
 * Default export — the unscoped base logger. Use this only at module scope (boot,
 * background tasks); inside a request handler prefer `getLogger()` so the line
 * carries the request_id / wallet / route / method context fields.
 */
export default baseLogger;
export { baseLogger as logger };

/** Get the active request's logger — child carries the context fields. */
export function getLogger(): Logger {
	const ctx = contextStore.getStore();
	if (!ctx) return baseLogger;
	return baseLogger.child({
		request_id: ctx.request_id,
		wallet: ctx.wallet,
		route: ctx.route,
		method: ctx.method
	});
}

/** Read the current request's context (returns undefined outside a request, e.g. at boot). */
export function getRequestContext(): RequestContext | undefined {
	return contextStore.getStore();
}

/**
 * SvelteKit `Handle` hook — must be the FIRST link in the sequence chain so that:
 *  - Sentry breadcrumbs see the request_id;
 *  - bot-rejection / CSP / CORS / auth all see the same context;
 *  - the response gets `x-request-id` echoed back for client correlation.
 *
 * If the client supplies an `x-request-id` header we reuse it (cross-correlation);
 * otherwise we generate a CSPRNG-backed UUIDv4 via `crypto.randomUUID()` (T-05-06).
 *
 * Wallet best-effort: SEC-03 (Plan 03-08b atomic flip) — wallet is derived
 * from the server-issued 'session' cookie + KV record via readSession. The
 * client-set 'wallet-address' cookie is no longer trusted as auth proof. If the
 * session cookie is missing or KV is unavailable, wallet is null (logs simply
 * lack the field rather than blocking the request).
 */
export const requestContextHandle: Handle = async ({ event, resolve }) => {
	const request_id = event.request.headers.get('x-request-id') ?? randomUUID();
	const sessionId = event.cookies.get('session');
	let wallet: string | null = null;
	if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
		const record = await readSession(sessionId);
		wallet = record?.walletAddress ?? null;
	}
	const route = event.url.pathname;
	const method = event.request.method;
	const start_ms = Date.now();

	return contextStore.run({ request_id, wallet, route, method, start_ms }, async () => {
		const response = await resolve(event);
		response.headers.set('x-request-id', request_id);

		const status = response.status;
		const latency_ms = Date.now() - start_ms;
		const level = pickLevelForRoute(route, status);
		getLogger()[level]({ status, latency_ms }, 'request');
		return response;
	});
};

/**
 * Per-route log level matrix (D-07).
 * Status takes precedence over route to surface error / warn classes consistently.
 */
export function pickLevelForRoute(route: string, status: number): 'info' | 'warn' | 'error' {
	if (status >= 500) return 'error';
	if (status >= 400) return 'warn';
	if (route.startsWith('/api/snapshots/')) return 'warn';
	if (route.startsWith('/api/cron/')) return 'info';
	if (route.startsWith('/api/admin/')) return 'info';
	if (route.startsWith('/api/access/')) return 'info';
	return 'info';
}
