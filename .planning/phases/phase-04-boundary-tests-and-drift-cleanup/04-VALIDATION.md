---
phase: 4
slug: boundary-tests-and-drift-cleanup
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-01
audited: 2026-05-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed REQ-ID validation specs live in `04-RESEARCH.md` `## Validation Architecture`.
> This file is the orchestrator-consumed sampling/Wave-0/sign-off contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.0 + jsdom + @testing-library/svelte |
| **Config file** | `vite.config.js` (`test` block); `vite.config.integration.js` for anvil-fork integration suite (TEST-03) |
| **Quick run command** | `npm test -- --run` (unit + jsdom suites; excludes integration) |
| **Full suite command** | `npm test -- --run && npm run test:integration` |
| **Estimated runtime** | ~30s quick / ~3-5 min full (anvil fork warmup + integration) |

> Note: planning-time draft referenced `vitest.integration.config.ts`; the file shipped as `vite.config.integration.js`. `package.json` `test:integration` script references the actual file. Tracked as a non-blocking doc cleanup in 04-VERIFICATION.md §"Gaps Summary".

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (quick suite, excludes anvil-fork)
- **After every plan wave:** Run `npm test -- --run && npm run check` (vitest + svelte-check baseline = 3)
- **After Wave 5 (anvil-fork wave) commits:** Run `npm run test:integration` once per task
- **Before `/gsd-verify-work`:** Full suite green (`npm test -- --run && npm run test:integration && npm run check && npm run lint`)
- **Max feedback latency:** ~30s for quick, ~5 min for integration

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-* | 01 — DRIFT-03 CLAUDE.md surgical edit | 1 | DRIFT-03 | grep | `grep -E 'Rhinestone\|EIP-7702\|account-abstraction' CLAUDE.md` returns only disclaimer-paragraph hits (carve-out per 04-10 decision) | ✅ | ✅ green |
| 04-02-* | 02 — DRIFT-02 USDC hardcoding → canonical helpers | 2 | DRIFT-02 | grep + svelte-check + build | `grep -rE '0x833589[fF]CD6eDb6E08f4c7C32D4f71b54bdA02913' src/routes/admin src/routes/api/admin` returns 0; `npm run check` ≤ 3; `npm run build` exits 0 | ✅ | ✅ green |
| 04-03-* | 03 — DRIFT-01 codemod + ESLint rule + lint fixture | 3 | DRIFT-01 | grep + lint | `grep -rE 'TOKENS\.find\|ALL_TOKENS\.find' src/ --include='*.ts' --include='*.svelte' -l \| grep -v 'src/lib/config/tokens.ts'` returns only 4 eslint-disabled carve-outs; `npm run lint` exits 0; lint fixture file fails the new rule | ✅ | ✅ green |
| 04-04-* | 04 — TEST-01 hooks split-per-concern | 4 | TEST-01 | integration | `npm test -- tests/hooks/ --run` exits 0; 6 test files exist (cors, csp, public-paths, admin-gate, wallet-session, bot-rejection) + `_helpers.ts`; 58 it-blocks | ✅ | ✅ green |
| 04-05-* | 05 — TEST-02 audit-log emission ADD (5 endpoints) | 4 | TEST-02 | grep | `grep -c 'createAuditLogger' src/routes/api/admin/{excluded-wallets,pool-wallets,team-wallets,snapshots/trigger,snapshots/regenerate}/+server.ts` ≥ 1 each (≥2 actual) | ✅ | ✅ green |
| 04-06-* | 06 — TEST-02 runtime per-endpoint audit-log tests (8) | 4 | TEST-02 | integration | `npm test -- tests/lib/admin/ --run` exits 0; 8 .audit.test.ts files exist (codes, excluded-wallets, pool-wallets, team-wallets, snapshots-trigger, snapshots-regenerate, referral-programme-refresh, referral-programme-migrate); 28 cases | ✅ | ✅ green |
| 04-07-* | 07 — TEST-03 anvil + integration scaffolding (Wave 0) | 5 | TEST-03 | structural | `test -f tests/helpers/anvil.ts && test -f vite.config.integration.js && grep -q 'test:integration' package.json` exits 0 | ✅ | ✅ green |
| 04-08-* | 08 — TEST-03 anvil-fork + 7 replay tests | 5 | TEST-03 | integration (anvil + replay) | `npm run test:integration` reports 7 pass / 4 skipped (anvil suite skipif !BASE_RPC_URL); 7 fixture files + 1 anvil-fork.test.ts + 7 replay-*.test.ts exist | ✅ | ✅ green |
| 04-09-* | 09 — TEST-04 scraper edge tests | 5 | TEST-04 | unit | `npm test -- src/lib/server/snapshots/scraper.test.ts --run` exits 0; 386 lines, 6 cases across 3 categories | ✅ | ✅ green |
| 04-10-* | 10 — Phase-exit + 04-RUNBOOK.md + REQUIREMENTS/ROADMAP close | 6 | all 7 | full grep set per 04-10-PLAN.md `<verification>`; `npm test -- --run`, `npm run test:integration`, `npm run check`, `npm run lint`, `npm run build` all green; 04-RUNBOOK.md = 468 lines; REQUIREMENTS.md TEST-* + DRIFT-* `[x]`; ROADMAP Phase 4 Complete | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/hooks/_helpers.ts` — `createMockRequestEvent` / `createMockKv` / `createMockSession` factories (TEST-01)
- [x] `tests/helpers/anvil.ts` — anvil spawn/teardown helper for integration suite (TEST-03)
- [x] `tests/helpers/loadTranscript.ts` — fixture loader for replay JSON (TEST-03)
- [x] `tests/fixtures/marketOrder/` — 7 redacted OBS-03 transcripts (TEST-03)
- [x] `tests/fixtures/eslint/token-lookup-violation.ts` — DRIFT-01 lint fixture
- [x] `vite.config.integration.js` — separate integration config (TEST-03; shipped name differs from draft `vitest.integration.config.ts`)
- [x] `package.json` — `"test:integration": "vitest --config vite.config.integration.js run"`
- [x] `.github/workflows/test.yml` — Foundry install step + `BASE_RPC_URL` secret read for `test-integration` job (TEST-03)
- [x] `scripts/codemods/migrate-token-find.ts` — ts-morph DRIFT-01 codemod (one-shot)
- [x] `eslint.config.js` — `no-restricted-syntax` rule (lines 91-110) banning `TOKENS.find` / `ALL_TOKENS.find` outside allowlist (DRIFT-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 04-RUNBOOK.md OBS-03 transcript-capture procedure works end-to-end | TEST-03 | Requires Vercel Logs access + production failure data; cannot run in CI | Operator pulls a recent OBS-03 failure from Vercel Logs, runs the redaction recipe, lands the JSON under `tests/fixtures/marketOrder/`, runs replay test — green = procedure works |
| HUMAN-UAT carry-forward: PERF-01 p75 LCP < 2.5s | (Phase 2 deferred) | Requires post-deploy real-traffic measurement | `/gsd-verify-work` against deployed Vercel measurement |
| HUMAN-UAT carry-forward: SEC-03+04 D-04b runtime UX (no mid-session re-signing) | (Phase 3 deferred) | Requires multi-tab / multi-day session simulation | `/gsd-verify-work` per `03-RUNBOOK.md` smoke recipe |
| CLAUDE.md surgical edit reads naturally as a document | DRIFT-03 | Prose quality is human-judged | Reviewer reads the post-edit file end-to-end |
| anvil-fork integration suite green in CI with BASE_RPC_URL | TEST-03 | Requires CI environment with secret + Foundry install; local runs skip cleanly | Run `test-integration` job in GHA after merge; verify 4 anvil-fork it-blocks pass instead of skip |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (anvil, fixtures, ESLint rule, codemod, integration config)
- [x] No watch-mode flags (all commands use `--run`)
- [x] Feedback latency < 30s for quick suite, < 5 min for integration
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-03 — all 7 REQ-IDs (TEST-01..04, DRIFT-01..03) covered by automated tests/grep gates per 04-VERIFICATION.md (5/5 truths, 8/8 carry-forward gates green).

---

## Validation Audit 2026-05-03

| Metric | Count |
|--------|-------|
| Tasks audited | 10 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| New tests generated | 0 |

**Method:** Cross-referenced 10 task summaries (04-01..04-10) and 04-VERIFICATION.md against filesystem (`tests/hooks/`, `tests/lib/admin/*.audit.test.ts`, `tests/integration/marketOrder/`, `tests/helpers/`, `tests/fixtures/marketOrder/`, `src/lib/server/snapshots/scraper.test.ts`, `vite.config.integration.js`, `scripts/codemods/migrate-token-find.ts`, `eslint.config.js` lines 91–110). All test files present; 04-VERIFICATION.md records `npm test -- --run` = 51 files / 661 pass / 1 skip and `npm run test:integration` = 7 pass / 4 anvil-skipped (expected without `BASE_RPC_URL`). Stale draft statuses (`⬜ pending`, `wave_0_complete: false`) flipped to reflect shipped state. No additional test generation required.
