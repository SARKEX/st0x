---
phase: 4
slug: boundary-tests-and-drift-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
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
| **Config file** | `vite.config.js` (`test` block); new `vitest.integration.config.ts` introduced by TEST-03 anvil-fork wave |
| **Quick run command** | `npm test -- --run` (unit + jsdom suites; excludes integration) |
| **Full suite command** | `npm test -- --run && npm run test:integration` |
| **Estimated runtime** | ~30s quick / ~3-5 min full (anvil fork warmup + integration) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (quick suite, excludes anvil-fork)
- **After every plan wave:** Run `npm test -- --run && npm run check` (vitest + svelte-check baseline = 3)
- **After Wave 5 (anvil-fork wave) commits:** Run `npm run test:integration` once per task
- **Before `/gsd-verify-work`:** Full suite green (`npm test -- --run && npm run test:integration && npm run check && npm run lint`)
- **Max feedback latency:** ~30s for quick, ~5 min for integration

---

## Per-Task Verification Map

> Per-task entries are populated by the planner from PLAN.md `tasks` blocks.
> Each REQ-ID maps to named test files + grep gates per `04-RESEARCH.md` Validation Architecture.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-* | 01 — DRIFT-03 CLAUDE.md surgical edit | 1 | DRIFT-03 | grep | `grep -E 'Rhinestone\|EIP-7702\|account-abstraction' CLAUDE.md` returns 0 | ❌ W0 | ⬜ pending |
| 04-02-* | 02 — DRIFT-02 USDC hardcoding → canonical helpers | 2 | DRIFT-02 | grep + svelte-check + build | `grep -rE '0x833589[fF]CD6eDb6E08f4c7C32D4f71b54bdA02913' src/routes/admin src/routes/api/admin` returns 0; `npm run check` ≤ 3; `npm run build` exits 0 | ❌ W0 | ⬜ pending |
| 04-03-* | 03 — DRIFT-01 codemod + ESLint rule + lint fixture | 3 | DRIFT-01 | grep + lint | `grep -rE 'TOKENS\.find\|ALL_TOKENS\.find' src/ --include='*.ts' --include='*.svelte' -l \| grep -v 'src/lib/config/tokens.ts'` returns 0; `npm run lint` exits 0; lint fixture file fails the new rule | ❌ W0 | ⬜ pending |
| 04-04-* | 04 — TEST-01 hooks split-per-concern | 4 | TEST-01 | integration | `npm test -- tests/hooks/ --run` exits 0; 6 test files exist (cors, csp, public-paths, admin-gate, wallet-session, bot-rejection) | ❌ W0 | ⬜ pending |
| 04-05-* | 05 — TEST-02 audit-log emission ADD (5 endpoints) | 4 | TEST-02 | grep | `grep -c 'createAuditLogger' src/routes/api/admin/{excluded-wallets,pool-wallets,team-wallets,snapshots/trigger,snapshots/regenerate}/+server.ts` ≥ 1 each | ❌ W0 | ⬜ pending |
| 04-06-* | 06 — TEST-02 runtime per-endpoint audit-log tests (8) | 4 | TEST-02 | integration | `npm test -- tests/lib/admin/ --run` exits 0; 8 .audit.test.ts files exist | ❌ W0 | ⬜ pending |
| 04-07-* | 07 — TEST-03 anvil + integration scaffolding (Wave 0) | 5 | TEST-03 | structural | `test -f tests/helpers/anvil.ts && test -f vite.config.integration.js && grep -q 'test:integration' package.json` exits 0 | ❌ W0 | ⬜ pending |
| 04-08-* | 08 — TEST-03 anvil-fork + 7 replay tests | 5 | TEST-03 | integration (anvil + replay) | `npm run test:integration -- marketOrder` exits 0; 7 fixture files + 1 anvil-fork.test.ts + 7 replay-*.test.ts exist; FORK_BLOCK = 33_400_000 | ❌ W0 | ⬜ pending |
| 04-09-* | 09 — TEST-04 scraper edge tests | 5 | TEST-04 | unit | `npm test -- src/lib/server/snapshots/scraper.test.ts --run` exits 0 | ❌ W0 | ⬜ pending |
| 04-10-* | 10 — Phase-exit + 04-RUNBOOK.md + REQUIREMENTS/ROADMAP close | 6 | all 7 | grep gates + cross-cutting + RUNBOOK | full grep set per 04-10-PLAN.md `<verification>`; `npm test -- --run`, `npm run test:integration`, `npm run check`, `npm run lint`, `npm run build` all green; 04-RUNBOOK.md ≥ 200 lines; REQUIREMENTS.md TEST-* + DRIFT-* `[x]`; ROADMAP Phase 4 Complete | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/hooks/_helpers.ts` — `createMockRequestEvent` / `createMockKv` / `createMockSession` factories (TEST-01)
- [ ] `tests/helpers/anvil.ts` — anvil spawn/teardown helper for integration suite (TEST-03)
- [ ] `tests/helpers/loadTranscript.ts` — fixture loader for replay JSON (TEST-03)
- [ ] `tests/fixtures/marketOrder/` — directory + 5–10 redacted OBS-03 transcripts (TEST-03)
- [ ] `tests/fixtures/eslint/token-lookup-violation.ts` — DRIFT-01 lint fixture
- [ ] `vitest.integration.config.ts` — separate integration config (TEST-03)
- [ ] `package.json` — `"test:integration": "vitest --config vitest.integration.config.ts run"`
- [ ] `.github/workflows/ci.yml` — Foundry install step (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) + `BASE_RPC_URL` secret read access for `test:integration` job (TEST-03)
- [ ] `scripts/codemods/migrate-token-find.ts` — ts-morph DRIFT-01 codemod (one-shot)
- [ ] `eslint.config.js` — new `no-restricted-syntax` rule banning `TOKENS.find` / `ALL_TOKENS.find` outside allowlist (DRIFT-01); mirrors TRADE-01 shape at `eslint.config.js:46-65`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 04-RUNBOOK.md OBS-03 transcript-capture procedure works end-to-end | TEST-03 | Requires Vercel Logs access + production failure data; cannot run in CI | Operator pulls a recent OBS-03 failure from Vercel Logs, runs the redaction recipe, lands the JSON under `tests/fixtures/marketOrder/`, runs replay test — green = procedure works |
| HUMAN-UAT carry-forward: PERF-01 p75 LCP < 2.5s | (Phase 2 deferred) | Requires post-deploy real-traffic measurement | `/gsd-verify-work` against deployed Vercel measurement |
| HUMAN-UAT carry-forward: SEC-03+04 D-04b runtime UX (no mid-session re-signing) | (Phase 3 deferred) | Requires multi-tab / multi-day session simulation | `/gsd-verify-work` per `03-RUNBOOK.md` smoke recipe |
| CLAUDE.md surgical edit reads naturally as a document | DRIFT-03 | Prose quality is human-judged | Reviewer reads the post-edit file end-to-end |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (anvil, fixtures, ESLint rule, codemod, integration config)
- [ ] No watch-mode flags (all commands use `--run`)
- [ ] Feedback latency < 30s for quick suite, < 5 min for integration
- [ ] `nyquist_compliant: true` set in frontmatter (set by phase-exit wave once all per-task entries are populated by the planner)

**Approval:** pending
