# Phase 1: UI-Driven E2E + Order Test Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 1-UI-Driven E2E + Order Test Coverage
**Areas discussed:** UI test runtime, Wallet/signer wiring, Failure-mode forcing, data-testid convention, Audit format + must-fix bar, CI-plumbing scope

---

## UI Test Runtime

### Q1 — Render strategy

| Option | Description | Selected |
|--------|-------------|----------|
| @testing-library/svelte + jsdom | Render components in jsdom; click via userEvent; route fetches/RPC at anvil. Extends current pattern; zero new tooling. Limit: Dynamic Labs SDK + browser APIs need stubbing; can't catch real-browser quirks. | |
| Playwright (real browser) | Drive real Chromium against the trade page. Real wagmi/Dynamic flow, real network. New top-level dependency, ~20–60s cold-start, harder wallet wiring. | ✓ |
| Vitest browser mode | Vitest 1.6 `browser` provider runs component tests in real Chromium. Less mature in this codebase; requires Vitest upgrade + browser provider install. | |

**User's choice:** Playwright (real browser).
**Notes:** Highest fidelity; closest to "drive the actual trade-page UI button" wording in TEST-05/06. Cost (CI time, dependency install) accepted.

### Q2 — Serving mode

| Option | Description | Selected |
|--------|-------------|----------|
| `vite preview` of production build | Closest to what users see (Vercel adapter output, minified, real CSP). Slower per-run; mitigate by building once in globalSetup. | ✓ |
| `vite dev` (HMR) | Fast startup; CSP differs from production (EU-Sentry-CSP class of bug won't reproduce here). | |
| `@sveltejs/kit/test` adapter | Boot handler in-process; closer to real handler than preview. Untested in this codebase. | |

**User's choice:** vite preview of production build.
**Notes:** Phase 3 EU-Sentry CSP incident (PR #170) is exactly the bug class that justifies preview-mode fidelity over dev.

### Q3 — Anvil lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Single fork in globalSetup, evm_snapshot/revert per test | Mirrors v1.0 fork harness; fastest. Risk: snapshot/revert state-leakage on certain RPC overrides — document trap. | ✓ |
| Restart anvil per spec file | Cleaner isolation; ~5–10s slower per spec. | |
| Single fork, no snapshots, sequential ordering | Fastest but couples tests; reject. | |

**User's choice:** globalSetup-once + evm_snapshot/revert per test.
**Notes:** Reuses v1.0 `tests/helpers/anvil.ts` shape; new helper layer adds the snapshot/revert wrapper.

---

## Wallet/Signer Wiring

### Q1 — In-test wallet provider

| Option | Description | Selected |
|--------|-------------|----------|
| EIP-1193 stub via Playwright `addInitScript` | Inject `window.ethereum` proxying to viem WalletClient bound to anvil with anvil pre-funded key. wagmi injected connector picks it up. Real wagmi flow + real signing. | ✓ |
| Dappwright / synpress | Real MetaMask extension in headless browser. Heavy CI cost; brittle to MetaMask changes. | |
| Stub auth stores + viem at anvil | Skips wagmi-connector codepath; lowest fidelity that still works. | |

**User's choice:** EIP-1193 stub.
**Notes:** SEC-03+04 atomic-flip session-cookie sign-in flow runs end-to-end through this; `personal_sign` returns a real signature anvil can verify.

### Q2 — Signer identity

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh anvil prefunded key + on-fork token funding | Use anvil pre-funded account; fund tokens via `anvil_setStorageAt` or whale-impersonation transfer in beforeEach. Deterministic. | ✓ |
| `anvil_impersonateAccount` of real Base mainnet holder | Realistic state, no funding setup. Brittle to fork-block holder movement; EIP-1271 wallets break the pattern. | |
| Mix — prefund happy path, impersonate whales for limit-order counterparty fills only | Hybrid. | |

**User's choice:** Fresh prefunded + on-fork token funding.
**Notes:** TEST-09 simulated counterparty fill may still need impersonation for the matching counterparty side — captured as planner mechanism choice.

### Q3 — Auth path coverage

| Option | Description | Selected |
|--------|-------------|----------|
| wagmi-only for now; Dynamic stays unit/contract-tested | E2E targets wagmi+EIP-1193. Dynamic SDK hard to fake; existing unit tests cover unified state. | ✓ |
| Both paths (Dynamic shim alongside) | Doubles fixture surface; breaks every Dynamic SDK major version. | |
| Dynamic-only | Skips wagmi flow in E2E. | |

**User's choice:** wagmi-only.
**Notes:** Captured Dynamic E2E as deferred backlog item.

---

## Failure-Mode Forcing (TEST-08)

### Q1 — Stale oracle + market-hours gating

| Option | Description | Selected |
|--------|-------------|----------|
| Anvil `evm_setNextBlockTimestamp` for both | Advance fork time past Pyth freshness window; set Saturday timestamp for market-hours. Browser-side `Date.now()` patched via `addInitScript`. Exercises real on-chain pre-flight. | ✓ |
| Mock at JS layer (route-intercept Pyth, stub `isMarketOpen`) | Doesn't exercise on-chain freshness check; misses the UI-says-open / on-chain-says-stale bug class. | |
| Pick fork block where conditions are naturally true | Brittle; ties tests to a moving block target. | |

**User's choice:** evm_setNextBlockTimestamp for both.

### Q2 — Slippage exceeded + no liquidity

| Option | Description | Selected |
|--------|-------------|----------|
| Slippage at UI input; no-liquidity by token+side selection | Tight slippage entered in UI; real ratio-cap math rejects. No-liquidity via natural one-sided book at chosen fork block. Document in 01-RUNBOOK. | ✓ |
| Cancel orders on the fork to force no-liquidity | Impersonate owners and `removeOrder`. Deterministic but slow setup. | |
| Synthetic hand-crafted Rain orderbook on fork | Contradicts "forked, not mocked" milestone principle; reject. | |

**User's choice:** UI input + token/side selection.
**Notes:** `removeOrder` cancellation captured as deferred fallback technique if natural one-sided books prove brittle.

### Q3 — Insufficient balance

| Option | Description | Selected |
|--------|-------------|----------|
| Separate anvil prefunded account with no token balance | Account #1 funded; account #2 has ETH for gas only. Switch EIP-1193 stub signer per test. Clean isolation. | ✓ |
| Burn balance via transfer to address(0) before test | Risk of coupling tests if snapshot/revert misses an ERC20 slot; reject. | |

**User's choice:** Separate prefunded-no-balance account.

---

## data-testid Convention (TEST-12)

### Q1 — Naming scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Compound: stable testid + semantic data-* attrs | `data-testid="trade-submit" data-side="buy" data-mode="market"`. Survives feature additions; scales to limit/DCA. | ✓ |
| Flat hierarchical (`trade-buy-submit`, `trade-sell-submit`) | Easier to grep; namespace grows linearly with feature combinations. | |
| BEM-ish (`trade__form__submit--buy`) | Verbose without compensating benefit. | |

**User's choice:** Compound testid + semantic data-* attrs.

### Q2 — Retrofit scope

| Option | Description | Selected |
|--------|-------------|----------|
| Trade-page interactive shell only | MarketOrder + LimitOrder + trade-page shell (mode tabs, error/success surfaces, wallet-connect button). Honest scope for an 8-REQ phase. | ✓ |
| All order-related components (market + limit + DCA + QuickTrade) | Future-proofs for follow-on E2E but bloats this phase's diff. | |
| App-wide retrofit | Out of scope for an 8-REQ phase. | |

**User's choice:** Trade-page interactive shell only.
**Notes:** DCA + QuickTrade + admin captured as deferred ideas.

### Q3 — Documentation + enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| New section in `.planning/codebase/TESTING.md` + ESLint custom rule | Documents grammar + scope + rationale. Lint flags new E2E specs importing from internal-logic modules. | ✓ |
| Convention doc only, no lint | Cheaper; convention erodes silently. | |
| Strict lint banning getByText/getByRole in E2E | Over-rigid; semantic role/text sometimes correct selector. | |

**User's choice:** TESTING.md section + light ESLint rule.

---

## Audit Format + Must-Fix Bar (TEST-10/11)

### Q1 — Audit deliverable shape

| Option | Description | Selected |
|--------|-------------|----------|
| Per-REQ coverage matrix tied to TRADE-01..04 + Phase 1 failure surfaces | Rows = bug-class register; columns = unit/service-integration/UI E2E/gap. Must-fix = TRADE-01..04 boundary class with no test, OR TEST-08 failure mode lacking E2E. | ✓ |
| Per-test classification table (file-by-file) | More granular but doesn't tie back to bug classes; risk of busywork. | |
| Hybrid (matrix + appendix file walk) | Heavier write-up; same decision criterion. | |

**User's choice:** Per-REQ coverage matrix.
**Notes:** Must-fix bar maps directly to milestone goal "stop user-affecting trade-execution bugs" rather than coverage parity.

---

## CI-Plumbing Scope

### Q1 — Backlog absorption

| Option | Description | Selected |
|--------|-------------|----------|
| Fold both 999.8 (foundry CI install) + 999.11 (archive-RPC green CI run) into Phase 1 | Phase 1 ships green CI for `test:integration` and new `test:e2e`. Switch to `foundry-rs/foundry-toolchain` action. Without this, suite is local-only. | ✓ |
| Fix 999.8 + 999.11 only; defer Playwright CI to follow-up plan | Smaller diff, faster ship; risk that follow-up plan becomes never. | |
| Defer all CI work | Suite never gates merges; reject unless velocity-bound. | |

**User's choice:** Fold both into Phase 1.

---

## Claude's Discretion

- Test directory layout (`tests/integration/ui/` vs `tests/e2e/`) — planner choice.
- Specific `FORK_BLOCK` value — researcher picks based on archive-RPC reachability + chosen no-liquidity (token, side) pair holding at the block + post-Phase-3 contract addresses unchanged.
- EIP-1193 stub library choice (`@web3-mock/wagmi-mock` vs custom `addInitScript` snippet) — researcher picks; D-03 invariants must hold.
- ERC20 balance-slot funding technique (`anvil_setStorageAt` slot derivation per token vs whale impersonation per token) — researcher picks; document table in 01-RUNBOOK regardless.
- CSP allowlist approach for Playwright (preview-mode CSP relaxation gated on `E2E=1` env var vs same-origin-only fetch routing) — researcher picks; document choice in 01-RUNBOOK.

## Deferred Ideas

- Dynamic Labs embedded-wallet E2E coverage (capture as `999.x` backlog).
- DCA-deploy E2E coverage.
- QuickTrade E2E coverage.
- Admin-page E2E coverage (hard-out per Out of Scope).
- `removeOrder` mass-cancellation as no-liquidity backup technique (escape hatch in 01-RUNBOOK).
- Per-spec anvil restart as snapshot/revert backup (escape hatch in 01-RUNBOOK).
- Smart-contract-wallet (EIP-1271) E2E coverage (out of scope; covered by unit + Phase 3 REL-02).
