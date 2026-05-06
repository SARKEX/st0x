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
// Why timeout: 60_000 — preview-server boot + chain calls + lazy-loaded order
// component fetch each consume a few seconds; 60s leaves headroom on CI without
// masking real hangs.
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/integration/ui',
	timeout: 60_000,
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
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
