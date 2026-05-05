---
phase: 4
slug: boundary-tests-and-drift-cleanup
status: verified
threats_open: 0
asvs_level: 2
created: 2026-05-02
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 4 ships codemods, tests, and documentation — no new product surface. Verifies prior-phase mitigations remain intact.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Admin Browser → admin/+page.svelte (DRIFT-02) | Admin user input + on-chain reads. Existing `requireAdmin` gate already in place. No new boundary. | Admin session + read-only chain data |
| Admin Browser → /api/admin/nansen/+server.ts (DRIFT-02) | Admin-gated route; only payment-token-comparison logic changed. | Admin session + token addresses |
| Admin Browser → /api/admin/{excluded,pool,team}-wallets, /api/admin/snapshots/{trigger,regenerate} | Existing `requireAdmin` gate; audit-log emission added on post-gate path. | Admin actions (mutations) |
| Untrusted Browser → SvelteKit hooks | Tests pin trust-boundary classification for every request. No new surface; tests verify existing surface. | Cookies, CSP headers, CORS origins, UA strings |
| GHA runner → Foundry installer (foundryup) | New supply-chain dependency for integration-test job. | Installer binary over HTTPS |
| GHA runner → BASE_RPC_URL | Existing trust boundary (Phase 3 SEC-01). Secret read access only. | RPC URL secret |
| Local anvil RPC → forked Base mainnet | Read-only proxy. No production state mutated. | Read-only chain state |
| Captured production transcripts → committed test fixtures | PII risk if redaction fails (Pitfall 6). Mitigated via redaction recipe + grep gates. | Wallet addresses (redacted) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01-01 | Repudiation | CLAUDE.md edit | accept | Doc edit only; atomic git commit | closed |
| T-04-01-02 | Tampering | CLAUDE.md (orientation doc) | mitigate | Phase-exit Wave 6 grep gate (Rhinestone\|EIP-7702\|account-abstraction); 04-RUNBOOK.md §"DRIFT-03 grep gate" L427 | closed |
| T-04-02-01 | Tampering | Payment-token classification | mitigate | `src/lib/utils/tokenMath.ts:213` `isPaymentToken` helper — 13 ad-hoc comparisons routed through one tested code path | closed |
| T-04-02-02 | Information Disclosure | None new | accept | Behavior-preserving refactor; no new logs/responses/endpoints | closed |
| T-04-03-01 | Tampering | Token-lookup correctness | mitigate | Codemod migrated 12 sites to `getTokenByAnyAddress`; `eslint.config.js:55-101` `no-restricted-syntax` rule prevents recurrence | closed |
| T-04-03-02 | Repudiation | Build-time codemod | accept | Codemod commits via git; idempotency check verified | closed |
| T-04-04-01 | Authentication Bypass | wallet-session classification | mitigate | `tests/hooks/wallet-session.test.ts` asserts D-04 atomic-flip invariant + D-04b no per-request signature | closed |
| T-04-04-02 | Tampering | CSP directives | mitigate | `tests/hooks/csp.test.ts:65-85` asserts explicit `*.ingest.sentry.io`, no bare `*.sentry.io` wildcard, no `unsafe-eval`, no Onramper frame-src | closed |
| T-04-04-03 | Elevation of Privilege | admin gating | mitigate | `tests/hooks/admin-gate.test.ts:54-126` — admin-required, redirect, bypass branch tests | closed |
| T-04-04-04 | Information Disclosure | CORS classification | mitigate | `tests/hooks/cors.test.ts:103-110` asserts unknown origin → null ACAO | closed |
| T-04-04-05 | Denial of Service | Bot detection | mitigate | `tests/hooks/bot-rejection.test.ts:112-139` ordering invariant + negative controls (OPTIONS + public bypass) | closed |
| T-04-05-01 | Repudiation | 5 admin endpoints | mitigate | `audit.logSuccess`/`audit.logFailure` present in all 5 server.ts files | closed |
| T-04-05-02 | Information Disclosure | Failure-path log message | mitigate | `outcome.errorMessage ?? 'unknown error'` only; no body/headers/cookies (e.g. excluded-wallets/+server.ts:29) | closed |
| T-04-05-03 | Tampering | Audit-log emission silenceable | mitigate | Inner try/catch around `logFailure`; 04-RUNBOOK.md §"TEST-02 audit-log import grep" L456 | closed |
| T-04-05-04 | Denial of Service | Slow audit-log infrastructure | accept | Awaited synchronously; matches existing audited endpoints | closed |
| T-04-06-01 | Repudiation | Audit-log emission silently broken | mitigate | 8 audit tests under `tests/lib/admin/*.audit.test.ts` assert `logSuccess` + `logFailure` | closed |
| T-04-06-02 | Tampering | Mock leakage between test files | mitigate | `tests/lib/admin/excluded-wallets.audit.test.ts:10,28-29` top-scope `vi.mock` + `beforeEach(vi.clearAllMocks())`; per-endpoint files | closed |
| T-04-07-01 | Tampering | Foundry installer | accept | `.github/workflows/test.yml:53-56` foundryup official installer; cache key `foundry-${runner.os}-v1`; 04-RUNBOOK.md §"Foundry / Anvil CI Setup" L68 | closed |
| T-04-07-02 | Information Disclosure | BASE_RPC_URL leakage in CI logs | mitigate | anvil `--silent`; helper does not log env; GHA secret-masking | closed |
| T-04-07-03 | Denial of Service | Slow Foundry install | mitigate | `.github/workflows/test.yml:44-51` `actions/cache@v4` caches `~/.foundry`; ~30-60s cold → ~3s warm | closed |
| T-04-07-04 | Spoofing | Modified anvil binary | accept | foundryup over HTTPS; matches upstream practice; checksum verification deferred | closed |
| T-04-08-01 | Information Disclosure | Wallet addresses via fixtures | mitigate | `tests/fixtures/marketOrder/*.json` — `0x...redacted` substitution; only allowlisted Base USDC remains; 04-RUNBOOK.md L280 | closed |
| T-04-08-02 | Tampering | Wrong failure-mode classification masking regressions | mitigate | 7 `replay-*.test.ts` files in `tests/integration/marketOrder/` 1:1 with fixtures + named OBS-03 reasons | closed |
| T-04-08-03 | Denial of Service | anvil tests slow CI | accept | `package.json:15` `test:integration` separate npm script; separate CI job parallel to fast jsdom job | closed |
| T-04-09-01 | Tampering | Scraper wrong totals on edges | mitigate | `src/lib/server/snapshots/scraper.test.ts:262,311,357` pagination/legacy-fallback/transient-failure tests | closed |
| T-04-09-02 | Repudiation | Scraper failure goes silent | mitigate | `scraper.test.ts:294,345,382` `expect(warnSpy).toHaveBeenCalled` preserves OBS-04 surface | closed |
| T-04-PHASE-EXIT-01 | Tampering | Regression past per-plan acceptance | mitigate | 04-RUNBOOK.md L179-280 (DRIFT/TEST gates) + L270-280 (build/test gates) | closed |
| T-04-PHASE-EXIT-02 | Repudiation | RUNBOOK incomplete | mitigate | 04-RUNBOOK.md 468 lines (≥200) with 7+ named sections | closed |
| T-04-PHASE-EXIT-03 | Tampering | Phase 2/3 invariant regressed undetected | mitigate | 04-RUNBOOK.md §"Phase 2 carry-forward gates" L225, §"Phase 3 carry-forward gates" L236 | closed |
| T-04-PHASE-EXIT-04 | Information Disclosure | Un-redacted wallets in fixtures | mitigate | Fixtures redacted; Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` allowlisted as canonical contract | closed |
| T-04-PHASE-EXIT-05 | Repudiation | UAT carry-forward dropped | mitigate | 04-RUNBOOK.md §"HUMAN-UAT Carry-Forward" L359, §"/gsd-verify-work Invocation" L373, §"Milestone Exit Checklist" L379 | closed |
| T-04-PHASE-EXIT-06 | Denial of Service | Anvil archive RPC lost | accept | 04-RUNBOOK.md §"Foundry / Anvil CI Setup" L68 documents A1 risk + remediation (switch to archive-capable provider) | closed |

*Status: closed (all)*
*Disposition: mitigate (24) · accept (8)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-01-01 | Doc-only edit; no runtime surface. Atomic git commit provides reconstruction. | Phase 4 owner | 2026-05-02 |
| AR-04-02 | T-04-02-02 | Behavior-preserving refactor — no new data exposed. | Phase 4 owner | 2026-05-02 |
| AR-04-03 | T-04-03-02 | Codemod commits via git; idempotency verified. Single PR atomic. | Phase 4 owner | 2026-05-02 |
| AR-04-04 | T-04-05-04 | Synchronous awaited audit-log call. Matches existing audited endpoints' latency profile. | Phase 4 owner | 2026-05-02 |
| AR-04-05 | T-04-07-01 | foundryup is official Foundry installer (book.getfoundry.sh). Pinned via cache-key version `v1`. Vendoring a Foundry binary is disproportionate cost. Documented in 04-RUNBOOK.md. | Phase 4 owner | 2026-05-02 |
| AR-04-06 | T-04-07-04 | foundryup downloads over HTTPS from official source. No checksum verification (matches upstream installer pattern). Hardening deferred to a future phase. | Phase 4 owner | 2026-05-02 |
| AR-04-07 | T-04-08-03 | anvil-based integration tests gated behind separate `npm run test:integration` script and CI job; cannot block the fast jsdom test job. | Phase 4 owner | 2026-05-02 |
| AR-04-08 | T-04-PHASE-EXIT-06 | RPC archive-node access loss is a possible CI-blocker; remediation (switch to archive-capable provider) documented in 04-RUNBOOK.md §"Foundry / Anvil CI Setup". Pre-emptive switch is out of scope for Phase 4. | Phase 4 owner | 2026-05-02 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-02 | 32 | 32 | 0 | gsd-security-auditor |

### Audit Notes — 2026-05-02

- All 32 threats from per-plan registers verified. 24 mitigations have direct file:line evidence; 8 accepted risks documented above.
- Test directory naming differs from threat-model text (`tests/hooks/` vs `tests/server/`) but all named test files exist with claimed assertions — non-blocking.
- 4 `TOKENS.find`/`ALL_TOKENS.find` raw call-sites remain with `eslint-disable-next-line` + justification (3 are symbol-based or payment-token lookups outside DRIFT-01 scope); documented in 04-RUNBOOK.md §"DRIFT-01 grep gate over-strictness" L435.
- Per-plan SUMMARY `## Threat Flags` sections cleared (none unregistered).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-02
