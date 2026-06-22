# Phase 3: Production-Grade Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 03-production-grade-hardening
**Areas discussed:** Phase-internal sequencing + rollout (umbrella; included SEC-01 client RPC + SEC-06 admin gate + SEC-03+04 rollout shape + session lifetime as sub-questions)

---

## Phase-Internal Sequencing + Rollout (umbrella selection)

### Sub-question 1: Wave shape

| Option | Description | Selected |
|--------|-------------|----------|
| This shape | 9 waves: SEC-01 → (SEC-02 + SEC-05 + SEC-07 parallel) → SEC-06 → REL-01 → REL-02 → SEC-03+04 paired → REL-03 | ✓ |
| SEC-03+04 ship FIRST | Front-load auth surgery | |
| REL-03 ship FIRST | Vendor registry first (only piece that fixes a current external-SaaS failure mode) | |
| Tighter parallelism | 5 waves; collapse all SEC-01/02/05/06/07 into one wave | |

**User's choice:** This shape (Recommended) — captured as D-01.
**Notes:** Wave parallelism is structural (file conflicts), not runtime. Wave 6 (SEC-03+04) gets a manual smoke test gate before deploy due to real-money page surface area.

---

### Sub-question 2: SEC-01 client RPC env var split

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Single key both sides | PUBLIC_BASE_RPC_URL = BASE_RPC_URL = same Alchemy app. Simplest, one rotation. Client key exposed in bundle either way. | ✓ |
| (b) Split keys | Two separate Alchemy apps (client + server). Limits blast radius; doubles ops surface. | |
| (c) Public RPCs only on client | Drop Alchemy client-side. Eliminates leak surface but inherits public-RPC flakiness on the trade page (CONCERNS.md "RPCs rotated multiple times"). | |

**User's choice:** (a) Single key both sides (Recommended) — captured as D-02.
**Notes:** Explicit acceptance of residual leak risk in exchange for operational simplicity. Future hardening can split keys if Alchemy quota abuse logs ever indicate measurable problem.

---

### Sub-question 3: SEC-06 admin gate + rate-limit shape

| Option | Description | Selected |
|--------|-------------|----------|
| requireAdmin + heavy tier | Admin-only POST /api/snapshots/generate (cron is separate path); preview endpoints get heaviest tier of applyTieredRateLimit. Researcher confirms cron call shape. | ✓ |
| requireAdmin + CRON_SECRET escape | Accept either authenticated admin OR valid CRON_SECRET header on POST /generate | |
| Split into separate endpoints | POST /api/snapshots/generate (admin-only) + POST /api/cron/snapshots/generate (cron-only) | |

**User's choice:** requireAdmin + heavy tier (Recommended) — captured as D-03.
**Notes:** Researcher confirms during planning that the Vercel cron at `src/routes/api/cron/snapshots/+server.ts` does NOT also POST to `/api/snapshots/generate`. If that confirmation fails, fall back to Option B (escape hatch).

---

### Sub-question 4: SEC-03+04 auth rollout shape

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Atomic flip | Single PR replaces wallet-address auth with session cookie + double-submit CSRF. Existing users re-sign once on next visit. | ✓ (locked after clarification — see notes) |
| (b) Grace window N days | Server accepts either cookie for window; two PRs. | |
| (c) Observation-mode shadow | Session cookie issued in parallel; old auth authoritative; flip PR cuts authority. Three PRs. | |
| (Other) | "As long as it doesn't require the user to do a wallet signature every time" — user-typed UX constraint | |

**User's choice:** Free-text "as long as it doesn't require the user to do a wallet signature every time" — clarified as a UX constraint that all three rollout options satisfy (the wallet signature is per-session, not per-request, in every option). Atomic flip locked as the default rollout shape — captured as D-04 + D-04b. The constraint itself preserved verbatim as D-04b.
**Notes:** Reflected back to user during discussion: "the per-request UX is identical across options; the actual UX-determining variable is session lifetime, not rollout shape." User accepted reframing implicitly by answering the follow-up session-lifetime question.

---

### Sub-question 4b (follow-up): Session lifetime

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days sliding | Activity refreshes; active traders never re-sign. | ✓ |
| 7 days sliding | Tighter security; weekly visitors see prompt occasionally. | |
| 24 hours absolute | Matches existing auth.ts SESSION_DURATION_MS but disruptive — re-sign every morning. | |
| Indefinite until invalidated | Best UX, weakest security; stolen cookie works forever. | |

**User's choice:** 30 days sliding (Recommended) — captured as D-04a.
**Notes:** Aligns with typical Web3 dApp UX (Uniswap and similar). Stolen-cookie window capped at 30 days; sliding refresh prevents the "I came back next morning and had to sign again" failure mode.

---

### Sub-question 5: Continue or wrap?

| Option | Description | Selected |
|--------|-------------|----------|
| Write CONTEXT.md now | Lock the 4 decisions; remaining gray areas (REL-01 retry, REL-03 vendor, SEC-03+04 storage backend) deferred to Claude's discretion. | ✓ |
| Discuss REL-01 retry shape | Backoff strategy, latestBlock-fallback replacement | |
| Discuss REL-03 vendor strategy | Static asset vs compiled-in vs npm dep | |
| Discuss SEC-03+04 storage backend | Vercel KV vs in-memory hot path | |

**User's choice:** Write CONTEXT.md now.
**Notes:** Confirmed satisfaction with sequencing-area decisions; rest goes to researcher/planner under Claude's discretion.

---

## Claude's Discretion

Decisions explicitly delegated to researcher/planner (preserved verbatim in CONTEXT.md `<decisions>` "Claude's Discretion" subsection):

- REL-01 retry shape — backoff strategy, max attempts, time budget vs cron maxDuration:800, replacement for the silent latestBlock fallback in `getBlockNumberForTimestamp`.
- REL-02 Transport reuse pattern — viem `fallback([...])` vs custom Transport delegating to RPC_URLS list; whether to preserve OBS-04's synthetic `'alchemy-base-mainnet'` rpc_url label or replace with real values.
- REL-03 vendor strategy — `/static/registry/` vs compiled-into-bundle vs npm dep + update cadence.
- SEC-03+04 storage backend — Vercel KV (matches `signatureChallenge.ts` precedent) vs in-memory hot path with KV durable store.
- SEC-03 logout endpoint shape — path, method, behavior.
- SEC-05 alphabet + length preservation — preserve existing formats (`ST0X-XXXX-XXXX`, `st0x-ref-xxxxxx`); purely the `Math.random` → `crypto.randomBytes` swap with rejection sampling.
- SEC-07 env detection signal — `VERCEL_ENV` vs other canonical Vercel signal.
- SEC-02 throw site — module-local (matching CRON_SECRET precedent) vs centralized helper.
- Phase-exit wave shape — verification grep gates + 03-RUNBOOK.md (analogous to 02-08).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section (full list there). Highlights from this discussion:

- Split Alchemy keys / public-RPC-only-on-client — rejected in favor of single-key simplicity; revisit if quota abuse becomes measurable.
- Grace window or shadow rollout for SEC-03+04 — rejected in favor of atomic flip; revisit only if atomic flip surfaces unexpected re-sign UX issues during Wave 6 manual smoke test.
- Permanent removal of `wallet-address` cookie — Phase 3 ships the downgrade only; permanent removal is future cleanup contingent on Phase 4 TEST-01 hooks.server.ts integration tests confirming no surviving consumers.
- Sliding-refresh frequency tuning — exact threshold (every request / every N hours / once-a-day) is the planner's call; KV write cost vs UX coverage trade-off.
- All TEST-* and DRIFT-* deferrals to Phase 4 (per ROADMAP).
- All Phase-1 carry-forward deferrals (external log drain, +error.svelte, etc.) preserved unchanged.
