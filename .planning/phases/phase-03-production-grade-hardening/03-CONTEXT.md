# Phase 3: Production-Grade Hardening - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the latent security and reliability gaps the audit (`.planning/codebase/CONCERNS.md`) flagged so that no single environmental failure (committed key leak, missing env var, RPC misbehavior, GitHub raw outage) can cause a user-visible outage or expose an unauthenticated attack path.

Ten REQ-IDs in scope:

1. **SEC-01 — Hardcoded Alchemy key removal + rotation.** Replace the literal Alchemy URL at `networks.ts:48,51`, `raindex.ts:26`, and `accessCodes.ts:11` with environment variables; rotate the committed key on deploy. Coordinate with OBS-04 instrumentation that already labels `'alchemy-base-mainnet'` as the rpc_url at `accessCodes.ts:92,103,113`.

2. **SEC-02 — Session/CSRF secret fail-closed.** Remove the `'st0x-session-secret-2024'` fallback at `auth.ts:9` and the `'default-csrf-secret-change-in-production'` fallback at `csrf.ts:10`. Throw at module load in production when the env var is missing, mirroring the `CRON_SECRET` pattern from `src/routes/api/cron/snapshots/+server.ts:45`.

3. **SEC-03 — Server-issued session cookie.** Issue an HttpOnly + Secure + SameSite=Strict session cookie tied to a verified wallet signature, extending the `signatureChallenge.ts` flow with a new `'session_login'` purpose. Downgrade the existing client-set `wallet-address` cookie at `+layout.svelte:75` to a non-authoritative hint.

4. **SEC-04 — CSRF bound to session.** Bind CSRF tokens to the session cookie via the double-submit-cookie pattern (server-issued session-id, validated on each CSRF-protected call) instead of the current stateless tokens issued by the public `/api/auth/csrf` endpoint.

5. **SEC-05 — `crypto.randomBytes` for codes.** Replace `Math.random()` at `accessCodes.ts:50` and `referrals.ts:67` with `crypto.randomBytes()` rejection-sampled into the existing alphabet. Same pattern that `signatureChallenge.ts:58-60` already uses.

6. **SEC-06 — Snapshot endpoint rate limit + admin gate.** Apply `applyTieredRateLimit` at the heaviest existing tier to `/api/snapshots/preview` and `/api/snapshots/preview-stream`; gate `POST /api/snapshots/generate` behind `requireAdmin`.

7. **SEC-07 — hCaptcha fail-closed on Vercel preview.** Replace the `process.env.NODE_ENV === 'production'` gate at `accessCodes.ts:88-114` with logic that fails closed whenever `HCAPTCHA_SECRET` is missing on a Vercel preview deploy, not only on production.

8. **REL-01 — RPC retry + kill silent latestBlock fallback.** Add per-RPC retry with backoff in `generator.ts:19-35` (`callRpc`); treat empty `result` fields as failure; remove the silent `latestBlock` fallback in `getBlockNumberForTimestamp` so cron snapshots stop using the wrong block on bad days.

9. **REL-02 — EIP-1271/6492 verification on the fallback chain.** Replace the single-Alchemy-RPC dependency at `accessCodes.ts:8-11,64-85` with the same fallback-chain-with-retry pattern REL-01 builds. SEC-01 is a prerequisite (env var must exist before the chain can read from it).

10. **REL-03 — Vendor the Rain strategies registry.** Replace the runtime GitHub-raw fetch at `orderDeployment.ts:55-91` (`RAIN_STRATEGIES_COMMIT = '9dd64902161158395d588335f0a02e3a6d52f772'`) so order deployment no longer depends on GitHub raw availability or rate limits.

This phase **does not** add hooks.server.ts integration tests (TEST-01, Phase 4), **does not** add admin audit-log coverage (TEST-02, Phase 4), **does not** add the marketOrderExecution.ts integration suite (TEST-03, Phase 4), **does not** rewrite CLAUDE.md (DRIFT-03, Phase 4), and **does not** consolidate token lookups (DRIFT-01/02, Phase 4). Several of those Phase 4 items will exercise surfaces Phase 3 hardens — Phase 3 ships hardened code; Phase 4 pins it with tests.

</domain>

<decisions>
## Implementation Decisions

### Phase-Internal Sequencing (the discussed area)

- **D-01: Wave shape — quick-wins first, then RPC chain, then auth, then registry.** Nine waves, ordered to land independent quick wins before higher-risk surfaces:

  | Wave | REQ | Surface | Rationale |
  |---|---|---|---|
  | 1 | SEC-01 | networks.ts:48,51 + raindex.ts:26 + accessCodes.ts:11 → env vars | Blocks REL-02 (shares accessCodes.ts file); SEC-01 also gives REL-02 the env var to read from |
  | 2 (parallel) | SEC-02 | auth.ts:9 + csrf.ts:10 fail-closed at module load | Independent quick win |
  | 2 (parallel) | SEC-05 | accessCodes.ts:50 + referrals.ts:67 → crypto.randomBytes | Independent quick win |
  | 2 (parallel) | SEC-07 | accessCodes.ts hCaptcha env-detection | Independent quick win |
  | 3 | SEC-06 | snapshot endpoints rate-limit + admin gate | Independent |
  | 4 | REL-01 | generator.ts callRpc retry+backoff; kill silent latestBlock | Pattern feeds REL-02 |
  | 5 | REL-02 | accessCodes.ts verifyWalletSignature → fallback chain | Depends on REL-01 pattern + SEC-01 env vars |
  | 6 (paired) | SEC-03 + SEC-04 | server-issued session cookie + CSRF binding | Highest user-impact; ship together per ROADMAP coupling note |
  | 7 | REL-03 | Rain strategies registry vendoring | Independent |

  Wave 2 collapses three trivially-independent quick wins. Wave parallelism is structural (file conflicts) — runtime parallelism within a wave is the planner's call. SEC-03+SEC-04 stay paired in Wave 6 because the CSRF double-submit-cookie pattern depends on the session cookie existing, and shipping them apart would leave an intermediate state where CSRF is bound to nothing.

- **D-01a: Atomic-commits-with-svelte-check-green discipline carries forward from Phase 1 and Phase 2.** Each plan in this phase ships with the same atomicity contract Phase 2 enforced: every commit leaves svelte-check at the established baseline (3 errors after Phase 2 close), every commit passes the test suite, no mid-flight broken states unless explicitly justified per Phase 2 patterns 02-04..02-06. Cross-cutting gates from Phase 2 must continue to hold: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance (`marketOrderExecution.ts` does not import from `$lib/stores/transaction`), `failWith()` count ≥ 12 in marketOrderExecution.ts (OBS-03 transcript discipline), `EMERGENCY_RATIO_MULTIPLIER` count = 0, staleTime: Infinity preserved.

### SEC-01 — Env Var Split

- **D-02: Single Alchemy key on both sides.** `PUBLIC_BASE_RPC_URL` (client-bundled, exposed) and `BASE_RPC_URL` (server-only) resolve to the **same Alchemy app and key**. Rationale: the client key is exposed in the bundle either way (CONCERNS.md Tech Debt entry 3 — "Anyone with read access to the repo (or the production JS bundle) can drain the Alchemy quota"); splitting into two Alchemy apps doubles operational surface for marginal blast-radius reduction; using public RPCs only on the client (option C) inherits the documented flakiness from CONCERNS.md ("RPCs rotated multiple times — `db2814b`, `da96e99`, `43e8f70`") which would regress UX on the only page that matters (real users on real money — `.planning/PROJECT.md`).

- **D-02a: Key rotation discipline.** The committed key `y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9` is rotated as part of the SEC-01 deploy:
  1. Provision a new Alchemy app + key.
  2. Set both `PUBLIC_BASE_RPC_URL` and `BASE_RPC_URL` in Vercel project env (production + preview) to the new URL with the new key.
  3. Deploy the SEC-01 code change (env-var-using). Old hardcoded key keeps working until cutover; no race.
  4. Verify the new key is being used on both client and server by inspecting Vercel Logs (OBS-04 `recordRpcAttempt` lines should show `rpc_url` matching the new URL pattern; client-side network tab should show requests to the new URL on the trade page).
  5. Rotate the old key in the Alchemy dashboard (revoke).
  6. Update OBS-04's `'alchemy-base-mainnet'` rpc_url label at `accessCodes.ts:92,103,113` if the new env var canonical name diverges from the existing label, or document why the label stays as-is for log-stability.

- **D-02b: Module-load behavior.** SEC-02 fail-closed pattern applies to the SEC-01 env vars too: missing `PUBLIC_BASE_RPC_URL` or `BASE_RPC_URL` in production must throw at module load (mirror `src/routes/api/cron/snapshots/+server.ts:45`). Dev mode tolerates missing vars — uses an in-tree placeholder URL or the public fallback chain — so contributors can run the app without provisioning their own Alchemy app.

### SEC-06 — Admin Gate + Rate Limit Tier

- **D-03: `requireAdmin` for POST /api/snapshots/generate; heaviest tier for preview.**
  - `POST /api/snapshots/generate`: gate behind `requireAdmin` only. The Vercel cron at `src/routes/api/cron/snapshots/+server.ts` is a separate path and uses `CRON_SECRET` directly — researcher confirms during planning that the cron does NOT also POST to `/api/snapshots/generate`. If that confirmation fails, fall back to `requireAdmin` + `CRON_SECRET` escape hatch (SEC-06 Option B from discussion).
  - `/api/snapshots/preview` + `/api/snapshots/preview-stream`: wrap with `applyTieredRateLimit` at the heaviest existing tier — these endpoints take 10–60s wall time per request (CONCERNS.md known-bug entry "preview runs full snapshot recalc with no rate limit"). The tier choice matches actual server cost; researcher reads `src/lib/server/rateLimit.ts` to pick the named tier and confirm Redis backing.

### SEC-03 + SEC-04 — Auth Rollout

- **D-04: Atomic flip — single PR, one-time re-sign on next visit.** SEC-03 + SEC-04 ship in a single coupled PR (or tightly-sequenced PR pair if researcher splits introduce-vs-flip for review tractability — but no grace window). Existing wallet-address cookie consumers (`/api/access/check`, `+layout.svelte:75` set, `hooks.server.ts:248-258` read, `admin/referrals/+page.svelte`, `routes/access/+page.server.ts`) are migrated to read from the new session cookie in the same PR. The wallet-address cookie is downgraded to a non-authoritative hint for personalization/rate-limiting only; it is not used as proof of ownership in any surviving endpoint. Existing logged-in users get a one-time wallet signature prompt on their next visit to mint a session cookie; that prompt happens once per session, never per request. Rationale: cleanest bisect line, no deferred-window cleanup PR needed, smaller temporary code surface than grace-window or shadow-mode options. Real-money guard: the SEC-03+04 wave includes a manual smoke test in the wave's VALIDATION (login → trade → re-load page → trade again → log out → log back in) before deploying to production.

- **D-04a: 30-day sliding session lifetime.** The session cookie has a 30-day absolute expiry that is **refreshed on activity** (sliding window). An active trader who visits more than once a month never re-signs. The 30-day ceiling caps the stolen-cookie abuse window; the sliding refresh prevents the "I came back next morning and had to sign again" UX failure that would push users away. Re-sign is required only on (a) 30+ days of inactivity, (b) explicit logout (new endpoint), (c) admin invalidation of the session-id KV record, (d) cookie clear / device change. Existing `auth.ts:4` `SESSION_DURATION_MS = 24h` is for the basic-auth flow and is unchanged — the new wallet session cookie is a separate constant.

- **D-04b: User-experience constraint (carried verbatim from discussion).** Once a user signs in to mint a session cookie, the cookie is what authenticates every subsequent request — the wallet signature is never re-prompted per request. This is a hard UX requirement; any implementation that requires a per-request wallet signature is a regression and is rejected. The double-submit-cookie CSRF pattern (SEC-04) does NOT require re-signing — it validates a session-id-bound CSRF token per request, which is an HTTP-level check, not a wallet-level one.

### Claude's Discretion

These were not user-locked and are open for the researcher/planner to decide:

- **REL-01 retry shape.** Backoff strategy (exponential w/ jitter, fixed-interval, or reuse the existing `withRetry` helper from `src/lib/utils/withRetry.ts` that Phase 1 references). Max attempts per RPC. Time budget against the cron's `maxDuration: 800` ceiling. What replaces the silent `latestBlock` fallback in `getBlockNumberForTimestamp` — throw, alert via the existing `notifyChainExhausted` Telegram delivery, or partial-result with explicit user-visible flag. Researcher/planner picks based on (a) cron time-budget arithmetic, (b) what consumers of `getBlockNumberForTimestamp` actually do with the result, (c) consistency with the existing chain-exhausted alert pattern from Plan 01-06.

- **REL-02 reuse pattern.** REL-02 inherits whatever shape REL-01 lands. Specifically: replace the single `basePublicClient` at `accessCodes.ts:8-11` with a viem `Transport` that iterates the same `RPC_URLS` list `generator.ts` uses, with the same retry + empty-result handling. The OBS-04 fan-out at `accessCodes.ts:92,103,113` continues to record per-attempt with the real RPC URL (not the synthetic `'alchemy-base-mainnet'` label) once SEC-01 and REL-02 land — researcher updates the label or replaces it with the actual `rpc_url` value at instrumentation time.

- **REL-03 vendor strategy.** `/static/registry/` (file-system served by Vercel — refresh via `git pull` of upstream rain.strategies into the static dir + commit) vs compiled-into-bundle (npm dep on a separately-published rain.strategies package, git submodule, or inline JSON). Researcher reads `orderDeployment.ts:54-91` to understand the registry shape (`DotrainRegistry.new(REGISTRY_URL)`), then picks based on (a) refresh cadence — how often does the team need to bump the pinned commit?, (b) bundle size impact, (c) ability to ship registry updates without a full app redeploy. The pinned commit `9dd64902161158395d588335f0a02e3a6d52f772` is the Phase 3 starting hash; the vendor mechanism must support upgrading to a new hash without breaking running production.

- **SEC-03+04 storage backend.** The session-id → wallet record almost certainly belongs in **Vercel KV** because `signatureChallenge.ts` already uses `getKv()` for the `access_register` / `referral_join` challenge nonces, and the session cookie is a natural extension of that pattern. Researcher confirms KV write/read latency is acceptable on the auth path (every authenticated request reads the session record), or picks an in-memory hot path with KV as the durable store if latency is a concern. Existing `signatureChallenge.ts:5` `MAX_IN_MEMORY_CHALLENGES = 5000` is the precedent for in-memory caps.

- **SEC-03+04 logout endpoint.** D-04a implies a logout endpoint exists (one of the four conditions for re-sign). Researcher decides the path (`/api/auth/logout`?), method (POST), and behavior (delete the session-id KV record + clear the session cookie + return 204). Out of scope for D-04 mechanics but an implementation detail the planner needs to specify.

- **SEC-05 alphabet + length preservation.** Existing access-code format `ST0X-XXXX-XXXX` (8 picks from a 32-char alphabet, ~40 bits) and referral-code format `st0x-ref-xxxxxx` are preserved unchanged — SEC-05 is purely the `Math.random` → `crypto.randomBytes` swap. Researcher reads `accessCodes.ts:46-51` and `referrals.ts:63-70` to confirm exact alphabet + length, then implements rejection sampling (the standard pattern for unbiased mapping of random bytes onto an arbitrary alphabet).

- **SEC-07 env detection.** Replacement for `process.env.NODE_ENV === 'production'`: probably `env.VERCEL_ENV !== 'development' && !env.HCAPTCHA_SECRET → throw`, but researcher reads the Vercel env-var docs at planning time to pick the canonical detection signal. The user-visible behavior is unchanged on production (still fails closed); the change is that preview deploys without an `HCAPTCHA_SECRET` env var also fail closed instead of bypassing the check.

- **SEC-02 throw site.** Researcher decides whether the missing-env throw lives in the existing `auth.ts` and `csrf.ts` modules at top level (simplest — fails on first import) or in a shared `assertRequiredSecrets()` helper called from `hooks.server.ts` (centralizes the check). The `CRON_SECRET` precedent at `src/routes/api/cron/snapshots/+server.ts:45` is module-local; researcher matches that pattern unless there's a reason to centralize.

- **Telegram alert wiring.** OBS-04 from Phase 1 D-17 already provisioned `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`. Phase 3 reuses the same `notifyChainExhausted` from `src/lib/server/alerts.ts` — REL-01 chain-exhaustion alerts go through that surface unchanged.

- **Phase-exit wave + RUNBOOK.** Researcher/planner adds a Wave 8 / 03-08 phase-exit plan analogous to 02-08 + 01-08: phase-exit verification grep gates (Alchemy key absence in src/, `Math.random` absence in `accessCodes.ts` + `referrals.ts`, fallback-secret-string absence in `auth.ts` + `csrf.ts`, `RAIN_STRATEGIES_COMMIT` absence in `orderDeployment.ts`, etc.) plus 03-RUNBOOK.md documenting the env-var deploy checklist + Alchemy rotation steps + a smoke-test recipe for the new session cookie flow.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Planning

- `.planning/ROADMAP.md` §"Phase 3: Production-Grade Hardening" — phase goal, 5 success criteria, `Depends on: Phase 2`, `Requirements: SEC-01..07, REL-01..03`. Notes: SEC-03+SEC-04 are coupled and should ship together; SEC-01+SEC-02 are independent quick wins; REL-01+REL-02 share the fallback-RPC-with-retry pattern; SEC-06 only matters because Phase 1 DEPR-02 retained the snapshot pipeline.
- `.planning/REQUIREMENTS.md` §"Security" + §"Reliability" — full text of the 10 phase REQ-IDs (SEC-01..07, REL-01..03). Researcher and planner must address every REQ-ID; checker enforces coverage.
- `.planning/PROJECT.md` — milestone constraints. Especially: single chain Base 8453, real-money users (no everything-breaks-for-a-day migrations), solo / 1-2 dev team, observability stack starts from zero (now built in Phase 1, must not regress), outcome-based done. Out of Scope section confirms multi-chain + AA + Onramper replacement + admin refactor + new features stay deferred.
- `.planning/STATE.md` — current position. Phase 2 closed 2026-04-29 (8/8 plans, 5/5 REQ-IDs). All cross-cutting gates green going into Phase 3.

### Phase 1 Artifacts (carry-forward)

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-CONTEXT.md` — Phase 1 decisions. Especially:
  - **D-01:** Snapshot pipeline retained — SEC-06 + REL-01 + TEST-04 apply against the retained subsystem.
  - **D-13:** Out-of-scope guardrails carry forward unchanged — no AA, no multi-chain, no `+error.svelte`, no admin/+page.svelte refactor, no replacement on-ramp, no external log drain, no new auth method beyond wagmi + Dynamic.
  - **D-14:** Referrals retained — SEC-05 hardens both `accessCodes.ts:50` and `referrals.ts:67`.
  - **D-15:** OBS-03 dual-sink (Sentry + console.error JSON line on browser tier) is the contract Phase 3 must continue to satisfy when adding new failure paths.
  - **D-17:** Telegram bot replaces Slack for chain-exhausted alerts. `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` env vars. REL-01's chain-exhausted alerting reuses this surface unchanged.
- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — Phase 1 operational runbook. Documents the existing Sentry + pino + Vercel Speed Insights observability surface that Phase 3 inherits.
- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/deferred-items.md` — open Phase 1 deferred items (cache.ts:48-53 stale-comment block was the only one carried forward; Phase 3 may close opportunistically if SEC-06 touches `src/lib/server/cache.ts`).

### Phase 2 Artifacts (carry-forward)

- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-CONTEXT.md` — Phase 2 decisions. Especially the cross-cutting gates that must survive Phase 3 unchanged: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance (`grep "from '\$lib/stores/transaction'" src/lib/services/marketOrderExecution.ts` returns 0), `failWith()` count ≥ 12 (OBS-03 transcript discipline), `EMERGENCY_RATIO_MULTIPLIER` count = 0, staleTime: Infinity preserved per CLAUDE.md ground truth.
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-RUNBOOK.md` — Phase 2 RUNBOOK. Top-3 bundle offenders identified for future Phase 3 PERF-style work (none in scope here, but for context).
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-PATTERNS.md` — Phase 2 plan patterns. The atomic-commits-with-svelte-check-green discipline + façade preservation pattern carries forward as Phase 3's plan-shape default.

### Codebase Audit (the source-of-truth for what Phase 3 fixes)

- `.planning/codebase/CONCERNS.md` — full audit. Direct mappings to Phase 3 REQ-IDs:
  - Tech Debt §"Hardcoded Alchemy API key checked into source" → SEC-01 (lines: `raindex.ts:26`, `networks.ts:48,51`, `accessCodes.ts:10`).
  - Tech Debt §"Default fallback secrets in auth and CSRF" → SEC-02 (lines: `auth.ts:9` `'st0x-session-secret-2024'`, `csrf.ts:10` `'default-csrf-secret-change-in-production'`).
  - Security Considerations §"`wallet-address` cookie is client-set and unverified" → SEC-03 (sites: `+layout.svelte:65-80` set, `hooks.server.ts:248-258` read).
  - Security Considerations §"Stateless CSRF tokens issued by public unauthenticated endpoint" → SEC-04 (sites: `csrf.ts:17-28` token gen, `routes/api/auth/csrf/+server.ts:9-13` public issuance, `hooks.server.ts:219` public path).
  - Known Bugs §"Math.random() used to mint access codes and referral codes" → SEC-05 (lines: `accessCodes.ts:49`, `referrals.ts:67`).
  - Known Bugs §"`/api/snapshots/preview` runs full snapshot recalc with no rate limit" → SEC-06 (sites: `routes/api/snapshots/preview/+server.ts:13-143`, `routes/api/snapshots/preview-stream/+server.ts:11-`, `routes/api/snapshots/generate/+server.ts:11-62`).
  - Security Considerations §"HCAPTCHA bypass in non-production environments" → SEC-07 (lines: `accessCodes.ts:88-114`).
  - Fragile Areas §"RPC fallback chain in `generator.ts` — fail-silent on all RPCs failing" → REL-01 (lines: `generator.ts:19-35` callRpc, line 61 silent `latestBlock` fallback).
  - Security Considerations §"EIP-1271 / EIP-6492 signature verification on a single Alchemy RPC" → REL-02 (lines: `accessCodes.ts:8-11,64-85`).
  - Fragile Areas §"Order deployment registry pinned to a git commit, fetched at runtime" → REL-03 (lines: `orderDeployment.ts:54-91`, `RAIN_STRATEGIES_COMMIT = '9dd64902161158395d588335f0a02e3a6d52f772'`).
- `.planning/codebase/ARCHITECTURE.md` — system architecture; confirms hooks layering and CSP/auth flow.
- `.planning/codebase/STACK.md` — tech stack; pin viem `Transport` choice and KV wiring to Svelte 4 + SvelteKit 2.
- `.planning/codebase/CONVENTIONS.md` — coding conventions. Honor when introducing the new session-cookie module (`src/lib/server/walletSession.ts`?) and the vendored registry path.
- `.planning/codebase/STRUCTURE.md` — directory layout; use to pick file placement for new modules.
- `.planning/codebase/INTEGRATIONS.md` — observability integration points. Phase 3 reuses `notifyChainExhausted` (Plan 01-06) for REL-01 chain-exhausted alerts; reuses `recordRpcAttempt` for REL-02 OBS-04 fan-out.
- `.planning/codebase/TESTING.md` — testing conventions. Phase 3 ships hardened code; Phase 4 TEST-* pins it.

### Project Guidance (with drift warning)

- `CLAUDE.md` — project instructions for AI agents. **Drift warning preserved from Phases 1 + 2:** aspirationally describes multi-chain (Base/Arbitrum/Optimism/Ethereum) and account abstraction (Rhinestone SDK / EIP-7702 / `account-abstraction/` directory). **None of those exist in code.** DRIFT-03 in Phase 4 fixes this. Researcher/planner: treat single-chain (Base 8453) + two auth paths (wagmi direct + Dynamic embedded) as the only ground truth; ignore CLAUDE.md sections that conflict with `.planning/codebase/`. The `## Order Semantics — INPUT/OUTPUT Perspective (Critical)` section of CLAUDE.md is accurate and is the prose statement of the bug class TRADE-01 locked down — supplementary to `src/lib/types/orderPerspective.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/lib/server/signatureChallenge.ts`** — already implements verified-wallet-signature challenge nonces backed by Vercel KV (`getKv()`, atomic GET+DEL Lua script, 5-minute TTL). Existing purposes: `'access_register'`, `'referral_join'`, `'referral_update_nickname'`. SEC-03 extends this with a new `'session_login'` purpose: user signs a server-issued nonce → server creates a session-id KV record bound to the verified wallet → returns the session-id cookie. The `crypto.randomBytes(16).toString('hex')` pattern at line 58-60 is the proven precedent for SEC-05's CSPRNG-backed code generation.

- **`src/lib/server/kv.ts`** — `getKv()`, `kvGet`, `kvSet`, `kvDel`, `KV_KEYS` namespace. Existing pattern for KV-backed server state. SEC-03's session-id → wallet records use this surface; researcher picks a `KV_KEYS.walletSession(sessionId)` slot.

- **`src/lib/utils/withRetry.ts`** — existing retry helper (referenced in Phase 1 codebase audit). REL-01's per-RPC retry can compose with this or define a parallel helper for backoff with empty-result handling. Researcher confirms exact API at planning time.

- **`src/lib/server/rpcMetrics.ts`** — Plan 01-06 introduced `recordRpcAttempt({ rpc_url, fn, ok, status_or_error, duration_ms })` and `reportChainExhausted({ fn, attempts, request_id })`. REL-01 wraps each retry attempt with `recordRpcAttempt`; chain exhaustion (every RPC × every retry failed) fires `reportChainExhausted`. REL-02 fan-out at `accessCodes.ts:92,103,113` continues to use the same surface — but the `'alchemy-base-mainnet'` synthetic label gets replaced with the real `rpc_url` value once REL-02 lands (researcher updates or removes the label).

- **`src/lib/server/alerts.ts`** — Plan 01-06 + Plan-1-D-17 introduced Telegram bot delivery (`OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`). REL-01 chain-exhaustion alerts ship through this unchanged.

- **`src/lib/server/rateLimit.ts`** — `applyTieredRateLimit` exists (referenced in CONCERNS.md SEC-06 fix approach: `applyTieredRateLimit(request, 'snapshots-preview', ...)`). SEC-06 reuses this; researcher reads the file at planning time to pick the named tier.

- **`src/lib/server/auth.ts`** — basic-auth flow (`createSessionToken` / `verifySessionToken` at line 6-15+), 24-hour `SESSION_DURATION_MS`. SEC-02 hardens the `SESSION_SECRET` fallback at line 9 (used here AND in csrf.ts:10). The wallet session cookie is a SEPARATE, NEW module — researcher picks the file path (likely `src/lib/server/walletSession.ts`); SEC-03's 30-day sliding session does not modify the existing 24h basic-auth flow.

- **`src/lib/server/csrf.ts`** — current CSRF token generation. SEC-02 hardens the secret fallback at line 10; SEC-04 binds the token to a session-id (double-submit-cookie pattern) — researcher decides whether to extend `csrf.ts` in place or rewrite for the new shape.

- **`src/lib/server/auditLog.ts`** — `createAuditLogger` exists; Phase 4 TEST-02 fans it out to all admin endpoints. Phase 3 should not regress audit-log calls when refactoring auth surfaces.

- **`src/routes/api/cron/snapshots/+server.ts:45`** — the `CRON_SECRET` fail-closed pattern. SEC-02's `auth.ts` + `csrf.ts` throws mirror this: `if (!dev && !env.X) throw new Error(...)`.

### Established Patterns

- **`src/hooks.server.ts`** auth flow at lines 152-469 — bot-rejection / OPTIONS / public path / admin / wallet-registration classification. SEC-03 modifies the wallet-registration check at line 425 area to read from the new session cookie instead of the spoofable wallet-address cookie. SEC-04 adds session-id-bound CSRF validation. The CSP `connect-src` block at lines 152-173 needs no changes (no new external hosts); SEC-03+04 are server-side-only.

- **`viem` `createPublicClient` + `http` Transport** — current single-RPC pattern at `accessCodes.ts:9-12`. REL-02 swaps the single `http(URL)` call for either (a) viem's `fallback([...])` Transport with a list of `http(URL)` per RPC + retry config, or (b) a custom Transport that delegates to the same `RPC_URLS` list `generator.ts` uses, depending on what REL-01's retry shape settles on. Researcher picks at planning time.

- **`signatureChallenge.ts` purpose enum + `KV_KEYS` slots** — extending the enum is the standard way to add new signature flows. SEC-03's `'session_login'` follows this pattern.

- **OBS-03 `failWith()` seam** at `marketOrderExecution.ts` — Phase 3 does NOT introduce new failure paths in the take-order critical path (none of the SEC-01..07 / REL-01..03 work touches that file). The cross-cutting `failWith()` count grep gate ≥ 12 must hold at Phase 3 close — verified in the phase-exit wave.

- **Vercel Logs as the single source for server log search** — Phase 1 D-07 picked Vercel Logs only for v1; no external drain. Phase 3's REL-01 `recordRpcAttempt` lines + chain-exhausted alerts continue to flow through Vercel Logs unchanged.

### Integration Points

- **SEC-01 env vars site:** `src/lib/config/networks.ts:48,51` (client + server-side networks config), `src/lib/clients/raindex.ts:26` (client-side Raindex), `src/lib/server/accessCodes.ts:11` (server-side viem client). The trade-page bundle imports `networks.ts` at build time, so `PUBLIC_BASE_RPC_URL` must be a `PUBLIC_*` env var (exposed in the bundle by SvelteKit's `$env/static/public` or `$env/dynamic/public`). Server-side `BASE_RPC_URL` uses `$env/dynamic/private`.

- **SEC-02 throw site:** `src/lib/server/auth.ts:9` (top-level `SESSION_SECRET` read) and `src/lib/server/csrf.ts:10` (top-level `CSRF_SECRET` read). The `if (!dev && !env.X) throw ...` pattern at module top runs once on cold start; missing env in production crashes the lambda boot, surfacing in Vercel Logs immediately rather than at first request.

- **SEC-03 session cookie wire-up:**
  - **Issue site:** new `/api/auth/session/+server.ts` (or extend the existing `signatureChallenge.ts` flow with a `'session_login'` purpose). User POSTs (signature, address, nonce) → server verifies signature → server creates session-id KV record → server sets HttpOnly + Secure + SameSite=Strict cookie.
  - **Read site:** `src/hooks.server.ts:248-258` (currently reads wallet-address cookie). Replace with session-id cookie read → KV lookup → `event.locals.walletAddress` set from the verified record.
  - **Logout site:** new `/api/auth/logout/+server.ts`. Deletes session-id KV record + clears cookie.
  - **Sliding refresh site:** at the start of every authenticated request handler (or in a SvelteKit middleware), if the session record is more than N hours old, refresh its TTL.

- **SEC-04 CSRF binding site:**
  - **Issue site:** `/api/auth/csrf/+server.ts` — current public-path issuance. Modify to require a session-id cookie before issuing a token; the issued token is bound to the session-id (HMAC the session-id with `CSRF_SECRET`).
  - **Validate site:** `src/lib/server/csrf.ts` — modify `verifyToken` to require both the request CSRF header AND a matching session-id cookie; the token's HMAC is recomputed against the request's session-id and compared.

- **SEC-05 swap site:** `src/lib/server/accessCodes.ts:50` (replace `Math.floor(Math.random() * chars.length)` with `crypto.randomBytes(1)[0] % chars.length` or proper rejection-sampled bytes), `src/lib/server/referrals.ts:67` (same swap). `import crypto from 'crypto'` already present in both files (or trivially added).

- **SEC-06 wrap site:** `src/routes/api/snapshots/preview/+server.ts` + `src/routes/api/snapshots/preview-stream/+server.ts` — wrap the GET handlers with `applyTieredRateLimit`. `src/routes/api/snapshots/generate/+server.ts` POST — wrap with `requireAdmin`. Researcher confirms the cron call shape during planning to choose between Option A (admin only) and Option B (admin + CRON_SECRET escape).

- **SEC-07 swap site:** `src/lib/server/accessCodes.ts:88-114` — swap the `process.env.NODE_ENV === 'production'` gate for env-detection that fails closed on `VERCEL_ENV !== 'development'` (or whatever Vercel canonical signal turns out to be).

- **REL-01 retry site:** `src/lib/server/snapshots/generator.ts:19-35` (`callRpc`). Add per-RPC retry with backoff. Treat empty `result` as failure (current code at the `if (data.result)` check already short-circuits empty as a per-RPC failure — but the same logic upstream in `getBlockNumberForTimestamp` silently uses `latestBlock` when the chain exhausts; that's the additional fix). Cross-cutting: Phase 1 OBS-04 instrumentation must continue to fire — every retry attempt records via `recordRpcAttempt`; chain exhaustion fires `reportChainExhausted`.

- **REL-02 retry site:** `src/lib/server/accessCodes.ts:8-11` (replace `basePublicClient` definition with a fallback-chain-backed Transport) and `:64-85` (`verifyWalletSignature` body). The OBS-04 fan-out at lines 92, 103, 113 continues to fire per-attempt; the synthetic `'alchemy-base-mainnet'` label is replaced with the real `rpc_url` value once REL-02 lands, OR the label is preserved for log-search-stability — researcher picks.

- **REL-03 vendor site:** `src/lib/services/orderDeployment.ts:54-91` (`RAIN_STRATEGIES_COMMIT`, `REGISTRY_URL`, `getDotrainRegistry`). Replace the runtime `DotrainRegistry.new(REGISTRY_URL)` with a same-origin fetch (`/registry/`) backed by `static/registry/` files OR an in-bundle import. Existing `static/` directory has `apple-touch-icon-precomposed.png`, `assets/`, `docs/`, `favicon.ico`, etc. — adding `static/registry/` is a clean addition.

- **Phase-exit wave:** new plan `03-08-PLAN.md` (or whatever count the planner picks) — phase-exit verification. Greps + RUNBOOK in the same shape as Plan 02-08:
  - `grep -r "y3BXawVv5uuP" src/` returns 0 hits (SEC-01 evidence).
  - `grep -E "Math\.random\(\)" src/lib/server/{accessCodes,referrals}.ts` returns 0 hits (SEC-05 evidence).
  - `grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/{auth,csrf}.ts` returns 0 hits (SEC-02 evidence).
  - `grep -E "RAIN_STRATEGIES_COMMIT|raw\.githubusercontent\.com.*rain\.strategies" src/lib/services/orderDeployment.ts` returns 0 hits (REL-03 evidence).
  - Cross-cutting Phase 2 gates re-verified: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, `failWith()` count ≥ 12, `EMERGENCY_RATIO_MULTIPLIER` count = 0, svelte-check baseline = 3.
  - 03-RUNBOOK.md: env-var deploy checklist, Alchemy rotation steps, session-cookie smoke recipe, registry vendor-bump procedure.

</code_context>

<specifics>
## Specific Ideas

- **Single-key both-sides.** Per CONCERNS.md "Anyone with read access to the repo (or the production JS bundle) can drain the Alchemy quota," the client key is exposed regardless. The decision to use the same key on both sides is an explicit acceptance of that residual risk in exchange for operational simplicity (one Alchemy app to manage, one rotation event). Future hardening can split keys if the leak surface becomes a measurable problem (Alchemy quota abuse logs would be the trigger signal).

- **30-day sliding session as a UX guarantee.** The user's discussion-time guidance: "as long as it doesn't require the user to do a wallet signature every time" — captured as D-04b. A short-lived absolute-expiry session (e.g., 24h non-sliding) was rejected because returning users would re-sign every morning, which is a regression of the current `wallet-address`-cookie UX (the cookie persists across sessions until cleared). 30-day sliding gives the same "set it and forget it" feel for active users while capping the stolen-cookie window.

- **Atomic flip over grace window for SEC-03+04.** Cleanest bisect line, no deferred-cleanup PR, no two-cookie code path to maintain. The one-time re-sign at deploy is a single signature prompt, not a recurring burden — Web3 users are accustomed to this exact pattern from every dApp they use.

- **Wave parallelism is structural (file conflicts), not runtime.** Wave 2 collapses SEC-02, SEC-05, SEC-07 because they touch different files; the planner can ship them in three sequential atomic commits within a single plan, or three plans in one wave — implementation detail. Wave 6 (SEC-03 + SEC-04) is a single coupled plan because the CSRF binding requires the session cookie to exist.

- **Cross-cutting gate carry-forward.** Every cross-cutting gate Phase 2 enforced must hold at Phase 3 close — TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, `failWith()` count ≥ 12, `EMERGENCY_RATIO_MULTIPLIER` count = 0, svelte-check baseline = 3, staleTime: Infinity preserved. The Phase 3 phase-exit wave re-verifies these mechanically. Any plan that touches a file with a Phase 2 gate (especially `marketOrderExecution.ts`, `transaction.ts`, `orderPerspective.ts` — none of which are in Phase 3 scope, but defensive belt-and-braces) must keep the gate green.

- **Real-money rollout discipline carries forward from Phase 2.** Atomic commits + svelte-check green at every commit + manual smoke test gates for high-risk waves (SEC-03+04 specifically — login → trade → reload → trade → log out → log in → trade). No feature flags / no SaaS feature-flag dep — env-var or deploy boundary is the rollout knob. No everything-breaks-for-a-day migrations.

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost. None block Phase 3; some are explicitly handled by later phases.

- **REL-01 retry shape (backoff strategy, max attempts, latestBlock-fallback replacement).** Captured as Claude's discretion above. Researcher picks based on cron time-budget arithmetic + consumer behavior.

- **REL-03 vendor strategy (static asset vs compiled-in vs npm dep).** Captured as Claude's discretion above. Researcher picks based on refresh cadence + bundle size + ability to bump without redeploy.

- **SEC-03+04 storage backend (Vercel KV vs in-memory hot path with KV durable store).** Captured as Claude's discretion above. KV is the obvious starting choice given `signatureChallenge.ts` precedent.

- **SEC-03 logout endpoint shape.** Captured as Claude's discretion. Implementation detail.

- **SEC-05 alphabet/length preservation.** Existing formats (`ST0X-XXXX-XXXX`, `st0x-ref-xxxxxx`) preserved — purely the `Math.random` → `crypto.randomBytes` swap. Widening entropy or changing format is out of scope.

- **SEC-07 env detection signal.** Researcher picks the canonical Vercel signal (`VERCEL_ENV` vs other) at planning time.

- **Split Alchemy keys / public-RPC-only-on-client.** Rejected during discussion in favor of single-key both-sides simplicity. Revisit if Alchemy quota abuse becomes measurable.

- **Grace window or shadow rollout for SEC-03+04.** Rejected during discussion in favor of atomic flip. Revisit only if atomic flip surfaces unexpected re-sign UX issues during Wave 6 manual smoke test.

- **SEC-03+04 wallet-address cookie permanent removal (vs downgrade to non-authoritative hint).** Phase 3 ships the downgrade — wallet-address remains as a personalization/rate-limit hint. Permanent removal is a future cleanup once it can be confirmed that no surviving consumer reads it (Phase 4 TEST-01 hooks.server.ts integration tests are the natural place to verify).

- **Session expiry sliding-refresh frequency tuning.** D-04a says "refresh on activity"; the exact refresh threshold (every request? every N hours? once-a-day?) is the planner's call. KV write cost vs UX coverage trade-off.

- **External log drain (Better Stack / Axiom / Datadog).** Still deferred per Phase 1 — Vercel Logs only for v1.

- **`+error.svelte` user-visible error page.** Still deferred per Phase 1 D-12 / `01-UI-SPEC.md` Q3.

- **DRIFT-03 (CLAUDE.md rewrite to single-chain reality).** Phase 4. Phase 3 honors the existing drift-warning by treating `.planning/codebase/` as ground truth.

- **DRIFT-01 / DRIFT-02 (token-lookup cleanups).** Phase 4 — separate from any Phase 3 work even though several files Phase 3 touches (admin, snapshots) may also have DRIFT-* concerns.

- **TEST-01 hooks.server.ts integration tests.** Phase 4 — pins the SEC-03+04 surface Phase 3 ships.

- **TEST-02 admin audit-log coverage fan-out.** Phase 4 — the `requireAdmin`-gated POST `/api/snapshots/generate` from SEC-06 is one of the endpoints TEST-02 will cover.

- **TEST-03 marketOrderExecution.ts integration suite.** Phase 4 — orchestration-path coverage; distinct from TRADE-04's mode×side regression suite (Phase 2).

- **TEST-04 snapshot scraper edge-case tests.** Phase 4 — scraper retained per Phase 1 D-01.

- **Admin-page architectural refactor.** Out of scope for the milestone per `.planning/PROJECT.md` Out of Scope section.

- **Multi-chain expansion / account abstraction / new features.** Out of scope for the milestone.

- **PERF-01 numeric p75 LCP HUMAN-UAT.** Carried forward from Phase 2 — operator runs `/gsd-verify-work` after the post-Phase-3 deploy to capture the pre-/post-deploy numeric values into 02-RUNBOOK.md. Not a Phase 3 work item.

</deferred>

---

*Phase: 03-production-grade-hardening*
*Context gathered: 2026-04-30*
