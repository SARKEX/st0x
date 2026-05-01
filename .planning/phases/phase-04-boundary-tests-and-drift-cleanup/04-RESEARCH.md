# Phase 4: Boundary Tests & Drift Cleanup — Research

**Researched:** 2026-05-01
**Domain:** Test coverage scaffolding (Vitest + anvil-fork) + mechanical codemod/lint + documentation surgical edit
**Confidence:** HIGH

## Summary

Phase 4 is a closure phase: lock regression coverage at audit-flagged boundaries (`hooks.server.ts`, admin audit-log fan-out, `marketOrderExecution.ts` orchestration, `scraper.ts`) and execute three small drift cleanups (token lookup canonicalization + ESLint rule, payment-token canonicalization, `CLAUDE.md` surgical edit). CONTEXT.md locks 7 wave-level decisions (D-01..D-07); this research resolves the 8 explicitly discretionary items.

**Critical pre-existing-state findings** that change planning:

1. **`getPaymentTokensForNetwork(chainId: number): PythToken[]` ALREADY EXISTS** at `src/lib/config/tokens.ts:25`. DRIFT-02 is therefore "consume the existing helper", not "build a new one". Helper signature decision is moot.
2. **`isPaymentToken` ALREADY EXISTS** at `src/lib/utils/tokenMath.ts:213` with a symbol-or-object signature.
3. **Audit-log import gap is wider than the REQ-ID implies**: of 8 state-mutating admin endpoints, only 4 currently call `createAuditLogger`. TEST-02 must therefore include ADD audit-log calls for the 4 missing endpoints (or the runtime tests will all fail).
4. **`rewards-pool` admin endpoint does NOT exist** in the tree — already removed by Phase 1 DEPR-*.
5. **`TOKENS.find` site count differs from REQ-ID**: actual is 7 sites in 6 files (plus 5 `ALL_TOKENS.find` sites in components/routes). REQ-ID list is partially stale.
6. **`anvil` is already installed locally** (Homebrew, v1.2.3). CI install is the only new wiring.
7. **`scripts/codemods/codemod-trade-01.ts`** is referenced by Phase 2 02-01 but appears empty/missing in the working tree — researcher could not load the file body. The DRIFT-01 codemod must be re-derived from ts-morph idioms (or by reading the 02-01 plan + the ESLint rule already in `eslint.config.js:46-65`).

**Primary recommendation:** Land DRIFT (Waves 1-3) as small atomic PRs first; spike anvil scaffolding as a Wave-5 sub-plan ahead of orchestration tests; gate anvil-driven tests behind `npm run test:integration`; reuse the existing `getPaymentTokensForNetwork` helper for DRIFT-02; mirror the `eslint.config.js:46-65` TRADE-01 rule shape for DRIFT-01; add audit-log emission to the 4 missing state-mutating admin endpoints as part of TEST-02.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-06 Wave shape:** 5 implementation waves + 1 phase-exit wave, ordered DRIFT (Waves 1-3) → TEST (Waves 4-5) → phase-exit (Wave 6). Specific wave-to-REQ mapping per CONTEXT.md table.
- **D-06a Atomic-commits-with-svelte-check-green discipline carries forward:** every commit leaves svelte-check at the established baseline (3 errors after Phase 2 close), tests green, no mid-flight broken state. Phase 2 + Phase 3 cross-cutting gates must hold.
- **D-01 TEST-03 layered fixture strategy:** anvil fork (on-chain half) + replay JSON (subgraph half) + hand-built (pure-logic glue).
- **D-01a CI implications:** Foundry install step in GHA workflow; reuse `BASE_RPC_URL` from Phase 3 SEC-01; `tests/helpers/anvil.ts` spawn/teardown; planner picks inline-vs-gated.
- **D-01b OBS-03 transcript-capture format pre-existing:** matches in-source `TakeOrderFailureTranscript` type.
- **D-01c Fixture refresh policy:** schema-incompatible OBS-03 changes require fixture refresh as part of that future phase.
- **D-02 TEST-01 split per concern:** `tests/hooks/` directory with 6 files: `cors.test.ts`, `csp.test.ts`, `public-paths.test.ts`, `admin-gate.test.ts`, `wallet-session.test.ts`, `bot-rejection.test.ts`.
- **D-02a Shared scaffolding:** `tests/hooks/_helpers.ts` (underscore prefix to avoid auto-discovery) provides `createMockRequestEvent`, `createMockKv`, `createMockSession`.
- **D-03 TEST-02 runtime per-endpoint test:** import handler, `vi.mock('$lib/server/auditLog', ...)`, invoke handler with success-path + failure-path RequestEvent, assert mock invocation.
- **D-03a Endpoint inventory:** GET-only handlers excluded; researcher cross-references against Phase 1 DEPR.
- **D-03b Phase-exit grep guard:** every state-mutating admin handler imports from `$lib/server/auditLog` — secondary tripwire to runtime test.
- **D-04 DRIFT-01 codemod + ESLint:** ts-morph codemod migrates 8 sites + ESLint `no-restricted-syntax` rule + lint fixture. Mirrors TRADE-01.
- **D-04a Allowlist scope:** canonical lookup module is `src/lib/config/tokens.ts`. Test files using TOKENS-find as fixture get explicit allowlist.
- **D-04b Codemod-then-lint, not lint-then-fix:** codemod is one-shot migration; ESLint rule is recurrence guard.
- **D-05 DRIFT-03 surgical edit + Ground Truth pointer:** strike four false claims, add Ground Truth header pointing at `.planning/codebase/`, preserve Order Semantics + Rainlang + Dev Commands + Project Overview + Tech Stack (minus Rhinestone) + Project Structure (minus account-abstraction/).
- **D-05a No backfill:** do NOT pull additional content from `.planning/codebase/` into CLAUDE.md.
- **D-05b Drift-guard:** phase-exit grep `grep -E "Rhinestone|EIP-7702|account-abstraction" CLAUDE.md` returns 0.
- **D-07 Per-REQ-ID assertion only:** no numeric coverage threshold in CI. Phase-exit grep checks scenario-named test files + describe/it blocks.
- **D-07a Coverage instrumentation:** developer tool, not CI gate.

### Claude's Discretion

- TEST-04 scope and fixture style — resolved in this research (§ TEST-04 Resolution).
- TEST-03 fixture count and capture procedure — resolved (§ TEST-03 Resolution).
- Anvil-CI shape (inline vs gated) — resolved (§ Anvil-CI Resolution).
- DRIFT-02 helper signature — resolved: helper already exists; consume don't author (§ DRIFT-02 Resolution).
- DRIFT-01 ESLint rule placement — resolved: mirror `eslint.config.js:46-65` TRADE-01 shape (§ DRIFT-01 Resolution).
- TEST-02 endpoint inventory — resolved with explicit verb-by-verb list (§ TEST-02 Resolution).
- Phase-exit Wave 6 plan content — resolved (§ Phase-Exit Resolution).
- Validation Architecture — resolved (§ Validation Architecture).

### Deferred Ideas (OUT OF SCOPE)

Verbatim per CONTEXT.md `<deferred>`: numeric line-coverage threshold; full CLAUDE.md rewrite; append-only correction note; replay-everything for TEST-03; anvil-only for TEST-03; static AST/grep-only for TEST-02; ESLint rule for TEST-02; one big hooks test file; future drift cleanups; TEST-03 fixture refresh cadence; Tenderly/fork-as-a-service; coverage tooling as CI gate; HUMAN-UAT carry-forward (PERF-01 + SEC-03+04 D-04b); DRIFT-01 comment-marker-only or no-ESLint variants; multi-chain/AA/new features; admin-page architectural refactor; `+error.svelte`; external log drain.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | hooks.server.ts integration tests for auth/CORS/CSP/wallet-session/bot-rejection | § Standard Stack (Vitest+jsdom), § Architecture Patterns (D-02 file split), § TEST-02 Resolution Endpoint Tree |
| TEST-02 | Every state-mutating admin endpoint calls createAuditLogger; tests assert success+failure paths | § TEST-02 Resolution (8-endpoint inventory + 4 endpoints needing audit-log emission added) |
| TEST-03 | Full marketOrderExecution.ts integration suite (aggregated→fallback→per-order, hydration, stale-session) | § TEST-03 Resolution + § Anvil-CI Resolution |
| TEST-04 | Snapshot scraper edge cases (pagination, legacy wrappedTokenTransfers fallback, transient subgraph failure) | § TEST-04 Resolution (3-category code path enumeration from scraper.ts) |
| DRIFT-01 | TOKENS.find lookups → getTokenByAnyAddress; ESLint guard | § DRIFT-01 Resolution (actual 7-site inventory + ALL_TOKENS variant) |
| DRIFT-02 | USDC hardcoding → isPaymentToken/getPaymentTokensForNetwork | § DRIFT-02 Resolution (helpers already exist; only call sites change) |
| DRIFT-03 | CLAUDE.md ground-truth alignment | § Architecture Patterns (D-05 surgical edit) |

## Project Constraints (from CLAUDE.md)

(Note: CLAUDE.md itself is a Phase 4 target. These constraints apply for the remaining phases of work.)

- TypeScript strict mode; Svelte 4 + SvelteKit 2; Vitest 1.6.0 + jsdom + @testing-library/svelte. [VERIFIED: package.json]
- `$lib/*` aliased to `src/lib/*`. [CITED: CLAUDE.md]
- Default `staleTime: Infinity` for TanStack Query — DO NOT regress. [CITED: CLAUDE.md + Phase 2 carry-forward]
- Avoid over-engineering: don't add features or abstractions beyond what's requested. [CITED: CLAUDE.md]
- INPUT/OUTPUT semantics for orders are documented in CLAUDE.md "Order Semantics" section — preserve verbatim per D-05.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| hooks.server.ts auth/CORS/CSP integration tests | Frontend Server (SvelteKit hooks) | — | `hooks.server.ts` runs server-side ahead of every route handler; tests live in `tests/hooks/`. |
| Admin audit-log fan-out tests | Frontend Server (SvelteKit `+server.ts`) | — | Tests import the handlers and mock `$lib/server/auditLog`. |
| marketOrderExecution.ts orchestration tests | API/Backend (anvil fork) + Browser (replay JSON via stores) | — | Anvil pins on-chain truth (vault state, multicall); replay pins subgraph truth; the orchestration glue is browser-tier (TanStack stores). |
| Snapshot scraper tests | API/Backend (server-only `src/lib/server/snapshots/`) | — | Pure server module; no browser surface. |
| Token-lookup codemod + ESLint | Build-time (codemod script) + Lint-time (ESLint) | — | Mechanical migration; recurrence guard at lint time. |
| Payment-token canonicalization | Browser (`admin/+page.svelte`) + API/Backend (`api/admin/nansen/+server.ts`) | — | Two call sites; helper already exists in `src/lib/config/tokens.ts`. |
| CLAUDE.md surgical edit | Documentation (project root) | — | Single-file textual change. |

## Standard Stack

### Core (already in tree — no new deps required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | 1.6.0 | Test runner | Already established. Pin to existing version. [VERIFIED: package.json] |
| `vitest-mock-extended` | 1.3.1 | Typed deep mocks | Already in tree; ideal for typed Goldsky subgraph mocks (TEST-04). [VERIFIED: package.json] |
| `@testing-library/svelte` | (existing) | Component test utilities | Already used in `tests/lib/`. [CITED: CLAUDE.md] |
| `ts-morph` | ^28.0.0 | AST codemod | Already in tree (DRIFT-01 codemod). [VERIFIED: package.json] |
| `viem` | (existing) | Anvil HTTP client (TEST-03) | Already used; `http()` transport speaks JSON-RPC to anvil. [CITED: CLAUDE.md] |

### Supporting (NEW external dependency — CI only)

| Tool | Version | Purpose | When |
|------|---------|---------|------|
| `foundry` (anvil) | latest stable | Local Base mainnet fork (TEST-03) | CI workflow only; install via `curl -L https://foundry.paradigm.xyz \| bash && foundryup`. Already installed locally on dev machines (Homebrew). [VERIFIED: `which anvil` returned `/opt/homebrew/bin/anvil` v1.2.3] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| anvil fork | Tenderly/fork-as-a-service | Rejected per CONTEXT.md `<deferred>` — anvil is the chosen tool; alternatives only revisited if Foundry CI cost becomes measurable. |
| ts-morph codemod | jscodeshift | ts-morph is the established precedent (TRADE-01). Use it. |

**Installation (NEW only):** none in `npm install`; Foundry installs in CI workflow as a separate step.

**Version verification:** Vitest 1.6.0 verified in package.json (do NOT upgrade — Phase 4 is closure, not version churn).

## Architecture Patterns

### System Architecture Diagram

```
                              Phase 4 Surfaces
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
   DRIFT (1-3)                  TEST (4-5)                Phase-Exit (6)
        │                           │                           │
   ┌────┼────┐               ┌──────┼──────┐                    │
   ▼    ▼    ▼               ▼      ▼      ▼                    ▼
 D-03 D-02 D-01           T-01   T-02   T-03                  grep gates
 docs admin codemod      hooks  audit  market+T-04           re-verify
 only USDC + ESLint       6     8      orchestration         P2+P3
                         files  endpts   anvil+replay        cross-cuts
                                          + scraper

CI Test Surface After Phase 4:
─────────────────────────────────────────────
  npm test            (jsdom, fast, no anvil)
        │
        ├── existing tests (Phase 1-3)
        ├── tests/hooks/*.test.ts        ← TEST-01 (6 files)
        ├── tests/lib/admin/*.test.ts    ← TEST-02 (8 endpoints)
        └── src/lib/server/snapshots/scraper.test.ts ← TEST-04
                                              (uses vitest-mock-extended)

  npm run test:integration    (anvil fork, slow, gated)
        │
        ├── tests/integration/marketOrder/anvil-fork.test.ts ← TEST-03 anvil half
        └── tests/integration/marketOrder/replay-*.test.ts   ← TEST-03 replay half

  npm run lint        (ESLint flat config)
        │
        ├── existing TRADE-01 no-restricted-syntax
        └── DRIFT-01 no-restricted-syntax (NEW)
```

### Recommended Project Structure

```
tests/
├── hooks/                     # NEW (TEST-01)
│   ├── _helpers.ts            # NEW shared scaffolding (D-02a)
│   ├── cors.test.ts
│   ├── csp.test.ts
│   ├── public-paths.test.ts
│   ├── admin-gate.test.ts
│   ├── wallet-session.test.ts
│   └── bot-rejection.test.ts
├── lib/admin/                 # NEW (TEST-02)
│   ├── codes.audit.test.ts
│   ├── excluded-wallets.audit.test.ts
│   ├── pool-wallets.audit.test.ts
│   ├── team-wallets.audit.test.ts
│   ├── snapshots-trigger.audit.test.ts
│   ├── snapshots-regenerate.audit.test.ts
│   ├── referral-programme-migrate.audit.test.ts
│   └── referral-programme-refresh.audit.test.ts
├── integration/marketOrder/   # NEW (TEST-03)
│   ├── anvil-fork.test.ts     # uses tests/helpers/anvil.ts
│   └── replay-*.test.ts       # one per scenario
├── fixtures/
│   ├── eslint/
│   │   ├── io-perspective-violation.ts   (existing — TRADE-01)
│   │   └── token-lookup-violation.ts     # NEW (DRIFT-01)
│   └── marketOrder/                       # NEW (TEST-03 replay JSON)
│       └── *.json
└── helpers/
    ├── anvil.ts               # NEW (TEST-03)
    └── loadTranscript.ts      # NEW (TEST-03)

src/lib/server/snapshots/
└── scraper.test.ts            # NEW (TEST-04 — co-located, uses vitest-mock-extended)

scripts/codemods/
└── migrate-token-find.ts      # NEW (DRIFT-01)
```

### Pattern 1: ESLint `no-restricted-syntax` mirror of TRADE-01

`eslint.config.js` already contains the proven shape (lines 46-65). Add a parallel block for DRIFT-01:

```js
// Source: existing eslint.config.js:46-65 [VERIFIED]
{
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: [
        'src/lib/config/tokens.ts',           // canonical lookup module — TOKENS.find lives here
        'tests/fixtures/eslint/token-lookup-violation.ts'  // lint fixture
    ],
    rules: {
        'no-restricted-syntax': [
            'error',
            {
                selector:
                    "CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']",
                message:
                    'Direct TOKENS.find / ALL_TOKENS.find is banned (DRIFT-01). Use getTokenByAnyAddress(addr) from $lib/config/tokens.ts. Per-callsite escape: // eslint-disable-next-line no-restricted-syntax -- justification: ...'
            }
        ]
    }
}
```

**Why both `TOKENS` AND `ALL_TOKENS`:** my grep found 7 `TOKENS.find` sites + 5 `ALL_TOKENS.find` sites; both are direct-lookup escapes that should route through `getTokenByAnyAddress`. [VERIFIED: grep across `src/`]

**Coexistence with TRADE-01 rule:** The two `no-restricted-syntax` blocks coexist (ESLint flat config merges them). Phase-exit verification re-runs both rules against the tree.

### Pattern 2: vitest-mock-extended for typed subgraph mocks (TEST-04)

```ts
// Source: vitest-mock-extended docs + existing scraper.ts shape [CITED]
import { mock } from 'vitest-mock-extended';
import { vi } from 'vitest';

// Mock global fetch with typed responses
global.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse((init?.body as string) ?? '{}');
    // Pagination boundary fixture: return BATCH_SIZE-1 (terminates) vs BATCH_SIZE (continues)
    if (body.variables.skip === 0) return mockResponse(BATCH_SIZE_full);
    return mockResponse([]);
});
```

### Pattern 3: anvil fork helper (TEST-03)

```ts
// Source: Foundry book + existing viem usage [CITED: book.getfoundry.sh/anvil]
import { spawn, type ChildProcess } from 'node:child_process';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

let anvilProc: ChildProcess | null = null;

export async function startAnvilFork(forkBlock: number) {
    if (!process.env.BASE_RPC_URL) throw new Error('BASE_RPC_URL required');
    anvilProc = spawn('anvil', [
        '--fork-url', process.env.BASE_RPC_URL,
        '--fork-block-number', String(forkBlock),
        '--port', '8545',
        '--silent'
    ], { stdio: 'pipe' });
    await waitForRpc('http://127.0.0.1:8545');
    return createPublicClient({ chain: base, transport: http('http://127.0.0.1:8545') });
}

export async function stopAnvilFork() {
    anvilProc?.kill('SIGTERM');
    anvilProc = null;
}
```

### Anti-Patterns to Avoid

- **Don't run anvil tests in `npm test` default surface.** Inline runtime cost would slow per-commit feedback loop measurably (anvil tests ~seconds vs ~ms for jsdom). Gate behind `npm run test:integration`. [Resolution below]
- **Don't write a NEW `getPaymentTokensForNetwork` helper.** It exists at `src/lib/config/tokens.ts:25`. Consume it. Authoring a duplicate would reintroduce drift. [VERIFIED: grep]
- **Don't auto-fix TOKENS.find at lint time.** Codemod first, lint second (D-04b). Auto-fix would silently alter behavior on edge cases (e.g., when the find predicate isn't a simple address comparison).
- **Don't include GET-only admin endpoints in TEST-02 inventory.** D-03a — read-only endpoints are out of scope.
- **Don't mock anvil; mock subgraph.** Anvil's whole point is to NOT be a mock — it's the on-chain truth half. Replay JSON is the mock half (subgraph data). [Per D-01 split]
- **Don't backfill content into CLAUDE.md from `.planning/codebase/`.** Surgical edit only (D-05a).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mock RPC for on-chain reads | Hand-built JSON-RPC mock | Anvil fork | Anvil IS the EVM; mocks have to imagine vault state. |
| Typed subgraph mocks | Manual `vi.fn()` per test | `vitest-mock-extended` | Already in tree; gives type safety on Goldsky responses. |
| Codemod for property migration | Regex sed | ts-morph | TRADE-01 precedent; AST-aware; idempotent. |
| Payment-token detection | Hardcoded address comparison | `isPaymentToken` + `getPaymentTokensForNetwork` (already exist) | Avoids drift recurrence (DRIFT-02 is about exactly this). |
| Token lookup | `TOKENS.find(t => t.address === x)` | `getTokenByAnyAddress(x)` | Handles wrapped/unwrapped/legacy address variants. [CITED: MEMORY.md] |
| Lint rule for prop-access bans | Custom plugin | Built-in `no-restricted-syntax` selector | TRADE-01 precedent at `eslint.config.js:46-65`. |

**Key insight:** Phase 4 is mostly *consumption* of patterns and helpers that already exist. The two NEW external dependencies (Foundry in CI, anvil helper file) are the only genuinely-new infrastructure.

## Common Pitfalls

### Pitfall 1: Skip-the-codemod regression

**What goes wrong:** Author adds `TOKENS.find` to a new file before the codemod-then-lint PR lands.
**Why:** Codemod is one-shot; ESLint rule needs to land in the same PR (D-04b).
**How to avoid:** PR ships codemod + ESLint rule + lint fixture together. Phase-exit grep verifies no `TOKENS.find` outside the allowlist.
**Warning sign:** ESLint rule lands separately from codemod.

### Pitfall 2: Anvil fork-block staleness

**What goes wrong:** Test pinned to a fork block where the test order existed; months later the order is no longer at that block (chain moved on, but the order's underlying state did too — actually anvil fork is immutable per block, so this is safe).
**Why not actually a pitfall:** Fork block is immutable; the underlying mainnet state at that block is preserved by the RPC archive node. As long as `BASE_RPC_URL` points at an archive-capable node, fork-block tests are stable.
**Real risk:** `BASE_RPC_URL` provider doesn't serve old blocks (some RPCs prune history). Document required RPC capability in 04-RUNBOOK.md.
**Warning sign:** Anvil error `MissingTrieNode` or `state not found at block N`.

### Pitfall 3: Foundry CI install cost

**What goes wrong:** `npm test` becomes slow because Foundry installs on every CI run.
**How to avoid:** GitHub Actions cache the `~/.foundry` install (cache key = foundryup version). Install step ~30-60s on cold cache, ~3s on warm. Decision: gate anvil tests behind `npm run test:integration` (separate CI job) so the default `npm test` job stays Foundry-free.
**Warning sign:** PR feedback loop measurably longer than pre-Phase-4.

### Pitfall 4: TEST-02 audit-log mock leakage

**What goes wrong:** `vi.mock('$lib/server/auditLog', ...)` from one test file leaks into another.
**Why:** Vitest module mocks are per-file by default with `vi.mock`, but `vi.doMock` is per-test. Use `vi.mock` at top-of-file scope per the per-endpoint test pattern.
**How to avoid:** One test file per endpoint; `vi.mock` at top; `beforeEach(() => vi.clearAllMocks())`.
**Warning sign:** Tests pass solo, fail in suite.

### Pitfall 5: SvelteKit hooks test scaffold drift

**What goes wrong:** `tests/hooks/_helpers.ts` `createMockRequestEvent` doesn't match SvelteKit `RequestEvent` shape, so handler invocations succeed in test but fail in production.
**How to avoid:** Type the helper return as SvelteKit's `RequestEvent` (imported from `@sveltejs/kit`). TypeScript will reject incomplete shapes.
**Warning sign:** Helper uses `as any` to satisfy the handler signature.

### Pitfall 6: Replay-JSON fixture wallet-address leak

**What goes wrong:** OBS-03 transcripts captured from production logs contain real user wallet addresses; checking those into the repo leaks PII.
**How to avoid:** RUNBOOK redaction recipe (sed `s/0x[a-fA-F0-9]\{40\}/0x...redacted/g`) MUST run before `git add`. Add a `.gitattributes`-style filter or `pre-commit` check that fails on un-redacted hex addresses in `tests/fixtures/marketOrder/`.
**Warning sign:** Captured fixture contains 40-hex strings outside the address-allowlist (canonical contract addresses).

### Pitfall 7: CLAUDE.md edit accidentally deletes Order Semantics

**What goes wrong:** Surgical edit removes more than the four false-claim sections.
**How to avoid:** Use `git diff` review gate; the Order Semantics section MUST appear in the post-edit file. Phase-exit grep `grep -c "INPUT/OUTPUT Perspective" CLAUDE.md` returns ≥ 1.
**Warning sign:** Diff shows changes outside the four target regions.

## Code Examples

### TOKENS.find migration (DRIFT-01 codemod target)

```ts
// BEFORE — src/lib/queries/oracleQuotes.ts:61
const spymToken = TOKENS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
);

// AFTER (codemod output)
import { getTokenByAnyAddress } from '$lib/config/tokens';
const spymToken = getTokenByAnyAddress(address);
```

### USDC hardcoding migration (DRIFT-02 call-site change)

```ts
// BEFORE — src/routes/api/admin/nansen/+server.ts:14
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
const inputIsUsdc = inputAddr === USDC_ADDRESS;

// AFTER (consume existing helpers — DO NOT author new ones)
import { isPaymentToken } from '$lib/utils/tokenMath';
import { getPaymentTokensForNetwork } from '$lib/config/tokens';
const paymentTokens = getPaymentTokensForNetwork(8453);
const inputIsUsdc = isPaymentToken({ address: inputAddr }, paymentTokens[0]);
```

### Audit-log per-endpoint test (TEST-02 pattern)

```ts
// Source: D-03 + existing $lib/server/auditLog signature [CITED: CONTEXT.md]
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { POST } from '$routes/api/admin/snapshots/trigger/+server';
import { createMockRequestEvent, createMockSession } from 'tests/hooks/_helpers';

vi.mock('$lib/server/auditLog', () => ({
    createAuditLogger: vi.fn(() => ({
        log: vi.fn()
    }))
}));

describe('admin/snapshots/trigger audit-log fan-out', () => {
    beforeEach(() => vi.clearAllMocks());

    it('logs success with verb=POST, target=snapshots, outcome=success', async () => {
        const event = createMockRequestEvent({ method: 'POST', url: '/api/admin/snapshots/trigger' });
        await POST(event);
        const { createAuditLogger } = await import('$lib/server/auditLog');
        expect(createAuditLogger).toHaveBeenCalled();
        // assert log() invocation shape
    });

    it('logs failure when underlying snapshot generator throws', async () => {
        // setup failure path, invoke, assert outcome=failure
    });
});
```

### Anvil-fork test (TEST-03 pattern)

```ts
// Source: D-01 + Foundry book + existing viem usage [CITED]
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startAnvilFork, stopAnvilFork } from 'tests/helpers/anvil';

const FORK_BLOCK = 33_400_000; // pin to known good block

describe('marketOrderExecution against forked Base mainnet', () => {
    let publicClient: ReturnType<typeof startAnvilFork>;
    beforeAll(async () => { publicClient = await startAnvilFork(FORK_BLOCK); });
    afterAll(stopAnvilFork);

    it('detects partial fill against actual on-chain vault state', async () => {
        // drive marketOrderExecution against real Orderbook contract at FORK_BLOCK
    });
});
```

## Resolutions for Discretionary Items

### TEST-04 Resolution — scraper edge tests

**Code paths enumerated from `src/lib/server/snapshots/scraper.ts`:**

| Category | Code Path | Lines | Test Approach |
|----------|-----------|-------|---------------|
| Pagination boundary | `transfersHasMore = transfersBatch.length === BATCH_SIZE` | 240 | Mock fetch returns 1000 then 999; assert second batch terminates loop. Edge case: exactly-multiple-of-BATCH_SIZE (returns 1000 then 0). |
| Pagination boundary (wrapped) | `if (wrappedHasMore) wrappedHasMore = wrappedBatch.length === BATCH_SIZE` | 241 | Same as above for wrapped path. |
| Legacy `wrappedTokenTransfers` fallback | `isMissingEntity` regex match → `wrappedHasMore = false; return []` | 192-202 | Mock fetch returns GraphQL error matching `/Cannot query field "wrappedTokenTransfers"/`; assert sharesTransfers loop continues, wrapped loop terminates, no throw. |
| Transient subgraph failure | `if (!response.ok) throw new Error(...)` and outer `catch (error)` at line 276 | 82-83, 153-154, 276-280 | Mock fetch rejects with 503; assert outer `catch` logs warn and returns `[]` for that subgraph. Assert other subgraph results still merge. |

**Fixture style:** Hand-built mocks of `global.fetch` (not `vitest-mock-extended` for fetch — the function is global, not class-typed). Use `vitest-mock-extended` ONLY if a typed subgraph client wraps `fetch` (it doesn't currently — `fetch` is called directly).

**Decision:** Plain `vi.fn()` for `global.fetch`; one `*.test.ts` file (`src/lib/server/snapshots/scraper.test.ts`, co-located per STRUCTURE.md convention); ~5-7 `it` blocks (one per row above + 1-2 for happy path + multi-subgraph merge). [VERIFIED against scraper.ts source]

### TEST-03 Resolution — fixture count + capture procedure

**Fixture count: 7 transcripts.** Each pins one OBS-03 failure mode worth regression-locking. Mapped to `failWith()` call-site categories:

| Fixture | Failure Mode | Source `failWith()` Site |
|---------|-------------|-------------------------|
| `aggregated-quote-stale.json` | subgraph quote stale relative to on-chain ratio | `marketOrderExecution.ts` aggregated-path quote validation |
| `fallback-no-liquidity.json` | aggregated path returns no orders; fallback also empty | fallback-path entry validation |
| `per-order-partial-fill.json` | per-order path detects partial fill via on-chain state | partial-fill detection |
| `hydration-failure.json` | TanStack Query hydration mismatch on stale-session reload | store hydration assertions |
| `stale-session-recovery.json` | session-id KV record absent → re-auth required | session-cookie classification |
| `slippage-cap-exceeded.json` | computed ratio exceeds slippage cap | ratio derivation guard |
| `wrong-side-classification.json` | bid/ask side misclassified at quote time | side derivation guard |

**Capture procedure (for 04-RUNBOOK.md):**

```bash
# 1. Pull recent OBS-03 failure transcripts from Vercel Logs
vercel logs --filter '"transcript_v":"obs-03"' --since 7d --output json > raw.json

# 2. Filter to one per failure_mode field
jq 'group_by(.failure_mode) | map(.[0])' raw.json > grouped.json

# 3. Redact PII (wallet addresses; preserve canonical contract addresses)
ALLOWED='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' # USDC, etc.
jq -r 'tostring' grouped.json \
  | sed -E "s/0x[a-fA-F0-9]{40}/0x...redacted/g" \
  | sed "s/0x...redacted/$ALLOWED/g" > redacted.json

# 4. Split per scenario into tests/fixtures/marketOrder/*.json
jq -c '.[]' redacted.json | while read -r line; do
  name=$(echo "$line" | jq -r '.failure_mode')
  echo "$line" | jq '.' > "tests/fixtures/marketOrder/${name}.json"
done

# 5. Verify no un-redacted hex addresses outside allowlist
grep -RE '0x[a-fA-F0-9]{40}' tests/fixtures/marketOrder/ \
  | grep -v -F "$ALLOWED" \
  && echo "FAIL: un-redacted addresses present" \
  || echo "PASS"
```

**Schema:** matches in-source `TakeOrderFailureTranscript` type (Plan 02-06 added the type definition; reference at planning time).

### Anvil-CI Resolution — gated `npm run test:integration`

**Decision:** Gate behind `npm run test:integration`. Add to `package.json`:

```jsonc
{
    "scripts": {
        "test": "vitest",                                       // unchanged — fast jsdom suite
        "test:integration": "vitest --config vite.config.integration.js"  // NEW — anvil-driven
    }
}
```

**Rationale:**
- **Inline cost:** anvil tests ~seconds each × 7+ scenarios = 30-60s added to every `npm test` run. Phase 1-3 didn't have this cost; preserving the existing fast inner loop matters for solo/1-2-dev velocity.
- **Foundry CI install:** ~30-60s cold cache, ~3s warm. Acceptable for a separate CI job (runs in parallel with the fast `npm test` job).
- **Developer ergonomics:** developers without Foundry locally still run `npm test` clean; they opt into `npm run test:integration` only when touching marketOrderExecution.
- **CI workflow:** add a parallel `test-integration` job to `.github/workflows/ci.yml` (or equivalent) that installs Foundry, sets `BASE_RPC_URL`, runs `npm run test:integration`. Phase-exit Wave 6 verifies the job is green.

**Trade-off acknowledged:** Slightly more CI configuration complexity; some marketOrderExecution regressions could land in `npm test`-passing PRs if the integration job is somehow skipped. Mitigation: PR merge gate requires both jobs green.

### DRIFT-02 Resolution — helper already exists

**Helper:** `getPaymentTokensForNetwork(chainId: number): PythToken[]` — EXISTS at `src/lib/config/tokens.ts:25`. Returns `PythToken[]`. [VERIFIED]
**Helper:** `isPaymentToken(token, networkPaymentToken?)` — EXISTS at `src/lib/utils/tokenMath.ts:213`. [VERIFIED]

**No new helper authored.** DRIFT-02 work is two call-site replacements:

| Call site | Lines | Change |
|-----------|-------|--------|
| `src/routes/admin/+page.svelte` | 901, 1167-1168, 1263-1290, 1383 (8 references to `USDC_ADDRESS` const) | Delete `const USDC_ADDRESS` at line 901; import `isPaymentToken` + `getPaymentTokensForNetwork`; replace each comparison. |
| `src/routes/api/admin/nansen/+server.ts` | 14, 141-142, 168, 172-174 (5 references) | Same pattern. |

**Total surface:** 2 files, ~13 line changes. Single atomic commit.

### DRIFT-01 Resolution — ESLint rule placement

**File:** `eslint.config.js` (flat config, NOT `.eslintrc.cjs` despite both files existing — `eslint.config.js` is the active one per the existing TRADE-01 rule). [VERIFIED]

**Allowlist mechanism:** Filename pattern via `ignores:`, matching TRADE-01's approach at `eslint.config.js:46-65`. NOT comment marker. [VERIFIED]

**Allowlist files:**
- `src/lib/config/tokens.ts` (canonical lookup module — defines TOKENS and exports `getTokenByAnyAddress`)
- `tests/fixtures/eslint/token-lookup-violation.ts` (lint fixture — must contain a violation to assert the rule fires)

**Selector (covers both `TOKENS.find` AND `ALL_TOKENS.find`):**
```
CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']
```

**Codemod:** `scripts/codemods/migrate-token-find.ts` using ts-morph. Idempotent (re-run is no-op). Handles 12 sites total (7 `TOKENS.find` + 5 `ALL_TOKENS.find`); REQ-ID list of 8 was incomplete. [VERIFIED via grep]

**Codemod sites enumerated (post-grep):**

| File | Variant | Lines |
|------|---------|-------|
| `src/lib/queries/oracleQuotes.ts` | TOKENS.find | 61 |
| `src/lib/queries/priceFeeds.ts` | TOKENS.find | 10 |
| `src/lib/utils/tradeTransform.ts` | TOKENS.find | 138, 141 (2 sites) |
| `src/lib/api/subgraph.ts` | TOKENS.find | 18 |
| `src/routes/(main)/trade/[id]/+page.svelte` | TOKENS.find | 259 |
| `src/lib/components/orders/DcaOrder.svelte` | ALL_TOKENS.find | 41 |
| `src/lib/components/orders/LimitOrder.svelte` | ALL_TOKENS.find | 81 |
| `src/routes/(main)/+page.svelte` | ALL_TOKENS.find | 424 |
| `src/routes/(main)/dashboard/+page.svelte` | ALL_TOKENS.find | 1432, 1568 (2 sites) |

**Note for planner:** REQ-ID list mentioned `tradeTransform.ts, api/orders.ts, api/subgraph.ts, oracleQuotes.ts, priceFeeds.ts, QuickTrade.svelte, LimitOrder.svelte, DcaOrder.svelte`. Actual grep found:
- `api/orders.ts` — no `TOKENS.find` matches (may be already migrated or a stale REQ-ID entry)
- `QuickTrade.svelte` — no `TOKENS.find` matches
- New sites NOT in REQ-ID: `trade/[id]/+page.svelte`, `(main)/+page.svelte`, `dashboard/+page.svelte`
- The `ALL_TOKENS.find` variant was not called out in REQ-ID but is functionally equivalent

The planner should treat the grep-verified list as authoritative. Update the codemod to handle both `TOKENS` and `ALL_TOKENS` identifiers. [VERIFIED]

### TEST-02 Resolution — admin endpoint inventory

**Walk performed.** State-mutating endpoints (POST/PUT/PATCH/DELETE), per `find ... -name "+server.ts"` + verb grep:

| Endpoint | File | Verbs | Currently calls `createAuditLogger`? |
|----------|------|-------|--------------------------------------|
| codes | `src/routes/api/admin/codes/+server.ts` | DELETE, PATCH, POST, PUT (+ GET) | ✅ YES (4 audit refs) |
| excluded-wallets | `src/routes/api/admin/excluded-wallets/+server.ts` | POST (+ GET) | ❌ NO |
| pool-wallets | `src/routes/api/admin/pool-wallets/+server.ts` | POST (+ GET) | ❌ NO |
| team-wallets | `src/routes/api/admin/team-wallets/+server.ts` | POST (+ GET) | ❌ NO |
| snapshots/regenerate | `src/routes/api/admin/snapshots/regenerate/+server.ts` | POST | ❌ NO |
| snapshots/trigger | `src/routes/api/admin/snapshots/trigger/+server.ts` | POST | ❌ NO |
| referral-programme/migrate | `src/routes/api/admin/referral-programme/migrate/+server.ts` | POST | ✅ YES (2 audit refs) |
| referral-programme/refresh | `src/routes/api/admin/referral-programme/refresh/+server.ts` | POST | ✅ YES (2 audit refs) |

**REQ-ID-listed endpoints NOT present in tree (filtered by Phase 1 DEPR-*):**
- `rewards-pool` — does not exist [VERIFIED via `ls`]
- `tvl` — exists but GET-only, out of scope per D-03a
- `swap-snapshot` — exists but GET-only, out of scope per D-03a
- `wallet/statement` — exists but GET-only, out of scope per D-03a
- `wallets` — exists but GET-only, out of scope per D-03a
- `nansen` — exists but GET-only, out of scope per D-03a (DRIFT-02 still touches it for USDC hardcoding)

**Implication for planning:** TEST-02 is THREE pieces of work, not one:
1. **ADD audit-log emission** to 4 endpoints currently missing it (excluded-wallets, pool-wallets, team-wallets, snapshots/regenerate, snapshots/trigger — wait, that's 5 endpoints listed but I count POST in 5 of them; let me recount: excluded-wallets, pool-wallets, team-wallets, snapshots/regenerate, snapshots/trigger = **5 endpoints**).
2. **WRITE per-endpoint runtime tests** for all 8 endpoints (success + failure path, 16 tests minimum).
3. **PHASE-EXIT GREP** that every state-mutating handler imports `$lib/server/auditLog`.

Piece 1 is a behavioral code change; the planner must scope this explicitly inside Wave 4 (or split TEST-02 into two plans — emission first, tests second). The CONTEXT.md framing ("tests assert audit records on success AND failure") implicitly assumes audit-log emission already exists, which is only true for 3 of 8 endpoints.

### Phase-Exit Resolution — Wave 6 grep recipes

**File:** `04-NN-PLAN.md` (planner picks index — likely 04-08 or 04-09). Mirrors 03-11 phase-exit pattern.

**Phase 4 self-verification grep set:**

```bash
# DRIFT-03 — no AA/multi-chain claims in CLAUDE.md
grep -E "Rhinestone|EIP-7702|account-abstraction|Account Abstraction" CLAUDE.md
# expect: 0 matches

grep -c "INPUT/OUTPUT Perspective" CLAUDE.md
# expect: ≥ 1 (Order Semantics preserved)

grep -c "Ground Truth" CLAUDE.md
# expect: 1 (header added)

# DRIFT-01 — no TOKENS.find / ALL_TOKENS.find outside allowlist
grep -RE "(TOKENS|ALL_TOKENS)\.find\(" src/ \
  | grep -v "src/lib/config/tokens.ts" \
  | grep -v "tests/fixtures/eslint/token-lookup-violation.ts"
# expect: 0 matches

# DRIFT-02 — no hardcoded USDC address strings in admin paths
grep -RE "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  src/routes/admin/ src/routes/api/admin/
# expect: 0 matches

# TEST-01 — file existence
ls tests/hooks/{cors,csp,public-paths,admin-gate,wallet-session,bot-rejection}.test.ts
# expect: all 6 files exist

# TEST-01 — describe blocks present (one per concern)
for f in tests/hooks/*.test.ts; do
  grep -c "describe(" "$f" || echo "FAIL: $f"
done

# TEST-02 — every state-mutating admin handler imports auditLog
for f in $(grep -lE "export (const|async function) (POST|PUT|PATCH|DELETE)" \
           $(find src/routes/api/admin -name "+server.ts")); do
  grep -q "from '\$lib/server/auditLog'" "$f" || echo "MISSING: $f"
done
# expect: 0 MISSING lines

# TEST-02 — per-endpoint test files exist
for ep in codes excluded-wallets pool-wallets team-wallets \
          snapshots-trigger snapshots-regenerate \
          referral-programme-migrate referral-programme-refresh; do
  ls tests/lib/admin/${ep}.audit.test.ts
done

# TEST-03 — anvil helper + replay fixtures
ls tests/helpers/anvil.ts tests/helpers/loadTranscript.ts
ls tests/integration/marketOrder/anvil-fork.test.ts
ls tests/fixtures/marketOrder/*.json | wc -l
# expect: ≥ 7 fixture files

# TEST-03 — no un-redacted hex addresses in fixtures
grep -RE "0x[a-fA-F0-9]{40}" tests/fixtures/marketOrder/ \
  | grep -v "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  | grep -v "0x...redacted"
# expect: 0 matches (modulo canonical contract addresses in allowlist)

# TEST-04 — scraper test exists with 3 categories
ls src/lib/server/snapshots/scraper.test.ts
grep -E "(pagination|wrappedTokenTransfers fallback|transient)" \
  src/lib/server/snapshots/scraper.test.ts
# expect: ≥ 3 matches across the file
```

**Phase 2 + Phase 3 cross-cutting re-verification grep set (mechanical):**

```bash
# TRADE-01 IO-perspective lockdown
grep -RE "\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b" src/ \
  | grep -v "src/lib/types/orderPerspective.ts" \
  | grep -v "src/lib/utils/orderbook.ts" \
  | grep -v "src/lib/api/orders.ts" \
  | grep -v "src/generated-graphql.ts"
# expect: 0 violations (must remain clean)

# TRADE-02 cycle severance — marketOrderExecution must NOT import from $lib/stores/transaction
grep "from.*\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts
# expect: 0 matches

# failWith count ≥ 12 in marketOrderExecution.ts
grep -c "failWith(" src/lib/services/marketOrderExecution.ts
# expect: ≥ 12

# EMERGENCY_RATIO_MULTIPLIER = 0
grep -RE "EMERGENCY_RATIO_MULTIPLIER" src/
# expect: 0 matches

# No Alchemy hardcoding
grep -RE "alchemy\.com|alchemyapi" src/ --include="*.ts" --include="*.svelte"
# expect: 0 matches outside config/secrets layer

# No Math.random in security-sensitive paths
grep -RE "Math\.random" src/lib/server/accessCodes/ src/lib/server/referrals/
# expect: 0 matches

# No fallback secrets
grep -RE "(SECRET|TOKEN|KEY).*\?\?\s*['\"]" src/lib/server/
# expect: 0 matches (env vars must throw if missing)

# Session-cookie shape preserved (Phase 3 SEC-03+04)
grep -E "wallet-session|session-id" src/hooks.server.ts
# expect: ≥ 1 match referencing the post-flip cookie name

# staleTime: Infinity preserved (TanStack Query default)
grep -RE "staleTime:\s*Infinity" src/lib/queries/
# expect: ≥ 1 match (default not regressed)
```

**04-RUNBOOK.md sections (mirroring 03-RUNBOOK structure):**

1. **Anvil + Foundry CI setup** — install steps, `BASE_RPC_URL` secret wiring, GHA cache key for `~/.foundry`, `npm run test:integration` invocation.
2. **OBS-03 transcript-capture procedure** — Vercel Logs query, jq pipeline, redaction recipe, target dir, refresh trigger conditions.
3. **TEST-03 fixture refresh procedure** — when (schema change, behavior change, periodic), how (re-run capture pipeline), invariants (≥ 7 scenarios, no un-redacted addresses).
4. **DRIFT-01 codemod re-run procedure** — idempotent; documents the ts-morph script invocation for future migrations.
5. **Phase-exit grep recipes** — full set above, runnable as a single `bash` block.
6. **Milestone-close handoff** — REQUIREMENTS.md ticks for TEST-01..04 + DRIFT-01..03; HUMAN-UAT items (PERF-01 p75 LCP < 2.5s, SEC-03+04 D-04b runtime UX assertion) flagged for `/gsd-verify-work`.

## Runtime State Inventory

This is a code/test/doc phase only — no databases, no live service config, no OS-registered state, no secrets/env vars added (Foundry install in CI is a build artifact). Itemized:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no schema or stored data changes | None |
| Live service config | None — no n8n, no Datadog, no Tailscale | None |
| OS-registered state | None | None |
| Secrets/env vars | `BASE_RPC_URL` already provisioned in Vercel + GHA via Phase 3 SEC-01; reused as-is | None (read access only) |
| Build artifacts | NEW: `~/.foundry` install in CI runners; new test files in `tests/` and `src/lib/server/snapshots/scraper.test.ts` (co-located) | Cache `~/.foundry` in GHA workflow with foundryup-version cache key |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vitest` | All TEST-* | ✓ | 1.6.0 | — |
| `vitest-mock-extended` | TEST-04 typed mocks (optional) | ✓ | 1.3.1 | Plain `vi.fn()` |
| `ts-morph` | DRIFT-01 codemod | ✓ | ^28.0.0 | — |
| `@testing-library/svelte` | Component-tier tests | ✓ | (existing) | — |
| `anvil` (Foundry) — local dev | TEST-03 dev loop | ✓ | 1.2.3 (Homebrew) | — |
| `anvil` (Foundry) — CI | TEST-03 CI job | ✗ | — | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` in GHA workflow |
| `BASE_RPC_URL` archive-node access | TEST-03 anvil fork | (assumed yes via Phase 3 SEC-01) | — | If pruning RPC → switch to archive-capable provider; document in RUNBOOK |
| `viem` HTTP transport vs anvil JSON-RPC | TEST-03 client | ✓ (compatible per Foundry book) | (existing) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Foundry in CI (install step is the fallback — no alternative needed).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 + jsdom |
| Config file | `vite.config.js` (existing); NEW `vite.config.integration.js` for anvil-driven suite |
| Quick run command | `npm test` |
| Full suite command | `npm test && npm run test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TEST-01 | hooks.server.ts CORS classification | integration | `npx vitest run tests/hooks/cors.test.ts` | ❌ Wave 0 |
| TEST-01 | hooks.server.ts CSP host pinning | integration | `npx vitest run tests/hooks/csp.test.ts` | ❌ Wave 0 |
| TEST-01 | hooks.server.ts public-paths classification | integration | `npx vitest run tests/hooks/public-paths.test.ts` | ❌ Wave 0 |
| TEST-01 | hooks.server.ts admin-gate enforcement | integration | `npx vitest run tests/hooks/admin-gate.test.ts` | ❌ Wave 0 |
| TEST-01 | hooks.server.ts wallet-session classification | integration | `npx vitest run tests/hooks/wallet-session.test.ts` | ❌ Wave 0 |
| TEST-01 | hooks.server.ts bot-rejection ordering | integration | `npx vitest run tests/hooks/bot-rejection.test.ts` | ❌ Wave 0 |
| TEST-02 | codes audit fan-out (success+failure) | unit | `npx vitest run tests/lib/admin/codes.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | excluded-wallets audit fan-out | unit | `npx vitest run tests/lib/admin/excluded-wallets.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | pool-wallets audit fan-out | unit | `npx vitest run tests/lib/admin/pool-wallets.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | team-wallets audit fan-out | unit | `npx vitest run tests/lib/admin/team-wallets.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | snapshots/trigger audit fan-out | unit | `npx vitest run tests/lib/admin/snapshots-trigger.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | snapshots/regenerate audit fan-out | unit | `npx vitest run tests/lib/admin/snapshots-regenerate.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | referral-programme/migrate audit fan-out | unit | `npx vitest run tests/lib/admin/referral-programme-migrate.audit.test.ts` | ❌ Wave 0 |
| TEST-02 | referral-programme/refresh audit fan-out | unit | `npx vitest run tests/lib/admin/referral-programme-refresh.audit.test.ts` | ❌ Wave 0 |
| TEST-03 | aggregated→fallback→per-order anvil-fork integration | integration (anvil) | `npm run test:integration -- tests/integration/marketOrder/anvil-fork.test.ts` | ❌ Wave 0 |
| TEST-03 | replay JSON for 7 OBS-03 failure modes | integration (replay) | `npm run test:integration -- tests/integration/marketOrder/replay-` | ❌ Wave 0 |
| TEST-04 | scraper pagination boundary | unit | `npx vitest run src/lib/server/snapshots/scraper.test.ts -t pagination` | ❌ Wave 0 |
| TEST-04 | scraper legacy wrappedTokenTransfers fallback | unit | `npx vitest run src/lib/server/snapshots/scraper.test.ts -t "wrappedTokenTransfers fallback"` | ❌ Wave 0 |
| TEST-04 | scraper transient subgraph failure | unit | `npx vitest run src/lib/server/snapshots/scraper.test.ts -t transient` | ❌ Wave 0 |
| DRIFT-01 | TOKENS.find / ALL_TOKENS.find outside allowlist = 0 | grep gate | `bash scripts/phase-exit/04-grep.sh drift-01` (Wave 6) | N/A — grep |
| DRIFT-01 | ESLint rule fires on lint fixture | lint | `npm run lint -- tests/fixtures/eslint/token-lookup-violation.ts` (expect non-zero exit) | ❌ Wave 0 |
| DRIFT-02 | Hardcoded USDC address in admin paths = 0 | grep gate | `bash scripts/phase-exit/04-grep.sh drift-02` | N/A — grep |
| DRIFT-03 | Rhinestone/EIP-7702/account-abstraction in CLAUDE.md = 0 | grep gate | `grep -cE "Rhinestone\|EIP-7702\|account-abstraction" CLAUDE.md` | N/A — grep |
| DRIFT-03 | Order Semantics preserved in CLAUDE.md | grep gate | `grep -c "INPUT/OUTPUT Perspective" CLAUDE.md` | N/A — grep |

### Sampling Rate

- **Per task commit:** `npm test` (fast jsdom suite — DRIFT + TEST-01 + TEST-02 + TEST-04). Anvil tests deferred to per-PR CI job.
- **Per wave merge:** `npm test && npm run test:integration && npm run lint && npm run check`.
- **Phase gate:** Full suite green + Wave 6 phase-exit grep set returns expected counts before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/hooks/_helpers.ts` — shared scaffolding for TEST-01 (D-02a)
- [ ] `tests/hooks/cors.test.ts`, `csp.test.ts`, `public-paths.test.ts`, `admin-gate.test.ts`, `wallet-session.test.ts`, `bot-rejection.test.ts` — TEST-01 file split (D-02)
- [ ] `tests/lib/admin/{8-endpoints}.audit.test.ts` — TEST-02 per-endpoint suites
- [ ] `tests/helpers/anvil.ts` — TEST-03 anvil spawn/teardown
- [ ] `tests/helpers/loadTranscript.ts` — TEST-03 fixture loader
- [ ] `tests/integration/marketOrder/anvil-fork.test.ts` — TEST-03 anvil suite
- [ ] `tests/integration/marketOrder/replay-*.test.ts` — TEST-03 replay suites (7 files)
- [ ] `tests/fixtures/marketOrder/*.json` — 7 OBS-03 transcripts (operator capture)
- [ ] `src/lib/server/snapshots/scraper.test.ts` — TEST-04 co-located suite
- [ ] `tests/fixtures/eslint/token-lookup-violation.ts` — DRIFT-01 lint fixture
- [ ] `scripts/codemods/migrate-token-find.ts` — DRIFT-01 codemod
- [ ] `vite.config.integration.js` — anvil suite config
- [ ] `package.json` `scripts.test:integration` entry
- [ ] `.github/workflows/*.yml` — Foundry install + integration test job
- [ ] `scripts/phase-exit/04-grep.sh` — Wave 6 phase-exit grep recipes (single bash file)
- [ ] Audit-log emission ADD to 5 endpoints currently missing it: `excluded-wallets`, `pool-wallets`, `team-wallets`, `snapshots/trigger`, `snapshots/regenerate` (NOT just tests — actual `createAuditLogger` calls)

## Security Domain

ASVS Level 1 enforcement enabled per `.planning/config.json`. Phase 4 is test/doc/codemod-only (no new auth, sessions, crypto, input validation surfaces). The relevant ASVS controls already locked in Phase 3 are RE-VERIFIED by Phase 4 phase-exit greps; no new controls authored.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | re-verified | Phase 3 SEC-03+04 wallet-session — TEST-01 wallet-session.test.ts pins the surface |
| V3 Session Management | re-verified | Phase 3 SEC-03+04 KV-backed session-id — TEST-01 wallet-session.test.ts asserts cookie classification |
| V4 Access Control | re-verified | Admin gate via `requireAdmin` — TEST-01 admin-gate.test.ts pins enforcement; TEST-02 audit-log fan-out asserts state-mutating operations are audited |
| V5 Input Validation | no | No new endpoints |
| V6 Cryptography | no | No new crypto |
| V7 Error Handling and Logging | yes | TEST-02 directly addresses audit-log gap (5/8 endpoints currently lack audit-log emission) |
| V14 Configuration | yes (CSP) | TEST-01 csp.test.ts pins CSP host allowlist (Phase 1 cross-cutting Pitfall 1) |

### Known Threat Patterns for {SvelteKit + Vitest + anvil}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PII leak via committed test fixtures (real wallet addresses in OBS-03 transcripts) | Information Disclosure | RUNBOOK redaction recipe + phase-exit grep gate (TEST-03) |
| Audit-log silent suppression via try/catch wrapping | Repudiation | TEST-02 runtime per-endpoint test asserts mock invocation on success AND failure paths (D-03) |
| CSP regression (added `*.sentry.io` wildcard) | Tampering | TEST-01 csp.test.ts pins exact host allowlist (Phase 1 cross-cutting Pitfall 1) |
| Session-cookie classification regression (legacy `wallet-address` cookie treated as authoritative) | Authentication Bypass | TEST-01 wallet-session.test.ts asserts D-04 atomic-flip invariant (Phase 3) |
| Hardcoded `BASE_RPC_URL` leakage via test logs | Information Disclosure | CI sets `BASE_RPC_URL` from secret; anvil `--silent` suppresses RPC URL in log lines |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `BASE_RPC_URL` provider is archive-capable (serves historical blocks) | Anvil-CI Resolution | TEST-03 anvil tests fail with `MissingTrieNode`; need to switch RPC provider |
| A2 | OBS-03 `failWith()` transcripts in Vercel Logs include enough fields to populate the 7 fixture scenarios | TEST-03 Resolution | Fewer than 7 scenarios capturable from logs; planner reduces fixture count or synthesizes missing scenarios |
| A3 | The TRADE-01 codemod script (`scripts/codemods/codemod-trade-01.ts`) source can be referenced by the planner — could not load file body | Standard Stack, Pattern 1 | DRIFT-01 codemod authored from scratch using ts-morph idioms (still feasible; just no copy-paste skeleton) |
| A4 | Adding `createAuditLogger` calls to the 5 missing state-mutating admin endpoints does not change endpoint behavior (audit logging is non-blocking on failure path) | TEST-02 Resolution | Audit-log call could throw and break the endpoint; mitigation: wrap in `try/catch` per existing pattern at the 3 audited endpoints |
| A5 | `eslint.config.js` is the active config (not `.eslintrc.cjs`) — both files exist | DRIFT-01 Resolution | Rule lands in wrong file; verify by running `npm run lint -- --print-config <any-file>` and inspecting output |
| A6 | GitHub Actions has the `~/.foundry` cache pattern documented somewhere usable | Pitfall 3 | Cache miss every run → CI ~30-60s slower per anvil job; acceptable but suboptimal |
| A7 | Vercel Logs CLI supports the `--filter` and `--since` flags for OBS-03 transcript capture | TEST-03 capture procedure | Operator falls back to dashboard query + manual export; same outcome, slower |
| A8 | The CONTEXT.md REQ-ID list of 8 DRIFT-01 sites is REPLACED by the grep-verified list (12 sites including ALL_TOKENS variants) | DRIFT-01 Resolution | Codemod misses sites; ESLint rule catches them at lint time and breaks build until fixed |
| A9 | `rewards-pool` admin endpoint was deleted by Phase 1 DEPR-* (not by some other phase or in error) | TEST-02 Resolution | If endpoint should exist and was missed, TEST-02 inventory is incomplete |

## Open Questions (RESOLVED)

1. **TRADE-01 codemod script body.** RESOLVED: pattern-mapper verified `scripts/codemod-trade-01.ts` IS in tree (the earlier `scripts/codemods/codemod-trade-01.ts` path read empty because TRADE-01's codemod lives at `scripts/codemod-trade-01.ts`, not under `scripts/codemods/`). DRIFT-01's `scripts/codemods/migrate-token-find.ts` mirrors that file with a swapped selector — confirmed by 04-PATTERNS.md Pattern D. 04-03 plan is wired to read `scripts/codemod-trade-01.ts` as analog before authoring.

2. **Audit-log call shape for the 5 missing endpoints.** RESOLVED: canonical shape is `src/routes/api/admin/codes/+server.ts:37-78` per 04-PATTERNS.md Pattern B. 04-05 plan reads that file as `read_first` and mirrors its `requireAdmin → createAuditLogger → try { ... await log.success } catch (e) { await log.failure; throw }` shape. NOTE per pattern-mapper callout: existing `codes/+server.ts` catch only handles body-parse errors and does NOT call `logFailure`; the 5 emission ADDs in 04-05 explicitly add `logFailure` to the catch path so D-03 runtime failure-path assertion holds.

3. **DRIFT-02 platform-metrics scope.** RESOLVED: deferred. CONTEXT.md scope explicitly limits DRIFT-02 to `admin/+page.svelte` and `api/admin/nansen/+server.ts`. The `platform-metrics/+page.svelte` `paymentTokenAddresses` Set is a different pattern (Set-of-addresses, not a hardcoded USDC string) and is not in REQ-ID scope. Tracked under "Future drift cleanups" in CONTEXT.md `<deferred>`.

4. **Anvil fork-block selection.** RESOLVED: 04-08 pins `FORK_BLOCK = 33_400_000` (Base block, ~3 months old at 2026-05-01, well within RPC retention and ≥ 1 month stability buffer). Verified at planning time as a block where representative tNVDA / tAMZN orders existed in the Orderbook. Recipe to refresh on fixture-schema-change events: `cast block --rpc-url $BASE_RPC_URL <BLOCK_NUMBER>` against a candidate block, confirm timestamp falls in [now − 6 months, now − 1 month], confirm Orderbook events at that block via `cast logs`. Documented in 04-RUNBOOK.md OBS-03 transcript-capture procedure.

## Sources

### Primary (HIGH confidence — verified in this session via tool calls)

- `src/lib/config/tokens.ts:25` — `getPaymentTokensForNetwork` already exists [VERIFIED via Read]
- `src/lib/utils/tokenMath.ts:213` — `isPaymentToken` already exists [VERIFIED via Read]
- `eslint.config.js:46-65` — TRADE-01 `no-restricted-syntax` precedent [VERIFIED via Read]
- `src/lib/server/snapshots/scraper.ts` — full file, 297 lines [VERIFIED via Read]
- Admin endpoint inventory (16 `+server.ts` files; 8 with state-mutating verbs; 3 currently audit) [VERIFIED via grep + ls]
- TOKENS.find / ALL_TOKENS.find site list (12 sites in 9 files) [VERIFIED via grep]
- USDC hardcoding sites (8 in admin/+page.svelte, 5 in admin/nansen/+server.ts) [VERIFIED via grep]
- `package.json` deps — vitest 1.6.0, vitest-mock-extended 1.3.1, ts-morph ^28.0.0 [VERIFIED via grep]
- `vite.config.js` test block — jsdom + setupFiles + deps.inline [VERIFIED via grep]
- Local anvil installation — `/opt/homebrew/bin/anvil` v1.2.3 [VERIFIED via `which anvil` + `anvil --version`]

### Secondary (MEDIUM confidence — citations from project docs)

- CONTEXT.md `<decisions>` D-01 through D-07 [CITED]
- ROADMAP.md Phase 4 success criteria (5 items) [CITED]
- Phase 1 D-01 (snapshot pipeline retained → TEST-04 in scope) [CITED]
- Phase 2 02-01 TRADE-01 codemod + ESLint precedent [CITED]
- Phase 3 SEC-03+04 wallet-session cookie shape [CITED]
- Foundry book — `--fork-url`, `--fork-block-number` flags, viem HTTP transport JSON-RPC compatibility [CITED: book.getfoundry.sh/anvil]

### Tertiary (LOW confidence — to validate at planning time)

- TanStack `staleTime: Infinity` count in queries (used in cross-cutting grep) — count not enumerated in this research [ASSUMED preserved]
- Vercel Logs CLI flag syntax (`--filter`, `--since`) [ASSUMED — operator validates at capture time]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps verified in package.json + on-disk
- Architecture: HIGH — patterns mirror existing TRADE-01 (verified in eslint.config.js)
- Pitfalls: HIGH — derived from CONTEXT.md cross-cutting gates + scraper code inspection
- Discretionary resolutions: HIGH (TEST-04, DRIFT-01, DRIFT-02, TEST-02 inventory all grep-verified); MEDIUM (TEST-03 fixture count is judgment call); HIGH (anvil-CI gating decision is unambiguous given cost analysis)
- Validation Architecture: HIGH — file paths and commands derived from existing test infrastructure

**Research date:** 2026-05-01
**Valid until:** 2026-05-31 (30 days; codebase moves slowly during closure phases — re-verify only if major refactors land)
