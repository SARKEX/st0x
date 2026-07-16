// E2E-only Playwright config. Runs UI specs under tests/integration/ui/ — sibling to
// tests/integration/marketOrder/ (Vitest service-integration suite).
//
// Why workers: 1 — anvil's evm_snapshot/evm_revert is process-global; concurrent
// specs would collide on chain state (CONTEXT D-02 / RESEARCH Pitfall: parallel
// anvil collide).
//
// Why testDir: 'tests/integration/ui' — Discretion #1 in 01-RESEARCH; mirrors the
// existing layered-fixture pattern (Phase 4 D-01 established tests/integration/ as
// the home for "anvil + replay" tests; UI E2E is the natural fourth layer).
//
// Why timeout: 180_000 — prefunding orderbook vaults via deposit2 adds ~30s of
// confirmation-wait time per test (--block-time 2 + 21 funding/approve/deposit
// txs). On top of preview-server boot + chain calls + lazy-loaded UI fetch the
// previous 60s budget exhausted before submit could enable.
//
// Why webServer block (vs manual spawn in globalSetup): if the preview server
// crashes mid-suite, Playwright auto-restarts it. The previous manual-spawn
// approach left subsequent tests staring at a dead port (ERR_CONNECTION_REFUSED).
// Pattern lifted from albion.dex playwright.config.ts. webServer boots in
// parallel with globalSetup; globalSetup waits for both before running specs.
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/integration/ui',
	timeout: 180_000,
	expect: { timeout: 30_000 },
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	globalSetup: './tests/integration/ui/globalSetup.ts',
	globalTeardown: './tests/integration/ui/globalTeardown.ts',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
		port: 4173,
		// 10 min — `npm run build` cold-start chews through node_modules
		// (flowbite-svelte, ox, porto, @dynamic-labs/*) before vite-preview can
		// listen on 4173. Observed 5-7min cold builds on dev laptops; 600s
		// gives headroom for both local + CI.
		timeout: 600_000,
		reuseExistingServer: !process.env.CI,
		env: {
			// E2E=1 — relaxes connect-src in src/lib/server/csp.ts so the preview
			// build's CSP allows anvil RPC + Goldsky + Pyth.
			E2E: '1',
			// auth.ts (and other server modules) throw at load-time when this
			// secret is unset. Synthetic value — the E2E suite never authenticates
			// real users.
			SESSION_SECRET: 'e2e-build-only-dummy-session-secret'
			// PUBLIC_REGISTRY_URL deliberately UNSET — exercises the production
			// default `/registry/manifest`, which resolves the REST API's active
			// source commit to the matching public st0x.registry manifest. If you
			// need an isolated registry in CI, set the env var to an immutable
			// public registry URL.
		}
	}
});
