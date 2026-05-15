// Playwright globalSetup — runs once before any spec.
//
// Lifecycle:
// 1. Guard: BASE_RPC_URL must be set (mirrors tests/helpers/anvil.ts:40-42).
// 2. Build the production bundle once with E2E=1 (so hooks.server.ts CSP gate is
//    active in the bundled output).
// 3. Spawn anvil at FORK_BLOCK (reuse tests/helpers/anvil.ts).
// 4. Start vite preview on :4173 with E2E=1.
// 5. Smoke-probe `/api/auth/csrf` to detect Pitfall 7 (Vercel adapter doesn't
//    serve API routes through `vite preview`); fail fast with the documented
//    fallback hint pointing at 01-RUNBOOK §"Vite-preview API-route fidelity".
//
// FORK_BLOCK is pinned in 01-RUNBOOK §"FORK_BLOCK" (33_400_000 inherited from
// v1.0 TEST-03). Override via env if archive access at the pinned block fails.
import { execSync } from 'node:child_process';
import { startAnvilFork } from '../../helpers/anvil';
import { startPreviewServer } from '../../helpers/previewServer';

// Block 45_990_727 = Thu 2026-05-14 11:00 AM ET (mid-NYSE-hours, weekday).
// Pinned to a market-hours block because st0x orders' Rainlang has a
// market-hours gate — orders simulate-revert outside NYSE hours and
// getTakeOrdersCalldata returns isReady=false, which collapses the trade
// flow at the "Order not ready for execution yet" message before any tx
// reaches the wallet. The original v1.0 TEST-03 pin of 33_400_000 was a
// Sunday 12:09 AM ET (markets closed) — fine for tests that don't actually
// hit the orderbook, fatal for the UI smoke that goes end-to-end. Override
// via env var FORK_BLOCK if a future fixture needs a different chain state.
const FORK_BLOCK = Number(process.env.FORK_BLOCK ?? 45_990_727);

export default async function globalSetup(): Promise<void> {
	if (!process.env.BASE_RPC_URL) {
		throw new Error('BASE_RPC_URL required for E2E suite — set in CI secrets / .env');
	}

	// auth.ts (and other server modules) throw at load-time when their
	// production secrets are unset && !dev. This happens BOTH during the
	// SvelteKit analyse pass (`npm run build`) AND when the production
	// server boots via `npm run preview`. Inject synthetic values onto
	// process.env once so every downstream spawn inherits them — the E2E
	// suite never authenticates real users, so cookie HMAC / RPC keys are
	// meaningless here. Bypass cleanly without touching production auth
	// code paths.
	process.env.SESSION_SECRET ||= 'e2e-build-only-dummy-session-secret';

	// 1. Build production bundle ONCE with E2E=1 baked into hooks.server.ts CSP gate.
	execSync('npm run build', { stdio: 'inherit', env: { ...process.env, E2E: '1' } });

	// 2. Spawn anvil fork at the pinned block.
	await startAnvilFork(FORK_BLOCK);

	// 3. Start vite preview with E2E=1 so hooks.server.ts relaxes connect-src.
	await startPreviewServer({ port: 4173, env: { E2E: '1' } });

	// 4. Smoke probe — fail fast if Pitfall 7 (vite preview vs adapter-vercel) bites.
	const apiProbe = await fetch('http://127.0.0.1:4173/api/auth/csrf').catch(() => null);
	if (!apiProbe || apiProbe.status >= 500) {
		throw new Error(
			'vite preview not serving /api/* routes — Pitfall 7 (adapter-vercel ' +
				'compiles routes to serverless functions, not into the static preview). ' +
				'Switch the E2E build to @sveltejs/adapter-node per ' +
				'.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md ' +
				'§"Vite-preview API-route fidelity".'
		);
	}

	process.env.PREVIEW_URL = 'http://127.0.0.1:4173';
	process.env.ANVIL_URL = 'http://127.0.0.1:8545';
}
