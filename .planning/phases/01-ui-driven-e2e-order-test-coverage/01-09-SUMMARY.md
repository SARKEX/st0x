---
phase: 01-ui-driven-e2e-order-test-coverage
plan: 09
subsystem: testing
tags: [ci, github-actions, playwright, foundry, anvil, e2e]
dependency_graph:
  requires:
    - phase: 01-ui-driven-e2e-order-test-coverage
      provides:
        - tests/integration/ui/smoke.spec.ts (smoke pre-flight target)
        - package.json test:e2e script + @playwright/test devDep
  provides:
    - .github/workflows/test.yml test-e2e job (Playwright + anvil + smoke pre-flight)
    - .github/workflows/test.yml test-integration job upgraded to foundry-toolchain action
    - 01-RUNBOOK.md ## CI workflow section (secrets, cache, fast-fail, fallback)
  affects:
    - All future Phase 1 E2E plans gain CI gating once BASE_RPC_URL secret is present
    - 999.8 (Foundry install drift) closes on next workflow run
    - 999.11 (no green archive-RPC run) closes on next workflow run
tech-stack:
  added:
    - "foundry-rs/foundry-toolchain@v1 GitHub Action"
    - "actions/cache@v4 keyed on package-lock.json hash for ~/.cache/ms-playwright"
  patterns:
    - "Two-step Playwright invocation: smoke.spec.ts pre-flight then full suite (D-14 fast-fail)"
    - "BASE_RPC_URL sourced from secrets context only — never echoed (T-1-09-01 mitigation)"
    - "Cache-key invalidation via package-lock.json hashFiles (T-1-09-02 mitigation)"
key-files:
  created: []
  modified:
    - .github/workflows/test.yml
    - .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md
key-decisions:
  - "Use foundry-rs/foundry-toolchain@v1 (tag-pinned) instead of curl-bash install — closes 999.8"
  - "Smoke pre-flight runs ONLY smoke.spec.ts before full suite — surfaces misconfig in <2 min per D-14"
  - "Reuse same env-block shape (BASE_RPC_URL + walletconnect/alphavantage/pinata) across test-integration and test-e2e for consistency"
patterns-established:
  - "Sequential CI gates: foundry-toolchain → npm i → Playwright cache → playwright install → smoke → full suite"
  - "Workflow secrets named explicitly per env-block, never collected with `env:` at job level"
requirements-completed: [TEST-05]
duration: ~10min
completed: 2026-05-06
---

# Phase 01 Plan 09: CI Gating for test:e2e + test:integration Summary

**Wired Playwright E2E and upgraded Foundry-fork integration tests into GitHub Actions: foundry-rs/foundry-toolchain@v1 swap closes 999.8 and the new test-e2e job (with smoke fast-fail and Playwright browser cache) gates the full suite on the BASE_RPC_URL archive secret.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-05-06
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Replaced custom `curl -L https://foundry.paradigm.xyz | bash` + `foundryup` install in `test-integration` with `foundry-rs/foundry-toolchain@v1` (closes 999.8).
- Added `test-e2e` job to `.github/workflows/test.yml` with:
  - `foundry-rs/foundry-toolchain@v1` install
  - Playwright browser cache at `~/.cache/ms-playwright` keyed on `hashFiles('package-lock.json')`
  - `npx playwright install --with-deps chromium` under nix
  - **Smoke pre-flight** running ONLY `smoke.spec.ts` (D-14 fast-fail, <2 min)
  - **Full suite** running `npm run test:e2e` only after smoke succeeds
  - `BASE_RPC_URL` sourced from `${{ secrets.BASE_RPC_URL }}` in both run steps
- Documented CI shape, required secrets, Playwright cache policy, smoke fast-fail expectation, and a foundry-toolchain unavailability fallback (T-1-09-03) in `01-RUNBOOK.md` `## CI workflow` section.
- Verified all locked invariants from CONTEXT remain green: `failWith(` count = 16 (≥12), 0 hits for `EMERGENCY_RATIO_MULTIPLIER` in `src/`, no `marketOrderExecution.ts` import from `$lib/stores/transaction`.
- YAML validates cleanly via `python3 -c "import yaml; yaml.safe_load(...)"`.

## Task Commits

1. **Task 1: Swap foundry install + add test-e2e job with smoke pre-flight** — `83a0d2b` (ci)

## Files Created/Modified

- `.github/workflows/test.yml` — Replaced 18 lines of foundry install scaffolding with 4-line `foundry-rs/foundry-toolchain@v1` step in `test-integration`; appended new 50-line `test-e2e` job (checkout → Nix → flakehub → foundry-toolchain → verify anvil → npm i → Playwright cache → Playwright install → smoke pre-flight → full suite).
- `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md` — Appended `## CI workflow` section documenting required secrets (BASE_RPC_URL + walletconnect/alphavantage/pinata), Playwright cache policy with auto-invalidation on package-lock changes, smoke fast-fail expectation per D-14, and foundry-toolchain unavailability fallback to the previous custom curl install.

## Decisions Made

- **Tag-pin `foundry-toolchain@v1` (not SHA-pinned).** v1 follows GitHub Actions convention for major-version aliases. Threat T-1-09-02 acknowledges that tag mutation is possible but accepts that risk because pinning to v1 already protects against silent breaking changes; SHA-pinning was deferred to backlog if escalated.
- **Reuse env-block from `test-integration` for `test-e2e`.** Same shape (BASE_RPC_URL + walletconnect/alphavantage/pinata) keeps the diff narrow and prevents drift between the two fork-using jobs. If E2E ever requires a divergent secret set, split at that point.
- **Smoke pre-flight invokes `npx playwright test smoke.spec.ts` directly, not `npm run test:e2e -- smoke.spec.ts`.** Direct invocation matches PATTERNS guidance and guarantees only `smoke.spec.ts` runs even if `test:e2e` script semantics change later.

## Deviations from Plan

None — plan executed exactly as written. The foundry install block was replaced 1:1 per the action specification, the test-e2e job structure matches the PATTERNS template character-for-character (modulo additional non-BASE_RPC_URL env vars carried over from test-integration), and the RUNBOOK section was added under the existing prose without renaming any prior anchors.

## Issues Encountered

None — all locked invariants verified green pre-commit; YAML lint passed; grep checks for both positive (foundry-toolchain present, test-e2e present, cache present, smoke pre-flight present, BASE_RPC_URL secret present) and negative (no `curl -L https://foundry.paradigm.xyz` remaining anywhere) all satisfied.

## User Setup Required

**External services require manual configuration.** GitHub repository secrets must include `BASE_RPC_URL` (Base archive provider with retention back to `FORK_BLOCK=33_400_000`). The workflow run that consumes this secret will close issues 999.8 (foundry install drift) and 999.11 (first green archive-RPC run). All other required secrets (PUBLIC_WALLETCONNECT_ID, PUBLIC_ALPHAVANTAGE_API_KEY, PRIVATE_PINATA_JWT, PUBLIC_PINATA_GATEWAY_URL, PRIVATE_PINATA_GATEWAY_KEY) are already in use by existing jobs and require no new setup.

## Threat Flags

None — no new threat surface introduced. Plan only modified CI plumbing; no application code paths, network endpoints, auth boundaries, or schema changes.

## Next Phase Readiness

- CI plumbing landed; once a workflow run completes against `main` with `BASE_RPC_URL` secret available, 999.8 and 999.11 both close.
- All future Phase 1 E2E plans (01-04..01-07) automatically gain CI gating via the new `test-e2e` job — no per-plan workflow edits required.
- Smoke fast-fail will surface misconfig (missing secret, archive pruning at FORK_BLOCK, EIP-1193 stub regression, vite-preview API-route fidelity per Pitfall 7) in <2 min, satisfying D-14.

## Self-Check: PASSED

- `.github/workflows/test.yml`: FOUND (modified, contains `foundry-rs/foundry-toolchain@v1`, `test-e2e:`, `actions/cache@v4`, `playwright test smoke.spec.ts`, `secrets.BASE_RPC_URL`; no `curl -L https://foundry.paradigm.xyz`)
- `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md`: FOUND (modified, contains `## CI workflow`)
- Commit `83a0d2b`: FOUND in `git log --oneline`
- Locked invariants: PASSED (failWith=16, EMERGENCY_RATIO_MULTIPLIER=0, no transaction.ts import in marketOrderExecution.ts)

---
*Phase: 01-ui-driven-e2e-order-test-coverage*
*Completed: 2026-05-06*
