# Milestones

## v1.0 Stabilization (Shipped: 2026-05-05)

**Phases completed:** 4 phases, 37 plans, 33/33 v1 REQ-IDs

**Audit:** `passed` (30/30 REQ-IDs satisfied at audit time, all 11 cross-phase carry-forward gates GREEN, 4/4 phases Nyquist-compliant). Re-audit 2026-05-03 after gap closure (commit `018fd58`). Full audit archived at [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md).

**Key accomplishments:**

- **Phase 1 — Shrink the Surface, See What's Happening** (8/8 plans, 8/8 REQ-IDs). Deleted dead subsystems (DEPR-01..03 — rewards UI, points pipeline, Onramper unsigned-cookie auth path, redundant admin endpoints). Stood up zero-to-one observability: Sentry SDK with PII scrubbing (OBS-01), pino structured logging across SvelteKit endpoints + cron + take-order critical path (OBS-02), failed-take-order transcript capture (OBS-03), per-RPC failure metrics + Telegram alerting on chain exhaustion (OBS-04), Vercel Speed Insights wired (OBS-05).
- **Phase 2 — Trade-Execution Backbone Refactor** (8/8 plans, 5/5 REQ-IDs). Codified maker/taker INPUT/OUTPUT semantics with single-source-of-truth helpers and ESLint banned patterns (TRADE-01). Severed the 2,373-line `transaction.ts` cycle into focused stores (TRADE-02). Added pre-flight on-chain freshness check + visible UI staleness signaling (TRADE-03). Made Buy/Sell/spend-anchored/asset-anchored modes provably symmetric (TRADE-04). Trade-page bundle reduced ~250KB minified via visualizer/jspdf removal + Svelte 4 lazy-load with CLS-safe skeletons (PERF-01).
- **Phase 3 — Production-Grade Hardening** (11/11 plans, 10/10 REQ-IDs). Hardcoded Alchemy key removed; `BASE_RPC_URL` / `PUBLIC_BASE_RPC_URL` env vars + module-load fail-closed (SEC-01). `auth.ts` + `csrf.ts` fail-closed at module load when secrets missing in production (SEC-02). Atomic-flip session cookie — 5 server-side `wallet-address` consumers migrated to KV-backed `session` cookie (SEC-03). `csrf.ts` rewritten to session-bound HMAC (SEC-04). `Math.random()` replaced with rejection-sampled `crypto.randomBytes()` for access codes + referrals (SEC-05). Snapshot rate-limit `snapshotsPreview` tier + admin-gated generate endpoint (SEC-06). hCaptcha gate switched from `NODE_ENV` to `VERCEL_ENV` so preview deploys fail closed without `HCAPTCHA_SECRET` (SEC-07). `callRpc` per-RPC retry + chain exhaustion throws + Telegram alert (REL-01). `accessCodes.ts` viem `fallback([http(URL_1), http(URL_2), ...])` transport (REL-02). `rain.strategies` registry vendored to `static/registry/` for same-origin fetch (REL-03).
- **Phase 4 — Boundary Tests & Drift Cleanup** (10/10 plans, 7/7 REQ-IDs). `hooks.server.ts` boundary tests (TEST-01). Audit-log fan-out tests across 8 admin endpoints (TEST-02). Anvil-fork integration suite + replay tests at `FORK_BLOCK 33_400_000` (TEST-03). Snapshot scraper edge-case tests (TEST-04). Multi-chain + account-abstraction drift removed from CLAUDE.md and code (DRIFT-01..03); `vite.config.integration.js` wired to `npm run test:integration`.
- **Post-execution cleanup.** Captcha + newsletter dead-code removed (PR #169). EU-region Sentry CSP entry added (PR #170). v1.0 milestone content shipped to `main` via PR #167 (squash-merge).

**Known deferred items at close** (3 items — tracked in STATE.md `## Deferred Items`):

- HUMAN-UAT: PERF-01 numeric p75 LCP < 2.5s capture from Vercel Speed Insights (post-deploy + 24h window)
- HUMAN-UAT: SEC-03 + SEC-04 D-04b runtime UX assertion (no per-request signature prompts) — real-wallet sign-in flow on production
- Tech debt: REL-02 per-RPC attribution in OBS-04 logs lost when `verifyMessage` routes through viem fallback Transport

**Stats:**

- Test suite at close: 658 passed / 1 skipped / 0 failed (52 test files)
- `svelte-check` baseline: 3 errors preserved (sole source `tests/lib/server/rpcMetrics.test.ts:182`)
- Timeline: 2026-04-28 → 2026-05-05 (~7 days)

---
