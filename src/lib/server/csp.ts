/**
 * Content Security Policy directives for st0x server-rendered responses.
 *
 * Extracted from `src/hooks.server.ts` so the directive list can be unit-tested
 * (regression guards for Threat T-2-G — silent CSP edits breaking observability)
 * without invoking hooks.server.ts top-level side effects (Sentry.init,
 * `$env/dynamic/private`, etc.).
 *
 * Notes carried over from the original inline comments:
 *  - `'unsafe-inline'` (script-src) is required for TradingView widgets which inject
 *    scripts via `script.innerHTML`.
 *  - `'unsafe-eval'` may be required by viem/ethers for ABI encoding — test before
 *    removing.
 *  - `connect-src` E2E relaxation is gated on `process.env.E2E === '1'`, set ONLY by
 *    `tests/integration/ui/globalSetup.ts`. NEVER set in Vercel production build,
 *    preview deploys, or any `.env*` file. See
 *    `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md`
 *    §"E2E=1 environment-variable contract".
 *  - `worker-src 'self' blob:` is required by Sentry Replay's compression worker
 *    (Plan 02-02 Pitfall 3). `tests/lib/server/csp.test.ts` is the regression guard.
 */

import { dev } from '$app/environment';

const isE2E = process.env.E2E === '1';
const connectSrcExtras = isE2E ? ' http://127.0.0.1:8545' : '';

export const CSP_DIRECTIVES: string[] = [
	"default-src 'self'",
	// Script sources - TradingView widgets require unsafe-inline (they use script.innerHTML for config)
	// unsafe-eval may be needed by web3 libraries - monitor via report-uri before removing
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://s3.tradingview.com https://tv-static-2.tradingview.com https://va.vercel-scripts.com https://cdn.jsdelivr.net https://*.posthog.com https://*.i.posthog.com",
	// Style sources - unsafe-inline needed for dynamic styles from libraries
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://cdn.jsdelivr.net data:",
	"img-src 'self' data: blob: https:",
	// Tightened connect-src - explicitly list allowed API endpoints
	"connect-src 'self'" +
		connectSrcExtras +
		' https://*.st0x.io https://*.vercel-kv.com https://*.vercel.app https://api.goldsky.com https://*.base.org https://*.publicnode.com https://*.llamarpc.com https://*.meowrpc.com https://*.blastapi.io https://gateway.tenderly.co https://*.tradingview.com https://*.walletconnect.com https://*.walletconnect.org https://api.web3modal.org https://*.web3modal.org wss://*.walletconnect.com wss://*.walletconnect.org https://api.dynamic.xyz https://*.dynamic.xyz https://app.dynamicauth.com https://*.dynamicauth.com https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://rpc.ankr.com https://base.drpc.org https://*.g.alchemy.com https://raw.githubusercontent.com https://st0x-oracle-server.fly.dev https://st0x-oracle.com http://st0x-oracle.com https://rain-oracle-server.fly.dev wss://*.dynamic.xyz wss://*.dynamicauth.com https://api.openchain.xyz https://va.vercel-scripts.com https://tokens.coingecko.com https://*.coingecko.com https://cdn.jsdelivr.net https://*.posthog.com https://*.i.posthog.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io',
	"frame-src 'self' https://challenges.cloudflare.com https://www.google.com https://*.tradingview.com https://*.tradingview-widget.com https://app.dynamicauth.com https://*.dynamicauth.com https://verify.walletconnect.com https://verify.walletconnect.org",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	// Additional hardening directives
	"object-src 'none'",
	// Sentry Replay's compression worker requires blob: workers (Plan 02-02 Pitfall 3).
	// Removing or narrowing this directive breaks Replay silently — there is a regression
	// test in `tests/lib/server/csp.test.ts` to catch accidental edits.
	"worker-src 'self' blob:",
	"manifest-src 'self'",
	// Only upgrade insecure requests in production (breaks localhost dev)
	...(dev ? [] : ['upgrade-insecure-requests'])
];

export function buildCspHeader(): string {
	return CSP_DIRECTIVES.join('; ');
}
