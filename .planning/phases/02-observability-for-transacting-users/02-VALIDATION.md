---
phase: 2
slug: observability-for-transacting-users
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
revised: 2026-05-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x (jsdom) + `@testing-library/svelte` for component tests |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run tests/lib/services/observability/ tests/lib/server/logger.contextHandle.test.ts` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | Quick: ~3s; Full: ~45s |

---

## Sampling Rate

- **After every task commit:** Run quick command (subsystem tests only — observability + logger)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds for quick run

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | OBS-09 | T-2-E | Module-level trade_id state mints/clears cleanly; Sentry never throws back | unit | `npm test -- --run tests/lib/services/observability/tradeId.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | OBS-07, OBS-11 | T-2-B | Property contract enforced; address-bearing error_message redacted before reaching PostHog | unit | `npm test -- --run tests/lib/services/observability/tradeEvents.test.ts tests/lib/services/observability/tradeEvents.privacy.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | OBS-07, OBS-09 | T-2-A | X-Trade-Id header validated as strict UUIDv4 before storing in RequestContext (header injection / log forgery defense, ASVS V5) | unit | `npm test -- --run tests/lib/server/logger.tradeId.test.ts tests/lib/server/logger.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | OBS-06 | T-2-C, T-2-G | Sentry Replay configured with maximum masking (D-03); CSP worker-src blob: regression guard | unit (config inspection) | `npm test -- --run tests/lib/observability/sentryReplayConfig.test.ts tests/lib/server/csp.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | OBS-09 | — | trade_id Sentry tag attached on capture for cross-tool navigation | unit | `npm test -- --run tests/lib/services/observability/captureTakeOrderFailure.test.ts` | ✅ (extend existing) | ⬜ pending |
| 2-03-01 | 03 | 3 | OBS-07, OBS-09 | T-2-E | Market submit handler mints + clears trade_id in finally; OBS-07 step events fire in order with consistent trade_id; classifier maps errors to ErrorClass enum | component | `npm test -- --run tests/lib/components/orders/MarketOrder.events.test.ts tests/lib/components/orders/MarketOrder.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 3 | OBS-07, OBS-09 | — | marketOrderExecution.ts emits broadcast/confirmed at SDK callback boundaries with active trade_id | unit (service) | `npm test -- --run tests/lib/services/marketOrderExecution.events.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 3 | OBS-07, OBS-09 | T-2-E | Limit submit handler mints + clears trade_id; emits trade_button_clicked + limit_order_deployed | component | `npm test -- --run tests/lib/components/orders/LimitOrder.events.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-04 | 03 | 3 | OBS-07, OBS-09 | T-2-E | DCA gap-fill: trade_panel_opened on mount; submit handler mints + clears trade_id; deploy event emitted with order_type:'dca' | component | `npm test -- --run tests/lib/components/orders/DcaOrder.events.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-05 | 03 | 3 | OBS-07, OBS-08, OBS-09 | — | +page.svelte fires page_viewed with page:'trade' on route load (OBS-08 funnel intent step); orderDeployment.ts emits deploy steps with order_type per caller signature (no silent fallback) | unit (service) | `npm test -- --run tests/lib/services/orderDeployment.events.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 4 | OBS-08, OBS-10 | — | RUNBOOK exists with 7 sections, 4+ screenshot placeholders, OBS-08 funnel build recipe | doc | `test -f .planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md && grep -cE "OBS-08\|OBS-10\|D-02\|D-04\|Pitfall 1" .planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md` (expect >= 5) | ❌ created in plan | ⬜ pending |
| 2-04-02 | 04 | 4 | OBS-11 | T-2-D, T-2-M | PRIVACY-REVIEW enumerates every TradeEventProps field with PII classification + 5 operator sign-off lines | doc | `test -f .planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md && grep -c "Sign-off\|Reviewed by" .planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md` (expect >= 5) | ❌ created in plan | ⬜ pending |
| 2-04-03 | 04 | 4 | OBS-08, OBS-10, OBS-11 | T-2-K | Operator runs SaaS config (Sentry Replay enable, PostHog sample rate, funnel build) | manual checkpoint | RUNBOOK §1, §2, §3 followed; funnel JSON exported to artifacts/ | n/a (manual) | ⬜ pending |
| 2-04-04 | 04 | 4 | OBS-09, OBS-10, OBS-11 | — | OBS-10 production smoke captures cross-tool correlation (same trade_id in Sentry + PostHog + pino); OBS-11 5-section sign-off filled | manual checkpoint | RUNBOOK §5 screenshots + PRIVACY-REVIEW signatures | n/a (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test scaffold files Wave 1 / Wave 2 / Wave 3 tasks must create (each task creates the test file alongside the production code per TDD discipline):

- [ ] `tests/lib/services/observability/tradeId.test.ts` — covers OBS-09 mint/get/clear lifecycle (Plan 01 Task 1)
- [ ] `tests/lib/services/observability/tradeEvents.test.ts` — covers OBS-07 emission contract (Plan 01 Task 2)
- [ ] `tests/lib/services/observability/tradeEvents.privacy.test.ts` — covers OBS-11 address-redaction regression guard (Plan 01 Task 2)
- [ ] `tests/lib/server/logger.tradeId.test.ts` — covers OBS-07 server-side + OBS-09 header extraction (Plan 01 Task 3)
- [ ] `tests/lib/observability/sentryReplayConfig.test.ts` — covers OBS-06 config inspection (Plan 02 Task 1)
- [ ] `tests/lib/server/csp.test.ts` — covers `worker-src 'self' blob:` regression guard (Plan 02 Task 1)
- [ ] `tests/lib/components/orders/MarketOrder.events.test.ts` — covers per-step emission for market (Plan 03 Task 1)
- [ ] `tests/lib/services/marketOrderExecution.events.test.ts` — covers broadcast/confirmed emission at SDK callback boundaries (Plan 03 Task 1, gap-fill per checker issue #4)
- [ ] `tests/lib/components/orders/LimitOrder.events.test.ts` — covers per-step emission for limit (Plan 03 Task 2a)
- [ ] `tests/lib/components/orders/DcaOrder.events.test.ts` — covers DCA gap-fill (Plan 03 Task 2b)
- [ ] `tests/lib/services/orderDeployment.events.test.ts` — covers orderDeployment emission with mandatory order_type parameter (Plan 03 Task 2c, gap-fill per checker issue #5)

Framework already installed (Vitest + jsdom + `@testing-library/svelte` per `package.json`); no install step required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OBS-08 funnel exists in PostHog dashboard with named drop-off steps, broken out by `order_type` | OBS-08 | Funnel built in PostHog UI (manual per D-08-equivalent solo-team simplicity); JSON export checked into `artifacts/` | RUNBOOK §3 |
| Real production trade roundtrip captured end-to-end across Sentry replay, PostHog events, Vercel pino logs | OBS-10 | Cannot synthesize a real production trade in CI; manual post-deploy smoke per v1.0 PERF-01 HUMAN-UAT pattern | RUNBOOK §5 — capture 3 screenshots sharing same `trade_id` |
| OBS-09 cross-tool correlation verified end-to-end | OBS-09 | **Accepted gap** (per checker issue #2): no E2E correlation test; coverage = OBS-10 manual smoke (RUNBOOK §5 explicitly verifies same `trade_id` across all three sinks). Component-level mocked tests in Plan 03 + service-level emission tests in Plan 03 cover the unit-level invariants. The "is the wire actually connected" verification belongs to OBS-10. | RUNBOOK §5 step 7 ("Verify all three screenshots share the same `trade_id` value (cross-tool correlation = PASS)") |
| Privacy review checklist signed off by operator | OBS-11 | Human sign-off required (operator/legal call on cookie-consent stance for Sentry Replay) | PRIVACY-REVIEW §1-§6 sign-off lines |
| PostHog session-recording sample rate operator-configured to 0.05–0.10 | D-04 | Per Pitfall 1 (vendor-direction shift), sampling now configured in PostHog dashboard, not via posthog-js init | RUNBOOK §2 |
| Sentry project Replay enabled in Sentry dashboard | OBS-06 | Account-level toggle, not in code | RUNBOOK §1 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every code-producing task references a test file; manual-only items are documented above with explicit acceptance)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Plan 04 manual checkpoints follow Plans 01-03 which are fully automated)
- [x] Wave 0 covers all MISSING references (test files listed above; each is created in the corresponding TDD task)
- [x] No watch-mode flags (all commands use `--run` to disable Vitest watch)
- [x] Feedback latency < 5s for quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (revision-mode auto-approval — all blocker issues addressed)
