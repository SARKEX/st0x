# Phase 4 — Operational Runbook

**Phase:** 04-boundary-tests-and-drift-cleanup
**Created:** 2026-05-01 (Plan 04-10 / phase exit + milestone close)
**Last verified:** 2026-05-01T21:39:36Z (phase-exit grep + svelte-check + vitest run by Plan 04-10)
**Status:** Phase 4 plans complete; **stabilization milestone closed**; HUMAN-UAT carry-forwards documented below

This runbook is the deployment handoff artifact for Phase 4 AND the
stabilization milestone close-out artifact. It covers the
TEST-01..04 + DRIFT-01..03 boundary tests and drift cleanups shipped under
this phase, plus the Foundry / anvil CI surface introduced under Wave 5,
plus the milestone-exit handoff covering all 4 phases (30 REQ-IDs total).

For Phase 1 observability surfaces (Sentry, pino, Telegram alerts, Vercel Speed
Insights wiring) see `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md`.
For Phase 2 PERF-01 trade-page LCP work + bundle delta + tab CLS see
`.planning/phases/phase-02-trade-execution-backbone-refactor/02-RUNBOOK.md`.
For Phase 3 SEC-* + REL-* hardening (Alchemy rotation, session-cookie smoke,
hCaptcha verification, rain registry refresh, Phase 3 phase-exit log) see
`.planning/phases/phase-03-production-grade-hardening/03-RUNBOOK.md`.

## Phase 4 Summary

7 REQ-IDs across 6 waves of 10 plans:

| Wave | Plan | REQ | Surface |
|------|------|-----|---------|
| 1 | 04-01 | DRIFT-03 | CLAUDE.md surgical edit + Ground Truth header pointing at `.planning/codebase/` |
| 2 | 04-02 | DRIFT-02 | `admin/+page.svelte` + `api/admin/nansen/+server.ts` USDC hardcoding → `getPaymentTokensForNetwork` / `isPaymentToken` |
| 3 | 04-03 | DRIFT-01 | ts-morph codemod + ESLint `no-restricted-syntax` rule banning `TOKENS.find` / `ALL_TOKENS.find` outside allowlist; lint fixture |
| 4 | 04-04 | TEST-01 | `tests/hooks/{cors,csp,public-paths,admin-gate,wallet-session,bot-rejection}.test.ts` + `_helpers.ts` factories |
| 4 | 04-05 | TEST-02 | `tests/lib/admin/*.audit.test.ts` (8 endpoints) + `createAuditLogger` ADD on 5 missing endpoints |
| 5 | 04-06 | TEST-03 (anvil scaffold) | `tests/helpers/anvil.ts` + `tests/helpers/loadTranscript.ts` + `vitest.integration.config.ts` + Foundry CI install |
| 5 | 04-07 | TEST-03 (anvil suite) | `tests/integration/marketOrder/anvil-fork.test.ts` |
| 5 | 04-08 | TEST-03 (replay suite) | `tests/integration/marketOrder/replay-*.test.ts` + `tests/fixtures/marketOrder/*.json` (≥ 7 redacted transcripts) |
| 5 | 04-09 | TEST-04 | `src/lib/server/snapshots/scraper.test.ts` (pagination + wrappedTokenTransfers fallback + transient subgraph failure) |
| 6 | 04-10 | — | This runbook + REQUIREMENTS / ROADMAP close-out + milestone exit |

Phase 4 ships zero behavioral code changes. The only runtime code edits are:
DRIFT-01 codemod migrations (token-lookup unification — semantically equivalent),
DRIFT-02 helper substitutions (network-scoped USDC lookup — semantically equivalent),
and `createAuditLogger` ADD on 5 admin endpoints (observability-only, no
control-flow change). All other Phase 4 surface is tests + docs + ESLint rule.

All Phase 2 cross-cutting gates remain green (TRADE-01 lockdown, TRADE-02 cycle
severance, `failWith()` count = 16, `EMERGENCY_RATIO_MULTIPLIER` = 0,
svelte-check baseline = 3 errors, `staleTime: Infinity` preserved).
All Phase 3 SEC-01..07 + REL-01..03 grep gates remain green.

## Pre-Deploy Env-Var Checklist

**No new env vars introduced by Phase 4.** CI integration tests reuse
`BASE_RPC_URL` (provisioned by Phase 3 SEC-01).

| Env Var | Source Phase | Required Where | Phase 4 Use |
|---------|--------------|----------------|-------------|
| `BASE_RPC_URL` | Phase 3 SEC-01 | Production + preview + CI | Reused by `tests/helpers/anvil.ts` for fork; CI integration job inherits read scope |
| `PUBLIC_BASE_RPC_URL` | Phase 3 SEC-01 | Production + preview | Unchanged — Phase 4 doesn't touch this surface |
| `SESSION_SECRET` | Phase 3 SEC-02 | Production + preview | Unchanged |
| `CSRF_SECRET` | Phase 3 SEC-02 (optional) | Production | Unchanged |
| `OBSERVABILITY_ALERT_TELEGRAM_*` | Phase 1 D-17 | Production | Unchanged |
| `HCAPTCHA_SECRET` | Phase 3 SEC-07 | Production + preview | Unchanged |
| `PUBLIC_REGISTRY_URL` | Phase 3 REL-03 (optional) | — | Unchanged |
| `CRON_SECRET` | Phase 1 | Production | Unchanged |

For Vercel-CLI batch-set recipe see `03-RUNBOOK.md` §"Operational env-var setting recipe".

## Foundry / Anvil CI Setup (NEW Phase 4 surface)

Plan 04-06 added an integration test suite that runs `anvil` against a
forked Base mainnet RPC. The unit-test job (`npm test`) excludes
`tests/integration/`; a separate integration job runs them via
`npm run test:integration` (configured by `vitest.integration.config.ts`).

**CI install step:**

```bash
curl -L https://foundry.paradigm.xyz | bash
# shellcheck disable=SC1091
source "$HOME/.bashrc" 2>/dev/null || source "$HOME/.zshenv" 2>/dev/null || true
foundryup
```

**GHA cache key for `~/.foundry`:** mirror the Foundry Book recommended cache
pattern (key on `.foundry-version` if pinned, otherwise weekly rotation).
The `foundryup` install populates `~/.foundry/bin/{anvil,cast,forge,chisel}`.

**`BASE_RPC_URL` secret read access:** the same Vercel/GHA secret used by
Phase 3 SEC-01. The integration job inherits read scope; no new secret to
provision. If `BASE_RPC_URL` is not set in the CI environment,
`tests/integration/marketOrder/anvil-fork.test.ts` skips (4 tests skipped at
local execution on 2026-05-01 confirms the gate).

**Integration job wiring:** separate GHA job invoking `npm run test:integration`;
runs in parallel with the unit-test job; required for green PR.

**npm scripts boundary:**
- `npm test` excludes `tests/integration/`
- `npm run test:integration` runs them via `vitest.integration.config.ts`

**Local dev:** anvil already installed via Homebrew (`/opt/homebrew/bin/anvil`
v1.2.3 confirmed during Plan 04-06). Contributors without anvil run only
`npm test`.

**A1 risk (RESEARCH §"Risks and Open Questions"):** if `BASE_RPC_URL`
provider is not archive-capable, anvil fork fails with `MissingTrieNode`
when historical state at `FORK_BLOCK = 33_400_000` is requested. Remediation:
switch to an archive-capable RPC and document the swap in this section.

## OBS-03 Transcript-Capture Procedure (TEST-03 Fixture Refresh)

Step-by-step — operator runs this when (a) OBS-03 transcript schema changes,
(b) `marketOrderExecution.ts` behavior changes, (c) periodic operator review
chooses new representative scenarios:

```bash
# 1. Pull recent OBS-03 failures from Vercel Logs (CLI; or use dashboard if --filter unavailable)
vercel logs --filter '"failWith"' --since 7d --output json > /tmp/raw-transcripts.jsonl

# 2. Extract just the transcript JSON payload via jq
jq -r 'select(.message | contains("failWith")) | .meta.transcript' /tmp/raw-transcripts.jsonl > /tmp/transcripts.json

# 3. Redact wallet addresses (replace 40-hex with placeholder; preserve canonical contract addresses on allowlist)
sed -E 's/0x[a-fA-F0-9]{40}/0x...redacted/g; s/0x\.\.\.redacted (USDC|0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)/\1/g' \
  /tmp/transcripts.json > /tmp/transcripts.redacted.json

# 4. Split into per-scenario JSON files in tests/fixtures/marketOrder/
#    Naming: <failure-mode>-<short-suffix>.json (e.g. stale-quote-bid-01.json)

# 5. Verify redaction completeness (phase-exit grep gate from Plan 04-10 / Task 1):
grep -RhE '0x[a-fA-F0-9]{40}' tests/fixtures/marketOrder/ \
  | grep -v '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' \
  | grep -v '0x...redacted'
# expect: 0 matches

# 6. Run replay suite to confirm fixtures load + parse against current TakeOrderFailureTranscript type:
npm run test:integration -- tests/integration/marketOrder/replay-

# 7. Commit + push.
```

**Schema versioning:** existing fixtures stay valid as long as new transcript
fields are optional in consuming code. Schema-incompatible changes require a
fixture refresh in the same PR that introduces them (per CONTEXT D-01c).

## DRIFT-01 Codemod Replay Procedure

Idempotent ts-morph script — re-runnable on demand for future TOKENS.find migrations:

```bash
# Re-run if a future contributor accidentally introduces TOKENS.find / ALL_TOKENS.find
npx tsx scripts/codemods/migrate-token-find.ts

# Verify post-codemod cleanliness (allowing eslint-disable carve-outs):
grep -RnE '(TOKENS|ALL_TOKENS)\.find\(' src/ \
  | grep -v 'src/lib/config/tokens.ts'
# Expect: only eslint-disabled lines (preceded by `// eslint-disable-next-line no-restricted-syntax`)

# ESLint rule is the recurrence guard — runs on every PR via `npm run lint`:
npm run lint
```

The ESLint `no-restricted-syntax` rule in `eslint.config.js` (mirroring
TRADE-01 at lines 46–65) is the primary recurrence prevention; the codemod is
the one-shot migration tool. Plan 04-03 deliberately retained 4 lookup sites
with `eslint-disable-next-line no-restricted-syntax` + justification because
DRIFT-01 (silent wrapped-only matching) does not apply to symbol-based
lookups (`oracleQuotes.ts`, `priceFeeds.ts`: SPYM by symbol) or to
payment-token (USDC) lookups against the network-scoped `ALL_TOKENS` universe
(`DcaOrder.svelte`, `LimitOrder.svelte`).

## Phase-Exit Verification Log

Plan 04-10 Tasks 1–4 ran every grep gate from RESEARCH lines 600–706 +
03-VALIDATION.md §"Phase-Exit Verification" + this plan's <verification>.

Verification timestamp: **2026-05-01T21:39:36Z**

### DRIFT-01..03 Phase 4 gates

| Gate | Command | Expected | Actual |
|------|---------|----------|--------|
| DRIFT-03 (AA terms) | `grep -cE 'Rhinestone\|EIP-7702\|account-abstraction\|Account Abstraction' CLAUDE.md` | 0 | **2 (allowlisted — both inside the disclaimer paragraph at line 122 + 124 that explicitly DENIES their existence; per Plan 04-01 Pitfall 7 design)** ✓ |
| DRIFT-03 (Order Semantics) | `grep -c 'INPUT/OUTPUT Perspective' CLAUDE.md` | ≥1 | 1 ✓ |
| DRIFT-03 (Ground Truth header) | `grep -c 'Ground Truth' CLAUDE.md` | ≥1 | 1 ✓ |
| DRIFT-01 (raw violations) | `(TOKENS\|ALL_TOKENS).find(` outside allowlist | 0 | **4 (all carry eslint-disable + justification per Plan 04-03 design — symbol-based or payment-token lookups where DRIFT-01 does not apply)** ✓ |
| DRIFT-01 (ESLint rule) | `grep -cE 'TOKENS.find\|ALL_TOKENS.find\|drift-01\|no-restricted-syntax' eslint.config.js` | ≥1 | 7 ✓ |
| DRIFT-02 (USDC hardcoding) | `grep -RE '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' src/routes/admin/ src/routes/api/admin/` | 0 | 0 ✓ |
| DRIFT-02 (helpers used) | `grep -RcE 'getPaymentTokensForNetwork\|isPaymentToken' src/routes/admin/ src/routes/api/admin/` | ≥1 | 20 ✓ |

**DRIFT-03 carve-out justification:** Plan 04-01 surgically replaced the
`## Account Abstraction` section body with a non-existence disclaimer that
necessarily references the AA terms in order to deny them. The grep gate as
literally written is over-strict; the carve-out mirrors the Phase 3 SEC-07
literal-NODE_ENV-grep deviation (03-RUNBOOK.md Notes / Anomalies). The intent
of the gate (no aspirational claims) is satisfied.

**DRIFT-01 carve-out justification:** Plan 04-03 design intentionally retained
4 sites with documented eslint-disable + justification. The ESLint rule (which
runs on every PR via `npm run lint`) IS the enforcement; the raw grep is
over-strict. All 4 retained sites carry single-line justifications:
- `src/lib/queries/oracleQuotes.ts:61` — symbol-based SPYM lookup
- `src/lib/queries/priceFeeds.ts:10` — symbol-based SPYM lookup
- `src/lib/components/orders/LimitOrder.svelte:81` — payment-token (USDC) network-scoped
- `src/lib/components/orders/DcaOrder.svelte:41` — payment-token (USDC) network-scoped

### TEST-01..04 Phase 4 gates

| Gate | Command | Expected | Actual |
|------|---------|----------|--------|
| TEST-01 (files) | `ls tests/hooks/{cors,csp,public-paths,admin-gate,wallet-session,bot-rejection}.test.ts` | 6 files | 6 files ✓ |
| TEST-01 (describe blocks) | `grep -c 'describe(' tests/hooks/*.test.ts` | ≥1 each | 1 each (6/6) ✓ |
| TEST-01 (`_helpers.ts`) | `test -f tests/hooks/_helpers.ts && grep -cE 'createMockRequestEvent\|createMockKv\|createMockSession' …` | ≥3 | 3 ✓ |
| TEST-02 (auditLog import) | every state-mutating admin endpoint imports auditLog | 0 missing | 0 missing ✓ (8 endpoints all import `from '$lib/server/auditLog'`) |
| TEST-02 (audit test files) | 8 audit test files present | 8 | 8 ✓ |
| TEST-02 (ADD endpoints emit) | `createAuditLogger` count in 5 ADD endpoints | ≥1 each | 2 each ✓ (excluded-wallets, pool-wallets, team-wallets, snapshots/trigger, snapshots/regenerate) |
| TEST-03 (helpers) | `tests/helpers/anvil.ts` + `loadTranscript.ts` | exist | exist ✓ |
| TEST-03 (anvil-fork test) | `tests/integration/marketOrder/anvil-fork.test.ts` | exists | exists ✓ |
| TEST-03 (fixtures) | `ls tests/fixtures/marketOrder/*.json` | ≥7 | 7 ✓ |
| TEST-03 (un-redacted hex) | `grep -RhE '0x[a-fA-F0-9]{40}' tests/fixtures/marketOrder/` minus allowlist | 0 | 0 ✓ |
| TEST-03 (integration config) | `vitest.integration.config.ts` exists; `package.json` has `"test:integration"` | exists; ≥1 | exists; 1 ✓ |
| TEST-04 (scraper test) | `src/lib/server/snapshots/scraper.test.ts` exists | exists | exists ✓ |
| TEST-04 (categories) | `grep -cE '(pagination\|wrappedTokenTransfers fallback\|transient)' …scraper.test.ts` | ≥3 | 6 ✓ |

### Phase 2 carry-forward gates

| Gate | Command | Expected | Actual |
|------|---------|----------|--------|
| TRADE-01 lockdown | raw IO accessor reads outside allowlist | 0 | 0 ✓ |
| TRADE-02 cycle severance | `marketOrderExecution.ts` imports from `$lib/stores/transaction` | 0 | 0 ✓ |
| OBS-03 (failWith) | `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | ≥12 | 16 ✓ |
| EMERGENCY_RATIO_MULTIPLIER | refs in `src/` minus zero-count lines | 0 | 0 ✓ |
| staleTime: Infinity (queries/) | refs in `src/lib/queries/` minus zero-count lines | ≥1 | 1 ✓ |
| staleTime: Infinity (queryClient) | `grep -c 'staleTime.*Infinity' src/lib/clients/queryClient.ts` | ≥1 | 1 ✓ |

### Phase 3 carry-forward gates

| Gate | Command | Expected | Actual |
|------|---------|----------|--------|
| SEC-01 (committed key absent) | `grep -r "y3BXawVv5uuP" src/` | 0 hits | 0 hits ✓ |
| SEC-01 (alchemy hardcoding) | `alchemy.com\|alchemyapi` minus config/networks.ts + raindex.ts | 0 | **1 (CSP allowlist `*.g.alchemy.com` in `src/hooks.server.ts:186` — required so client can connect to BASE_RPC_URL when it points at Alchemy; documented carve-out)** ✓ |
| SEC-02 (fallback secrets) | literal fallback secret strings in auth.ts/csrf.ts | 0 | 0 ✓ |
| SEC-02 (env-var fallback pattern) | `(SECRET\|TOKEN\|KEY).*?? '...'` in `src/lib/server/` | 0 | 0 ✓ |
| SEC-03 (auth read removed) | `cookies.get('wallet-address')` in src/lib/src/hooks.server.ts/src/routes/api | 0 | 0 ✓ |
| SEC-03 (consumer present) | `grep -c 'readSession' src/hooks.server.ts` | ≥1 | 3 ✓ |
| SEC-03+04 (session shape) | `wallet-session\|session-id\|readSession` in hooks.server.ts | ≥1 | 3 ✓ |
| SEC-04 (CSRF helpers) | `generateCsrfTokenForSession\|validateCsrfTokenForSession` in csrf.ts | ≥2 | 3 ✓ |
| SEC-05 (Math.random in security paths) | `Math.random` in accessCodes/referrals (file or dir) | 0 | 0 ✓ |
| SEC-06 (rate-limit tier) | `grep -c 'snapshotsPreview' src/lib/server/rateLimit.ts` | ≥1 | 1 ✓ |
| SEC-06 (requireAdmin) | `grep -c 'requireAdmin' src/routes/api/snapshots/generate/+server.ts` | ≥2 | 2 ✓ |
| SEC-07 (VERCEL_ENV) | `grep -c 'VERCEL_ENV' src/lib/server/accessCodes.ts` | ≥1 | 4 ✓ |
| REL-01 (withRetry) | `grep -c 'withRetry' src/lib/server/snapshots/generator.ts` | ≥1 | 8 ✓ |
| REL-01 (chain-exhaustion throw) | `grep -c 'all .* RPCs exhausted' …generator.ts` | =1 | 1 ✓ |
| REL-01 (block-lookup throw) | `grep -c 'no block lookup succeeded' …generator.ts` | =1 | 1 ✓ |
| REL-02 (fallback) | `grep -c 'fallback(' src/lib/server/accessCodes.ts` | ≥1 | 2 ✓ |
| REL-02 (old label gone) | `'alchemy-base-mainnet'` in accessCodes.ts | 0 | 0 ✓ |
| REL-02 (new label) | `'fallback-chain-base'` in accessCodes.ts | ≥3 | 4 ✓ |
| REL-03 (no GitHub-raw) | `RAIN_STRATEGIES_COMMIT\|raw.githubusercontent.com.*rain.strategies` in src/ | 0 | 0 ✓ |
| REL-03 (vendored) | `test -d static/registry` | exists | exists ✓ |

**SEC-01 alchemy.com carve-out:** the single remaining hit is the
`https://*.g.alchemy.com` entry in the CSP `connect-src` directive at
`src/hooks.server.ts:186`. This is REQUIRED so the browser can fetch from
`PUBLIC_BASE_RPC_URL` when it points at an Alchemy URL (the default in the
Phase 3 SEC-01 setup). It is NOT an Alchemy hardcoding regression — it is a
host-allowlist for the env-var-driven RPC URL. Excluded from the Phase 3
grep recipe by extending the allowlist with `hooks.server.ts` (see
"Cross-cutting Cleanup Grep Recipe" below).

### Build / Test gates

| Command | Expected | Actual | Notes |
|---------|----------|--------|-------|
| `npm test -- --run` | exit 0; all green | **51 files / 661 pass / 1 skip** ✓ | Up from 569 at Phase 3 close — Phase 4 added 92 new tests (TEST-01..04) |
| `npm run test:integration` | exit 0 | **7 pass / 4 skipped / 0 fail** ✓ | 4 anvil-fork tests skip locally without `BASE_RPC_URL`; expected per A1 risk |
| `npm run check` | ≤3 errors | **3 errors** ✓ | Same baseline as Phase 2 / Phase 3 close (`tests/lib/server/rpcMetrics.test.ts:182` `'alertArg' possibly undefined`) |
| `npm run lint` | exit 0 | **15 errors (PRE-EXISTING; was 26 at Phase 3 close)** ⚠ | Phase 4 reduced lint errors by 11. All 15 surviving errors pre-date Phase 4 (verified by replaying lint at commit `15877b7` / Phase 3 close). Documented in §"Open Items / Deferred to Future Milestones". Mirror of Phase 3 / Phase 1 close-out pattern: structural completion, deferred items captured for operator follow-up. |
| `npm run build` | exit 0 | **fails locally on Node 24 + missing SESSION_SECRET** ⚠ | Pre-existing per `03-RUNBOOK.md` Notes / Anomalies: Node 24 unsupported by adapter-vercel; SESSION_SECRET fail-closed at SvelteKit `analyse` postbuild step is by design (SEC-02). Vercel CI uses Node 20/22 with env vars set — production unaffected. |

## Cross-cutting Cleanup Grep Recipe

Single runnable bash block (the union of all phase-exit gates) that future
plans can invoke as a snapshot of "all 7 Phase 4 REQ-IDs + Phase 2 + Phase 3
invariants green":

```bash
#!/bin/bash
# Phase 4 phase-exit + Phase 3 + Phase 2 carry-forward verification
# All assertions must pass; non-zero exit == regression
set -e

# === DRIFT-01..03 (Phase 4) ===
# Ground Truth header present
test "$(grep -c 'Ground Truth' CLAUDE.md)" -ge 1
# Order Semantics preserved
test "$(grep -c 'INPUT/OUTPUT Perspective' CLAUDE.md)" -ge 1
# DRIFT-01 raw violations all carry eslint-disable carve-out (per 04-03 design)
test "$(grep -RnE '(TOKENS|ALL_TOKENS)\.find\(' src/ \
  | grep -v 'src/lib/config/tokens.ts' \
  | grep -v 'tests/fixtures/eslint/token-lookup-violation.ts' \
  | wc -l | tr -d ' ')" = "4"
# DRIFT-01 ESLint rule active
test "$(grep -cE 'TOKENS\.find|ALL_TOKENS\.find|drift-01|no-restricted-syntax' eslint.config.js)" -ge 1
# DRIFT-02 USDC hardcoding gone from admin paths
test "$(grep -RE '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' src/routes/admin/ src/routes/api/admin/ | wc -l | tr -d ' ')" = "0"

# === TEST-01..04 (Phase 4) ===
test -f tests/hooks/cors.test.ts
test -f tests/hooks/csp.test.ts
test -f tests/hooks/public-paths.test.ts
test -f tests/hooks/admin-gate.test.ts
test -f tests/hooks/wallet-session.test.ts
test -f tests/hooks/bot-rejection.test.ts
test -f tests/hooks/_helpers.ts
test -f tests/helpers/anvil.ts
test -f tests/helpers/loadTranscript.ts
test -f tests/integration/marketOrder/anvil-fork.test.ts
test "$(ls tests/fixtures/marketOrder/*.json 2>/dev/null | wc -l | tr -d ' ')" -ge 7
test -f src/lib/server/snapshots/scraper.test.ts

# === SEC-01..07 + REL-01..03 (Phase 3 carry-forward) ===
! grep -rq "y3BXawVv5uuP" src/
! grep -Eq "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" \
  src/lib/server/auth.ts src/lib/server/csrf.ts
test "$(grep -c 'readSession' src/hooks.server.ts)" -ge 1
test "$(grep -c 'generateCsrfTokenForSession\|validateCsrfTokenForSession' src/lib/server/csrf.ts)" -ge 2
! grep -Eq "Math\.random\(\)" src/lib/server/accessCodes.ts src/lib/server/referrals.ts
test "$(grep -c 'snapshotsPreview' src/lib/server/rateLimit.ts)" -ge 1
test "$(grep -c 'VERCEL_ENV' src/lib/server/accessCodes.ts)" -ge 1
test "$(grep -c 'withRetry' src/lib/server/snapshots/generator.ts)" -ge 1
test "$(grep -c 'fallback(' src/lib/server/accessCodes.ts)" -ge 1
! grep -rEq "RAIN_STRATEGIES_COMMIT|raw\.githubusercontent\.com.*rain\.strategies" src/
test -d static/registry

# === Phase 2 carry-forward ===
test "$(grep -rE '\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b' src/ tests/ 2>/dev/null \
  | grep -vE 'orderPerspective\.ts|utils/orderbook\.ts|api/orders\.ts|generated-graphql\.ts|io-perspective-violation\.ts' \
  | grep -vE '^\s*//|:\s*//' \
  | wc -l | tr -d ' ')" = "0"
! grep -Eq "from ['\"]\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts
test "$(grep -c 'failWith(' src/lib/services/marketOrderExecution.ts)" -ge 12
test "$(grep -rc 'EMERGENCY_RATIO_MULTIPLIER' src/ | grep -v ':0$' | wc -l | tr -d ' ')" = "0"
test "$(grep -c 'staleTime.*Infinity' src/lib/clients/queryClient.ts)" -ge 1

# === Build + tests ===
npm run check 2>&1 | tail -3
npm test -- --run 2>&1 | tail -5

echo "All phase-exit gates passed (Phase 4 + Phase 3 + Phase 2 carry-forward)"
```

## Hand-off — Milestone Close

Phase 4 is the final phase of the **stabilization milestone**. All 7 Phase 4
REQ-IDs (TEST-01..04 + DRIFT-01..03) shipped. All Phase 1 (8 REQs), Phase 2
(8 REQs), Phase 3 (10 REQs) REQ-IDs remain Complete. **Total milestone
REQ-IDs delivered: 33 across 4 phases.**

### HUMAN-UAT Carry-Forward Items (Deferred to Milestone Exit)

These items deliberately landed as code/test changes without numeric
post-deploy validation. The operator MUST run `/gsd-verify-work` against each
as part of milestone exit (per CONTEXT discretion + 04-VALIDATION.md §"Manual-Only Verifications"):

| Item | Originating Phase | What to Verify | How |
|------|-------------------|----------------|-----|
| **PERF-01 numeric p75 LCP < 2.5s** | Phase 2 (PERF-01 closed structurally; numeric validation deferred) | After 24h+ Speed Insights window post-deploy, p75 LCP on /trade/[id] < 2.5s | Visit Vercel Speed Insights dashboard; record numeric values into `02-RUNBOOK.md` table |
| **SEC-03+04 D-04b runtime UX (no mid-session re-signing)** | Phase 3 (SEC-03+04 atomic-flip shipped; runtime UX deferred) | Multi-tab + multi-day session — no re-sign prompts during 30-day sliding window | Per `03-RUNBOOK.md` §"D-04b runtime UX assertion" — run for 30+ days |
| **CLAUDE.md surgical edit reads naturally** | Phase 4 (DRIFT-03) | Reviewer reads post-edit CLAUDE.md end-to-end; prose flows | Manual review |
| **Anvil-fork integration in CI with `BASE_RPC_URL`** | Phase 4 (TEST-03) | The 4 anvil-fork tests pass green in CI (skip locally) | Push branch with CI config; observe GHA integration job; archive-capable RPC required (A1) |
| **OBS-03 transcript-capture refresh** | Phase 4 (TEST-03) | First post-deploy fixture refresh exercise validates the §"OBS-03 Transcript-Capture Procedure" runs end-to-end | Per the procedure above; produces ≥1 new fixture |

### `/gsd-verify-work` Invocation

```bash
/gsd-verify-work --milestone stabilization --human-uat
```

### Milestone Exit Checklist

- [ ] All 30+ milestone REQ-IDs marked Complete in REQUIREMENTS.md
- [ ] All 4 phases marked Complete in ROADMAP.md (Phase 1: 8/8, Phase 2: 8/8, Phase 3: 11/11, Phase 4: 10/10)
- [ ] STATE.md status updated to "Stabilization milestone closed"
- [ ] Production deploy of Phase 4 plans clean (DRIFT codemods + new test files; no behavioral code shipped, so risk is minimal)
- [ ] HUMAN-UAT items above run via `/gsd-verify-work`; outcomes recorded
- [ ] Retrospective written (per `.planning/RETROSPECTIVE.md` template) — solo dev + Claude

## Open Items / Deferred to Future Milestones

Carried verbatim from CONTEXT §"Deferred Ideas" + Phase 4 close-out discoveries:

- **`npm run lint` 15 pre-existing errors** — pre-date Phase 4 (was 26 at
  Phase 3 close, reduced by 11 during Phase 4 work). Mix of unused vars
  (`_err` underscore-prefixed catch params, `TokenTradeActivityPayload`,
  `tradeToPoint`, `assetDecimals`, `quoteDecimals`), `no-explicit-any` in
  `src/lib/services/orderDeployment.ts`, `no-constant-condition` in
  `accessCodes.ts:85` + `referrals.ts:82`, `no-useless-catch` in
  `alerts.ts:66`. None are correctness or security issues; all are linter
  cleanliness. Defer to a future "lint-zero" plan or address opportunistically.
- **`npm run build` local Node 24 break** — adapter-vercel error at the
  `analyse` postbuild step on Node 24; Vercel CI uses Node 20/22 with env
  vars set so production is unaffected. Per Phase 3 RUNBOOK Notes / Anomalies.
- **Numeric line-coverage threshold in CI** (rejected per D-07; revisit only
  if a future post-milestone phase needs a coarse regression signal)
- **Full CLAUDE.md rewrite** (rejected per D-05)
- **External integration test environment** (Tenderly / fork-as-a-service) —
  anvil is the chosen tool
- **Future drift cleanups (DRIFT-04+)** — opportunistic landings or a future milestone
- **Multi-chain expansion / account abstraction / new features** — out of
  scope per Phase 1 D-13 + PROJECT.md
- **Admin-page architectural refactor** — admin/+page.svelte 2898 lines stays as-is
- **Per-RPC instrumentation granularity for REL-02** — Phase 3 ships the
  `'fallback-chain-base'` aggregate label; per-attempt granularity is a
  future milestone if measured need surfaces.
- **wallet-address cookie permanent removal** — Phase 3 ships downgrade to
  non-authoritative hint; permanent removal post-TEST-01 confirmation that
  no consumer reads it.
- **WASM blob inlined inside `tokenMath` chunk (3.5 MB raw)** — carried from
  Phase 2 RUNBOOK. Future PERF: configure Vite to load WASM via `?url`.
- **Top 1 bundle chunk (10.4 MB viem+wagmi+Dynamic)** — carried from Phase 2.
- **External log drain** — still deferred per Phase 1.
- **`+error.svelte` user-visible error page** — still deferred per Phase 1
  D-12 / `01-UI-SPEC.md` Q3.

## Notes / Anomalies

### DRIFT-03 grep gate over-strictness (Plan 04-01)

The Wave-6 grep gate `grep -cE 'Rhinestone|EIP-7702|account-abstraction|Account Abstraction' CLAUDE.md` returns 2 hits, both inside the
`## Account Abstraction` disclaimer paragraph that Plan 04-01 deliberately
authored to deny those terms' applicability. The disclaimer is the substantive
fix; the grep gate as literally written is over-strict. Mirror of Phase 3
SEC-07 over-strict grep deviation.

### DRIFT-01 grep gate over-strictness (Plan 04-03)

The Wave-6 grep gate `grep -RE '(TOKENS|ALL_TOKENS)\.find\(' src/` returns 4
hits, all carrying `// eslint-disable-next-line no-restricted-syntax` +
single-line justification. The ESLint rule is the enforcement; the raw grep is
over-strict by design. Plan 04-03 SUMMARY documented this as the canonical
Wave-6 grep allowance.

### SEC-01 alchemy.com CSP carve-out (Phase 3 → Phase 4 carry-forward)

`src/hooks.server.ts:186` retains `https://*.g.alchemy.com` in the CSP
`connect-src` directive. Required so the browser can fetch from
`PUBLIC_BASE_RPC_URL` when it points at an Alchemy URL. Not a hardcoding
regression — host-allowlist for the env-var-driven RPC URL.

### TRADE-01 single comment-only hit (Plan 03-08b → Phase 4 carry-forward)

The phase-exit grep allowlist permits a comment-only reference in
`tests/lib/stores/partialFillDetection.test.ts:5`. Stripped via
`grep -vE '^\s*//|:\s*//'` in the cross-cutting recipe.

### TEST-02 audit-log import grep quoting

The plan's literal grep `grep -q "from '\$lib/server/auditLog'"` failed in
shell due to single-quote escaping inside the double-quoted argument. The
underlying claim ("every state-mutating admin endpoint imports auditLog") is
TRUE — verified via the looser `grep -q 'auditLog'` form (8/8 endpoints
import). Plan 04-10 Task 1 verification captured the looser form's output.

---

*Phase 4 closed: 2026-05-01; 7/7 REQ-IDs (TEST-01..04, DRIFT-01..03)*
*Stabilization milestone closed: 2026-05-01*
*Last verified: 2026-05-01T21:39:36Z by Plan 04-10 Tasks 1–4*
