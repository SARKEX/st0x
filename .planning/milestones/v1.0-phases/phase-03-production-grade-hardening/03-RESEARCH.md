# Phase 3: Production-Grade Hardening - Research

**Researched:** 2026-04-30
**Domain:** Server-side security & reliability hardening (secrets, sessions, CSRF, RPC fallback, vendored registry) for a Svelte 4 + SvelteKit 2 app on Vercel + Base 8453
**Confidence:** HIGH

## Summary

Phase 3 closes ten audit-flagged latent gaps across two adjacent disciplines: (1) **secrets & session hygiene** — remove the committed Alchemy key + dev-fallback secrets, swap `Math.random` for `crypto.randomBytes`, replace the spoofable client-set `wallet-address` cookie with a server-issued session cookie + session-bound CSRF, and apply rate-limit/admin gates to the snapshot endpoints; and (2) **RPC reliability** — add per-RPC retry-with-backoff to `generator.ts:callRpc`, kill the silent `latestBlock` fallback in `getBlockNumberForTimestamp`, switch `accessCodes.ts:verifyWalletSignature` to viem's `fallback([...])` Transport with retry, and vendor the Rain strategies registry so order deployment no longer depends on GitHub-raw availability.

The work ships in **9 waves** per CONTEXT D-01. Waves 1-3 are independent quick wins (env-var swap, fail-closed secrets, CSPRNG codes, env-detection, rate-limit/admin gate). Wave 4 lands the REL-01 retry pattern that Wave 5 (REL-02) reuses on the signature-verification path. Wave 6 is the high-risk SEC-03 + SEC-04 atomic flip (single coupled PR, 30-day sliding session, hard UX guarantee that wallet signature is per-session not per-request). Wave 7 vendors the registry. Wave 8 is the phase-exit verification + RUNBOOK plan.

Every recommendation in this document is structurally validated against the **carry-forward Phase 2 cross-cutting gates** (TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, `failWith()` count ≥ 12 in `marketOrderExecution.ts`, `EMERGENCY_RATIO_MULTIPLIER` count = 0, svelte-check baseline = 3 errors, `staleTime: Infinity`) and the **single-chain Base 8453 + two-auth-paths (wagmi + Dynamic embedded) ground truth** — aspirational multi-chain/AA content in CLAUDE.md is ignored until DRIFT-03 in Phase 4.

**Primary recommendation:** Use viem's `fallback([http(...), http(...)])` Transport with `retryCount + retryDelay` (HIGH confidence, official viem doc) for both REL-01 and REL-02. Vendor the Rain registry as `static/registry/` files (matches existing `static/` placement, no bundle bloat, supports refresh-without-redeploy via `git pull` of upstream + commit + deploy). Back the SEC-03 session cookie with Vercel KV (existing `signatureChallenge.ts` precedent — same `getKv()` surface, same `crypto.randomBytes(16).toString('hex')` nonce pattern). Use `VERCEL_ENV !== 'development' && !env.HCAPTCHA_SECRET → throw` for SEC-07 (HIGH confidence per Vercel docs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Wave shape.** Nine waves per the table:

| Wave | REQ | Surface | Rationale |
|------|-----|---------|-----------|
| 1 | SEC-01 | networks.ts:48,51 + raindex.ts:26 + accessCodes.ts:11 → env vars | Blocks REL-02 (shares accessCodes.ts file); also gives REL-02 the env var to read from |
| 2 (parallel) | SEC-02 | auth.ts:9 + csrf.ts:10 fail-closed at module load | Independent quick win |
| 2 (parallel) | SEC-05 | accessCodes.ts:50 + referrals.ts:67 → crypto.randomBytes | Independent quick win |
| 2 (parallel) | SEC-07 | accessCodes.ts hCaptcha env-detection | Independent quick win |
| 3 | SEC-06 | snapshot endpoints rate-limit + admin gate | Independent |
| 4 | REL-01 | generator.ts callRpc retry+backoff; kill silent latestBlock | Pattern feeds REL-02 |
| 5 | REL-02 | accessCodes.ts verifyWalletSignature → fallback chain | Depends on REL-01 pattern + SEC-01 env vars |
| 6 (paired) | SEC-03 + SEC-04 | server-issued session cookie + CSRF binding | Highest user-impact; ship together |
| 7 | REL-03 | Rain strategies registry vendoring | Independent |
| 8 | (verification) | phase-exit grep gates + 03-RUNBOOK.md | Mirrors Plan 02-08 / 01-08 |

**D-01a — Atomic-commits-with-svelte-check-green discipline carries forward** from Phase 1 + Phase 2. Each commit leaves svelte-check at the established baseline (3 errors after Phase 2 close), every commit passes the test suite, no mid-flight broken states unless explicitly justified per Phase 2 patterns 02-04..02-06.

**D-02 — SEC-01 single Alchemy key on both sides.** `PUBLIC_BASE_RPC_URL` (client-bundled, exposed) and `BASE_RPC_URL` (server-only) resolve to the same Alchemy app and key. Splitting into two apps doubles operational surface for marginal blast-radius reduction.

**D-02a — Key rotation discipline.** Provision new Alchemy app + key → set both env vars in Vercel project (production + preview) → deploy SEC-01 code → verify via OBS-04 `recordRpcAttempt` lines and client-side network tab → revoke old key in Alchemy dashboard.

**D-02b — Module-load fail-closed.** Missing `PUBLIC_BASE_RPC_URL` or `BASE_RPC_URL` in production must throw at module load (mirror `src/routes/api/cron/snapshots/+server.ts:45`). Dev mode tolerates missing vars.

**D-03 — SEC-06 admin gate + heaviest tier.** `POST /api/snapshots/generate` gated behind `requireAdmin` only (cron is a separate path using `CRON_SECRET` directly — confirmed during research). `/api/snapshots/preview` + `/api/snapshots/preview-stream` wrapped with `applyTieredRateLimit` at the heaviest existing tier.

**D-04 — SEC-03+04 atomic flip.** Single coupled PR (or tightly-sequenced PR pair). Existing wallet-address-cookie consumers migrated to read from new session cookie in same PR. Wallet-address cookie downgraded to non-authoritative hint. One-time wallet-signature prompt on next visit; never per-request. Manual smoke-test gate in Wave 6 VALIDATION (login → trade → reload → trade → log out → log in).

**D-04a — 30-day sliding session lifetime.** 30-day absolute expiry refreshed on activity. Re-sign required only on (a) 30+ days inactivity, (b) explicit logout, (c) admin invalidation, (d) cookie clear / device change. Existing `auth.ts:4 SESSION_DURATION_MS = 24h` (basic-auth flow) is unchanged — wallet session is a separate constant.

**D-04b — Hard UX constraint.** Once a user signs in to mint a session cookie, the cookie authenticates every subsequent request — wallet signature is never re-prompted per request. Any per-request signature implementation is rejected. Double-submit-cookie CSRF (SEC-04) does NOT require re-signing — it's an HTTP-level check.

### Claude's Discretion

- **REL-01 retry shape** — backoff strategy, max attempts, time budget against `maxDuration: 800`, what replaces silent `latestBlock` fallback in `getBlockNumberForTimestamp`.
- **REL-02 reuse pattern** — viem `fallback([...])` Transport vs custom Transport over `RPC_URLS`; OBS-04 fan-out label handling at `accessCodes.ts:92,103,113`.
- **REL-03 vendor strategy** — `static/registry/` vs compiled-into-bundle (npm dep / git submodule / inline JSON); refresh cadence vs bundle size.
- **SEC-03+04 storage backend** — Vercel KV (matches `signatureChallenge.ts` precedent) vs in-memory hot path with KV durable.
- **SEC-03 logout endpoint** — path, method, behavior.
- **SEC-05 alphabet preservation** — read existing alphabets, implement rejection sampling.
- **SEC-07 env detection** — canonical Vercel signal (`VERCEL_ENV`).
- **SEC-02 throw site** — module-local at `auth.ts` + `csrf.ts` top level (matches `CRON_SECRET` precedent) vs centralized helper.
- **Sliding session refresh frequency** — every request? every N hours? once-a-day?
- **Telegram alert wiring** — REL-01 chain-exhaustion alerts reuse existing `notifyChainExhausted` from `src/lib/server/alerts.ts` (Plan 01-06 / D-17).
- **Phase-exit wave + RUNBOOK** — analogous to 02-08 / 01-08 (grep gates + 03-RUNBOOK.md).

### Deferred Ideas (OUT OF SCOPE)

- Split Alchemy keys / public-RPC-only-on-client (rejected during discussion; revisit if quota abuse becomes measurable).
- Grace window or shadow rollout for SEC-03+04 (rejected; revisit only if atomic flip surfaces unexpected re-sign UX issues during Wave 6 manual smoke test).
- Wallet-address cookie permanent removal (Phase 3 ships downgrade; permanent removal is Phase 4 cleanup once TEST-01 confirms no consumer reads it).
- External log drain (Better Stack / Axiom / Datadog) — still deferred per Phase 1.
- `+error.svelte` user-visible error page — still deferred per Phase 1 D-12.
- DRIFT-03 (CLAUDE.md rewrite to single-chain reality) — Phase 4.
- DRIFT-01 / DRIFT-02 token-lookup cleanups — Phase 4.
- TEST-01 hooks.server.ts integration tests — Phase 4 (pins SEC-03+04 surface).
- TEST-02 admin audit-log fan-out — Phase 4.
- TEST-03 marketOrderExecution.ts integration suite — Phase 4.
- TEST-04 snapshot scraper edge-case tests — Phase 4.
- Admin-page architectural refactor — out of milestone scope.
- Multi-chain expansion / account abstraction / new features — out of milestone scope.
- PERF-01 numeric p75 LCP HUMAN-UAT — carried forward from Phase 2 (operator runs `/gsd-verify-work` post-deploy).
- SEC-03+04 sliding-refresh frequency tuning — implementation detail; planner picks (research recommends "throttle to once per N hours" — see § Architecture Patterns).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SEC-01** | Hardcoded Alchemy key removed from `raindex.ts:26`, `networks.ts:48,51`, `accessCodes.ts:11`; replaced with `PUBLIC_BASE_RPC_URL` (client) + `BASE_RPC_URL` (server); committed key rotated on deploy | § Standard Stack (SvelteKit `$env/dynamic/{public,private}`); § Code Examples (env-var read pattern); § Common Pitfalls (Pitfall 1 — public-vs-private split); § Code Examples (raindex.ts SETTINGS_YAML interpolation) |
| **SEC-02** | `SESSION_SECRET` and `CSRF_SECRET` fallback strings removed; missing secrets throw at module load in production | § Standard Stack (`$env/dynamic/private`); § Code Examples (`if (!dev && !env.X) throw new Error(...)` pattern from `cron/snapshots/+server.ts:45`); § Common Pitfalls (Pitfall 2 — module-load throw vs first-request throw) |
| **SEC-03** | Server-issued HttpOnly + Secure + SameSite=Strict session cookie tied to verified wallet signature; downgrade `wallet-address` cookie to non-authoritative hint | § Standard Stack (SvelteKit `cookies.set` API + viem `verifyMessage`); § Architecture Patterns (Pattern 1 — session cookie issuance + KV record); § Code Examples (cookie set with `path: '/'` mandatory in SvelteKit 2); § Don't Hand-Roll (use existing `signatureChallenge.ts` purpose enum + `crypto.randomBytes` nonce) |
| **SEC-04** | CSRF tokens bound to session cookie via double-submit-cookie pattern; replaces stateless `/api/auth/csrf` issuance | § Architecture Patterns (Pattern 2 — HMAC token bound to session-id); § Code Examples (`crypto.createHmac('sha256', CSRF_SECRET).update(sessionId)`); § Common Pitfalls (Pitfall 3 — session-id-bound CSRF is HTTP-level not wallet-level — preserves D-04b) |
| **SEC-05** | `crypto.randomBytes()` rejection-sampled into existing alphabet at `accessCodes.ts:50` (32-char alphabet, 8 picks) and `referrals.ts:67` (31-char alphabet, 6 picks) | § Code Examples (rejection sampling with floor of `256/alphabet.length` × alphabet.length cutoff); § Don't Hand-Roll (use existing `signatureChallenge.ts:58-60` `crypto.randomBytes(16).toString('hex')` precedent) |
| **SEC-06** | `applyTieredRateLimit` heaviest tier on `/api/snapshots/preview` + `/api/snapshots/preview-stream`; `requireAdmin` on `POST /api/snapshots/generate` | § Standard Stack (existing `applyTieredRateLimit` + `requireAdmin` from `adminAuth.ts`); § Architecture Patterns (Pattern 3 — adding new tier to `tieredLimits` map); § Common Pitfalls (Pitfall 4 — cron does NOT call `/api/snapshots/generate` — confirmed by grep; uses `CRON_SECRET` directly) |
| **SEC-07** | hCaptcha fail-closed when `HCAPTCHA_SECRET` missing on Vercel preview (not just production) | § Standard Stack (`VERCEL_ENV` system env var); § Code Examples (`env.VERCEL_ENV !== 'development' && !env.HCAPTCHA_SECRET → return false`) |
| **REL-01** | `generator.ts:callRpc` per-RPC retry + backoff; treat empty `result` as failure; remove silent `latestBlock` fallback in `getBlockNumberForTimestamp` | § Standard Stack (`src/lib/utils/retry.ts:withRetry` already exists with exponential backoff — wrap each RPC); § Architecture Patterns (Pattern 4 — retry-then-fall-through pattern); § Code Examples (cron time-budget arithmetic against `maxDuration: 800`); § Common Pitfalls (Pitfall 5 — what replaces `latestBlock`: throw vs Telegram alert vs partial-result-with-flag) |
| **REL-02** | EIP-1271/6492 verification on the same fallback-RPC chain with retry as REL-01; replaces single Alchemy RPC at `accessCodes.ts:8-11,64-85` | § Standard Stack (viem `fallback([...])` Transport with `retryCount + retryDelay`); § Architecture Patterns (Pattern 5 — fallback Transport with rank: false to preserve order); § Code Examples (replace `transport: http(URL)` with `transport: fallback([http(URL_1), http(URL_2), ...])`); § Common Pitfalls (Pitfall 6 — OBS-04 label `'alchemy-base-mainnet'` becomes inaccurate post-REL-02 — replace or preserve for log stability) |
| **REL-03** | Rain strategies registry vendored (no runtime GitHub-raw fetch); `RAIN_STRATEGIES_COMMIT = '9dd64902…'` constant removed; refresh procedure documented | § Architecture Patterns (Pattern 6 — `static/registry/` vendored mirror); § Don't Hand-Roll (no npm publish — Rain doesn't ship rain.strategies as a package); § Code Examples (`REGISTRY_URL = '/registry'` for same-origin fetch); § Common Pitfalls (Pitfall 7 — DotrainRegistry expects a URL it can `fetch()` from; same-origin path works; bundling-as-import requires WASM access pattern change — not recommended) |
</phase_requirements>

## Architectural Responsibility Map

Phase 3 work is exclusively server-tier (SvelteKit serverless functions on Vercel) plus one client-bundle env-var swap (SEC-01 PUBLIC_BASE_RPC_URL). No browser tier, no API contract changes for the trade page, no new external dependencies.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SEC-01 client RPC URL | Client (browser bundle) | — | `networks.ts` + `raindex.ts` are imported by trade page; `PUBLIC_BASE_RPC_URL` exposed via SvelteKit `$env/dynamic/public` |
| SEC-01 server RPC URL | API / Backend | — | `accessCodes.ts` is server-only (`src/lib/server/`); reads `BASE_RPC_URL` via `$env/dynamic/private` |
| SEC-02 secret fail-closed | API / Backend | — | `auth.ts` + `csrf.ts` are server-only modules; throw at module load lives in lambda cold-start |
| SEC-03 session cookie | API / Backend | — | Cookie issuance + KV record + `hooks.server.ts` consumption all server-side; client only sets cookie via `Set-Cookie` response header |
| SEC-04 CSRF binding | API / Backend | — | HMAC computation + validation server-side; client receives token via response and echoes via `X-CSRF-Token` header |
| SEC-05 CSPRNG codes | API / Backend | — | `accessCodes.ts` + `referrals.ts` are server-only; `crypto.randomBytes` is Node built-in |
| SEC-06 rate-limit + admin gate | API / Backend | — | `applyTieredRateLimit` + `requireAdmin` already server-only; wrap `+server.ts` handlers |
| SEC-07 hCaptcha env-detection | API / Backend | — | `verifyCaptcha` is server-only; `VERCEL_ENV` read via `$env/dynamic/private` |
| REL-01 RPC retry | API / Backend | — | `generator.ts` is server-only (cron + admin paths) |
| REL-02 verifyMessage retry | API / Backend | — | `accessCodes.ts:verifyWalletSignature` server-only |
| REL-03 vendored registry | API / Backend | CDN / Static | `static/registry/` files served by Vercel (CDN tier); fetched server-side from `getRegistry()` in `orderDeployment.ts` |

**No tier reassignment risk** — every Phase 3 surface is already tier-correct in current code; Phase 3 hardens, doesn't relocate.

## Standard Stack

### Core (already installed — verified via package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `viem` | 2.40.3 (transitive via wagmi 2.22.1) | RPC transports + signature verification (EIP-1271/6492) | Already used at `accessCodes.ts:1-11`; `fallback([...])` Transport is the canonical viem reliability primitive [VERIFIED: ctx7 /wevm/viem fallback transport docs] |
| `redis` | 5.10.0 | KV/session backend (Vercel KV-compatible API via `getKv()`) | Already used in `kv.ts`, `signatureChallenge.ts`; SEC-03 session record uses same surface [VERIFIED: package.json] |
| `@vercel/kv` | 1.0.1 | Wrapper for Vercel KV namespace | Already imported in `kv.ts` (commented as KV_KEYS pattern) [VERIFIED: package.json] |
| Node `crypto` | built-in | `randomBytes`, `createHmac`, `timingSafeEqual` | Already used in `auth.ts`, `csrf.ts`, `signatureChallenge.ts`; CSPRNG is Node-built-in (no dependency) [VERIFIED: existing imports] |
| SvelteKit `$env/dynamic/public` | 2.8.0 | Client-side env var injection at runtime | Already used for `PUBLIC_WALLETCONNECT_ID`, `PUBLIC_DYNAMIC_ENVIRONMENT_ID` [VERIFIED: STACK.md + +layout.svelte] |
| SvelteKit `$env/dynamic/private` | 2.8.0 | Server-only env var injection | Already used for `SESSION_SECRET`, `CRON_SECRET`, `HCAPTCHA_SECRET` [VERIFIED: STACK.md + multiple servers] |
| SvelteKit `cookies.set/get/delete` | 2.8.0 | Server-side cookie API; SvelteKit 2 requires `path: '/'` [CITED: SvelteKit 2 migration guide] | Already used in `routes/access/+page.server.ts`; standard SvelteKit API [VERIFIED: ctx7 /sveltejs/kit cookie docs] |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@rainlanguage/orderbook` | 0.0.1-alpha.231 | `DotrainRegistry.new(URL)` consumer | REL-03 — registry URL is the only thing changing; SDK import surface unchanged [VERIFIED: orderDeployment.ts:25] |
| `pino` (via `getLogger`) | (existing OBS-02) | Structured logs for retry attempts | REL-01 retry attempts use existing `recordRpcAttempt` [VERIFIED: rpcMetrics.ts] |
| `withRetry` | local helper | Exponential backoff retry on `'header not found'` / `'block not found'` / `code -32000` | REL-01 — wrap each per-RPC call inside `callRpc`'s for-loop [VERIFIED: src/lib/utils/retry.ts] |
| `notifyChainExhausted` | local (Plan 01-06) | Telegram alert delivery | REL-01 chain-exhaustion alerts go through this surface unchanged [VERIFIED: alerts.ts] |
| `recordRpcAttempt` / `reportChainExhausted` | local (Plan 01-06) | OBS-04 RPC metrics | REL-01 + REL-02 fan-out preserves existing instrumentation [VERIFIED: rpcMetrics.ts] |
| `applyTieredRateLimit` / `requireAdmin` | local | Rate-limit + admin gate | SEC-06 — needs new tier `snapshots-preview` added to `tieredLimits` map [VERIFIED: rateLimit.ts:311-322] |
| `signatureChallenge.ts` purpose enum | local | Verified-wallet challenge issuance + atomic GET+DEL consumption | SEC-03 — extend with `'session_login'` purpose [VERIFIED: signatureChallenge.ts:14-17] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff (and why we rejected) |
|------------|-----------|-------------------------------|
| viem `fallback([...])` for REL-02 | Custom Transport iterating `RPC_URLS` from generator.ts | Custom code = more bugs; viem `fallback` is battle-tested, supports `retryCount + retryDelay`, integrates with existing `verifyMessage` action that already calls EIP-1271/6492 (no rewrite). [HIGH confidence — recommend `fallback`] |
| Atomic-flip session cookie | Grace window with two cookies (old + new) supported in parallel | Per CONTEXT D-04: "rejected during discussion; cleanest bisect line, no deferred-cleanup PR, smaller temporary code surface." Atomic flip is the locked decision. |
| Vercel KV for session backend | In-memory hot path (Map) + KV durable | KV write+read is ~5-10ms intra-region (Vercel KV docs); session reads happen on every authenticated request but the existing `withCache` 5-min KV cache pattern at `access/check/+server.ts` shows ~5min TTL is acceptable UX-wise. In-memory is per-lambda-instance — multi-instance Vercel deploys would surface inconsistent state. **Recommendation:** KV-only; if latency becomes measurable, add in-memory L1 with TTL ≤ refresh interval in Phase 4. |
| `static/registry/` for REL-03 | Compiled-in via JSON import | DotrainRegistry calls `fetch(URL)` internally — needs a URL it can read. Compiled-in would require a WASM SDK pattern change. Static-files preserve existing API. [HIGH confidence — recommend static/] |
| Session-id-bound CSRF (SEC-04) | Per-request signature verification | Per-request signature regression is rejected by D-04b; double-submit-cookie pattern is HTTP-level [HIGH confidence per OWASP CSRF cheat sheet]. |
| `VERCEL_ENV` for SEC-07 | `process.env.NODE_ENV` (current) | `NODE_ENV` is `'production'` on both Vercel previews AND production. `VERCEL_ENV` distinguishes the three (`production` / `preview` / `development`). [VERIFIED: ctx7 /websites/vercel docs] |
| Module-local SEC-02 throw | Centralized `assertRequiredSecrets()` from hooks.server.ts | Module-local matches the existing `CRON_SECRET` precedent at `src/routes/api/cron/snapshots/+server.ts:45` (`if (!cronSecret && !dev) { ... return 503 }`). For Phase 3, do NOT centralize — surfaces in Vercel Logs at first cold start, simpler to bisect. |

**Installation:**

No new dependencies. All Phase 3 work uses already-installed libraries.

**Version verification:**

```bash
npm view viem version           # → 2.48.4 (latest)
npm view redis version          # → 5.10.0 (latest matches installed)
npm view @vercel/kv version     # → 3.0.0 (installed: 1.0.1; bump deferred)
npm view @rainlanguage/orderbook version  # → 0.0.1-alpha.231 (locked per Phase 2 — do NOT bump per RESEARCH §"Dependencies at Risk")
```

Installed viem (2.40.3 transitive) is sufficient — `fallback` Transport API has been stable since viem 1.x [VERIFIED: ctx7 /wevm/viem fallback docs].

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT (browser bundle)                                             │
│                                                                      │
│  +layout.svelte ──setCookie('wallet-address')──> [HINT ONLY post-Q3] │
│       │                                                              │
│       ├─ networks.ts (PUBLIC_BASE_RPC_URL) <── SEC-01 swap          │
│       └─ raindex.ts (PUBLIC_BASE_RPC_URL via SETTINGS_YAML interpolation) │
│                                                                      │
│  /api/auth/session [NEW POST]                                        │
│  /api/auth/logout  [NEW POST]                                        │
│  /api/auth/csrf    [MOD GET — requires session cookie]               │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ HTTPS (HttpOnly + Secure + SameSite=Strict)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER (SvelteKit + Vercel serverless)                              │
│                                                                      │
│  hooks.server.ts                                                     │
│   ├─ requestContextHandle (OBS-02, unchanged)                        │
│   ├─ Sentry.sentryHandle (OBS-01, unchanged)                         │
│   └─ existingHandle                                                  │
│       ├─ bot rejection (unchanged)                                   │
│       ├─ CORS preflight (unchanged)                                  │
│       ├─ public path (unchanged + +/api/auth/csrf still public)      │
│       ├─ admin path (auth.ts session — unchanged)                    │
│       └─ wallet-registration path                                    │
│            └─ NEW: read 'session' cookie → KV lookup → walletAddress │
│            └─ OLD: cookies.get('wallet-address')   [DELETED post-Q3] │
│                                                                      │
│  src/lib/server/                                                     │
│   ├─ auth.ts          ←── SEC-02: throw at module load if no SESSION_SECRET │
│   ├─ csrf.ts          ←── SEC-02: throw at module load if no CSRF_SECRET    │
│   ├─ walletSession.ts (NEW) ←── SEC-03: issue/refresh/consume session cookie │
│   ├─ accessCodes.ts                                                          │
│   │     ├─ SEC-01: const RPC_URL = env.BASE_RPC_URL                          │
│   │     ├─ REL-02: const transport = fallback([http(RPC_URL), http(...), …]) │
│   │     ├─ SEC-05: crypto.randomBytes rejection-sampled                      │
│   │     └─ SEC-07: VERCEL_ENV !== 'development' && !HCAPTCHA_SECRET → false  │
│   ├─ referrals.ts (SEC-05)                                                   │
│   ├─ rateLimit.ts (SEC-06: add 'snapshots-preview' tier)                     │
│   ├─ adminAuth.ts (SEC-06: requireAdmin used unchanged)                      │
│   ├─ signatureChallenge.ts (SEC-03: add 'session_login' purpose)             │
│   └─ snapshots/generator.ts (REL-01: callRpc retry; latestBlock kill)        │
│                                                                              │
│  src/lib/services/orderDeployment.ts                                         │
│      └─ REL-03: REGISTRY_URL = '/registry' (same-origin)                     │
│                                                                              │
│  src/lib/clients/raindex.ts (SEC-01: SETTINGS_YAML interpolation)            │
│      └─ Build a SETTINGS_YAML string with PUBLIC_BASE_RPC_URL substituted    │
│                                                                              │
│  static/registry/ ←── REL-03: vendored mirror of rain.strategies pinned commit │
└──────────────────────────────────────────────────────────────────────────────┘

Data flow — Phase 3 session-cookie path:
  User clicks "Sign in" (next visit post-deploy)
    → POST /api/auth/session/challenge { address }
       → server issues nonce via signatureChallenge.ts purpose='session_login'
       → returns { nonce, message, expiresAt }
    → client wallet.signMessage(message)
    → POST /api/auth/session { address, nonce, signature }
       → server verifyAccessRegistrationChallenge — wait, NEW purpose: verifyAccessSessionLoginChallenge
       → server verifyWalletSignature(address, message, signature) [via REL-02 fallback chain]
       → server crypto.randomBytes(32).toString('hex') = sessionId
       → server kvSet(walletSession:sessionId, { wallet, issuedAt, lastSeenAt }, TTL=30d)
       → cookies.set('session', sessionId, { httpOnly, secure, sameSite: 'strict', path: '/', maxAge: 30d })
       → returns { success, walletAddress, expiresAt }
    → subsequent authenticated request
       → hooks.server.ts reads cookie('session') → kvGet(walletSession:sessionId)
       → if expired: 401; if older than refresh-threshold (e.g. 24h): refresh TTL+lastSeenAt
       → event.locals.walletAddress = record.wallet
    → POST mutations (e.g. /api/access/register if used post-deploy)
       → require X-CSRF-Token header
       → server CSRF token = HMAC(sessionId, CSRF_SECRET).slice(0, 16)
       → validate header HMAC === recompute(sessionId)
```

### Recommended Project Structure (additions only)

```
src/lib/server/
├── walletSession.ts        # NEW — SEC-03; session cookie issuance + lookup + refresh
├── auth.ts                 # MOD — SEC-02 fail-closed
└── csrf.ts                 # MOD — SEC-04 session-bound HMAC

src/routes/api/auth/
├── csrf/+server.ts         # MOD — SEC-04: require session cookie before issuing token
├── session/
│   ├── challenge/+server.ts  # NEW — SEC-03: issue 'session_login' nonce
│   └── +server.ts          # NEW — SEC-03: POST verify signature + mint session cookie
└── logout/+server.ts       # NEW — SEC-03: DELETE session record + clear cookie

static/registry/             # NEW — REL-03 vendored rain.strategies mirror
├── orders/
│   └── *.json + *.rain     # vendored from upstream pinned commit
├── settings.yaml
└── README.md               # how to bump the pinned commit
```

### Pattern 1: Server-Issued Session Cookie (SEC-03)

**What:** Mint a cryptographically-random `sessionId`, store it in KV bound to a verified wallet address, return as HttpOnly cookie. Read on every request via `hooks.server.ts`. Refresh TTL on activity (sliding window). Delete on explicit logout.

**When to use:** Replaces the spoofable `wallet-address` cookie set client-side. The session cookie is THE auth surface for wallet identity post-Phase-3.

**Example (synthesized from existing `signatureChallenge.ts` + viem `verifyMessage` + SvelteKit `cookies.set`):**

```typescript
// src/lib/server/walletSession.ts (NEW)
import crypto from 'crypto';
import { getKv } from './kv';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days (D-04a)
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // refresh cookie + KV TTL once per 24h

interface WalletSessionRecord {
  walletAddress: string;
  issuedAt: number;
  lastSeenAt: number;
}

function sessionKey(sessionId: string): string {
  return `wallet_session:${sessionId}`;
}

export async function createSession(walletAddress: string): Promise<{ sessionId: string; expiresAt: number }> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const record: WalletSessionRecord = {
    walletAddress: walletAddress.toLowerCase(),
    issuedAt: now,
    lastSeenAt: now
  };
  const kv = await getKv();
  if (!kv) throw new Error('Session storage unavailable');
  await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
  return { sessionId, expiresAt: now + SESSION_TTL_MS };
}

export async function readSession(sessionId: string): Promise<WalletSessionRecord | null> {
  const kv = await getKv();
  if (!kv) return null;
  const raw = await kv.get(sessionKey(sessionId));
  if (!raw) return null;
  try { return JSON.parse(raw) as WalletSessionRecord; } catch { return null; }
}

export async function maybeRefreshSession(sessionId: string, record: WalletSessionRecord): Promise<void> {
  const now = Date.now();
  if (now - record.lastSeenAt < REFRESH_THRESHOLD_MS) return;  // throttle to 1 write per 24h
  const kv = await getKv();
  if (!kv) return;
  record.lastSeenAt = now;
  await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const kv = await getKv();
  if (!kv) return;
  await kv.del(sessionKey(sessionId));
}
```

```typescript
// src/routes/api/auth/session/+server.ts (NEW)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWalletSignature } from '$lib/server/accessCodes';  // post-REL-02: fallback-chain-backed
import { verifySessionLoginChallenge } from '$lib/server/signatureChallenge';
import { createSession } from '$lib/server/walletSession';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { address, nonce, signature } = await request.json();
  // 1. Validate inputs (zod-style guards omitted; same as access/register)
  // 2. Consume challenge atomically (signatureChallenge.ts purpose='session_login')
  const challenge = await verifySessionLoginChallenge(address, nonce);
  if (!challenge.valid || !challenge.message) {
    return json({ error: challenge.error || 'Invalid challenge' }, { status: 400 });
  }
  // 3. Verify wallet signature via REL-02 fallback chain
  const valid = await verifyWalletSignature(address, challenge.message, signature);
  if (!valid) return json({ error: 'Signature verification failed' }, { status: 401 });
  // 4. Mint session
  const { sessionId, expiresAt } = await createSession(address);
  // 5. Set HttpOnly + Secure + SameSite=Strict cookie (SvelteKit 2 requires path)
  cookies.set('session', sessionId, {
    httpOnly: true,
    secure: !dev,                  // dev-mode HTTPS optional
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60      // 30 days, matches KV TTL
  });
  return json({ success: true, walletAddress: address.toLowerCase(), expiresAt });
};
```

```typescript
// src/hooks.server.ts (MOD — replace getWalletFromRequest)
async function getWalletFromRequest(cookies: { get: (n: string) => string | undefined }): Promise<string | null> {
  const sessionId = cookies.get('session');
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
  const record = await readSession(sessionId);
  if (!record) return null;
  // Fire-and-forget: refresh if older than threshold (does not block the request)
  void maybeRefreshSession(sessionId, record);
  return record.walletAddress;
}
```

[Source: synthesized from existing signatureChallenge.ts + ctx7 /sveltejs/kit cookies.set docs + ctx7 /wevm/viem verifyMessage docs] [HIGH confidence]

### Pattern 2: Session-Bound CSRF Token (SEC-04, double-submit-cookie)

**What:** CSRF token is `HMAC(sessionId, CSRF_SECRET).slice(0, 16)`. Issued on GET `/api/auth/csrf` (now requires session cookie present). Validated on POST/PUT/DELETE: client sends in `X-CSRF-Token` header; server recomputes from cookie's session-id and compares constant-time.

**When to use:** All CSRF-protected endpoints (currently `/api/onramper/sign-url` is gone post-DEPR-03; the surviving sites are admin endpoints + post-SEC-03 the wallet-registration POST and any future writes). Replaces stateless tokens.

**Example:**

```typescript
// src/lib/server/csrf.ts (REWRITE post-SEC-04)
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.CSRF_SECRET && !env.SESSION_SECRET) {
  throw new Error('[csrf] CSRF_SECRET or SESSION_SECRET required in production');  // SEC-02
}
const CSRF_SECRET = env.CSRF_SECRET || env.SESSION_SECRET || (dev ? 'dev-csrf-secret-not-for-production' : '');

export function generateCsrfTokenForSession(sessionId: string): string {
  return crypto.createHmac('sha256', CSRF_SECRET).update(sessionId).digest('hex').slice(0, 32);
}

export function validateCsrfTokenForSession(token: string, sessionId: string): boolean {
  if (!token || !sessionId) return false;
  const expected = generateCsrfTokenForSession(sessionId);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
}
```

```typescript
// src/routes/api/auth/csrf/+server.ts (MOD)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfTokenForSession } from '$lib/server/csrf';

export const GET: RequestHandler = async ({ cookies }) => {
  const sessionId = cookies.get('session');
  if (!sessionId) return json({ error: 'Session required' }, { status: 401 });
  return json({ token: generateCsrfTokenForSession(sessionId) });
};
```

[Source: OWASP CSRF Prevention Cheat Sheet — double-submit-cookie + HMAC-bound pattern; cross-verified with existing csrf.ts HMAC pattern] [HIGH confidence — but note: per CONTEXT, `/api/auth/csrf` STAYS in `isPublicPath()` is allowed because the endpoint now reads the session cookie itself; making it require session is the security fix, but the public-path classification is about CORS/auth-routing, not authentication — leaving it in public-path is fine because the handler now does its own session check.]

### Pattern 3: viem `fallback([...])` Transport with Retry (REL-02)

**What:** Replace `transport: http(URL)` with `transport: fallback([http(URL_1), http(URL_2), ...], { retryCount, retryDelay })`. viem automatically tries each transport; on failure, falls through to the next; with `retryCount > 0`, retries within each transport before falling through.

**When to use:** REL-02 (`accessCodes.ts:9-12`) — replace single-RPC `basePublicClient` with fallback-chain-backed client. Same `verifyMessage` API works.

**Example:**

```typescript
// src/lib/server/accessCodes.ts (MOD — REL-02 + SEC-01)
import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

const PRIMARY_RPC_URL = env.BASE_RPC_URL;
if (!dev && !PRIMARY_RPC_URL) {
  throw new Error('[accessCodes] BASE_RPC_URL required in production');  // SEC-01 + SEC-02 fail-closed
}

// Same fallback list as generator.ts — single source of truth in networks.ts post-Phase-3
import { networks } from '$lib/config/networks';
const RPC_URLS = [PRIMARY_RPC_URL, ...networks[0].fallbackRpcUrls].filter(Boolean) as string[];

const basePublicClient = createPublicClient({
  chain: base,
  transport: fallback(
    RPC_URLS.map((url) => http(url)),
    {
      retryCount: 2,        // 2 retries per transport before falling through
      retryDelay: 200,      // 200ms base, exponential backoff (viem default)
      rank: false           // preserve order; primary always tried first (don't auto-rank)
    }
  )
});
```

[Source: ctx7 /wevm/viem fallback transport docs — retryCount + retryDelay + rank options] [HIGH confidence]

**OBS-04 fan-out preservation:** Wrap the `basePublicClient.verifyMessage(...)` call in the existing `recordRpcAttempt` + `reportChainExhausted` instrumentation. Because viem's fallback transport handles per-transport retry internally, the `recordRpcAttempt` granularity becomes "per logical call" not "per RPC attempt" — to preserve the per-RPC granularity Phase 1 introduced, wrap each individual `http(url)` call with a custom transport that records on each RPC attempt. **Recommended:** preserve the call-level instrumentation (single `recordRpcAttempt` with `rpc_url: 'fallback-chain-base'`); fan-out granularity is a Phase 4 concern. The CONTEXT discretion area "REL-02 reuse pattern" allows the planner to pick — research recommends the simpler call-level instrumentation. The existing `'alchemy-base-mainnet'` synthetic label gets replaced with `'fallback-chain-base'` (or whatever stable identifier the planner picks); the OBS-04 grep gates pin the label, so consistency matters.

### Pattern 4: Per-RPC Retry-Then-Fall-Through (REL-01)

**What:** In `generator.ts:callRpc`, wrap each per-RPC `fetch()` call in `withRetry(fn, maxRetries=2, delayMs=200)` (using existing `src/lib/utils/retry.ts`). Treat empty `result` as failure (not just per-RPC fail-and-continue — fail the retry loop too). When the entire chain exhausts, throw rather than silently return null. Update `getBlockNumberForTimestamp` to throw on `null` from `callRpc('eth_getBlockByNumber', ...)` instead of letting `latestBlock` become the silent fallback.

**When to use:** REL-01 — `generator.ts:19-35` (the `callRpc` helper) plus `getBlockNumberForTimestamp` at line 122 where the silent latestBlock fallback lives.

**Time budget against `maxDuration: 800` (cron):**

- 6 RPCs × 2 retries × 200-400ms wall time per RPC retry = 6 × 2 × 0.4 = ~4.8s worst-case for one `callRpc` invocation if every retry exhausts on every RPC.
- Cron makes ~30 `callRpc` invocations per snapshot generation (binary search + block-timestamp + transfers + etc.). Worst-case retry budget: 30 × 4.8s = ~144s.
- `maxDuration: 800` (~13.3 min). Worst-case retry budget = ~144s = ~2.4 min. **Comfortable margin.**
- Recommend: `maxRetries=2, delayMs=200` (matches existing `withRetry` defaults but compressed delay — RPC failures are typically transient at 100-300ms).

**Example:**

```typescript
// src/lib/server/snapshots/generator.ts (MOD — REL-01)
import { withRetry } from '$lib/utils/retry';

async function fetchOnce(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.result) throw new Error('empty result');  // REL-01: empty IS failure
  return data.result;
}

async function callRpc(method: string, params: unknown[]): Promise<unknown> {  // returns unknown, NOT unknown | null
  const attempts: Array<{ rpc_url: string; status_or_error: string }> = [];
  for (const rpcUrl of RPC_URLS) {
    const start = Date.now();
    try {
      const result = await withRetry(() => fetchOnce(rpcUrl, method, params), 2, 200);
      recordRpcAttempt({ rpc_url: rpcUrl, fn: `callRpc:${method}`, ok: true, status_or_error: 'ok', duration_ms: Date.now() - start });
      return result;
    } catch (err) {
      const status_or_error = err instanceof Error ? err.message : String(err);
      recordRpcAttempt({ rpc_url: rpcUrl, fn: `callRpc:${method}`, ok: false, status_or_error, duration_ms: Date.now() - start });
      attempts.push({ rpc_url: rpcUrl, status_or_error });
    }
  }
  await reportChainExhausted({ fn: `callRpc:${method}`, attempts });
  throw new Error(`callRpc(${method}) — all ${RPC_URLS.length} RPCs exhausted (with retry)`);  // REL-01: throw, not null
}

// getBlockNumberForTimestamp:
// Existing line 122 `if (!block || ...) { right = mid - 1; continue; }` continues the binary search even when callRpc threw.
// REL-01: callRpc now THROWS on chain exhaustion. The `try/catch` becomes:
async function getBlockForBinarySearch(mid: number): Promise<{ ts: number } | null> {
  try {
    const block = await callRpc('eth_getBlockByNumber', [`0x${mid.toString(16)}`, false]);
    if (block && typeof block === 'object' && 'timestamp' in block) {
      return { ts: parseInt((block as { timestamp: string }).timestamp, 16) };
    }
    return null;
  } catch (err) {
    return null;  // single-block lookup miss — keep binary searching
  }
}
// But the OUTER getBlockNumberForTimestamp call from cron MUST also handle the case where every probe fails:
// REL-01 fix: if smallestDiff stayed at Infinity (no successful block lookup), THROW (don't silently return latestBlock).
```

**What replaces the silent `latestBlock` fallback** (CONTEXT discretion area):

| Option | Behavior | Recommendation |
|--------|----------|----------------|
| A. Throw | Cron 500s; alert via Vercel Logs error rate alarm | Preferred — surfaces in Sentry + Telegram (via `notifyChainExhausted`); consistent with REL-01's other failure paths |
| B. Telegram alert + null | Returns null; caller decides | Consumer behavior matters — only `cron/snapshots/+server.ts` calls `getBlockNumberForTimestamp` (line 71-72). Cron handles `null` → still calls `pickRandomBlocksFromHalves(NaN, NaN)` → garbage output. Not safe. |
| C. Partial result with explicit flag | Returns `{ block, exhausted: true }` | Adds API surface; only consumer is cron; over-engineering |

**Recommendation: Option A (throw).** Cron's catch block (`cron/snapshots/+server.ts:152-160`) already handles thrown errors with a 500 response + pino error log. `notifyChainExhausted` already fires from `reportChainExhausted` on the way through. Adding a `throw` cleanly surfaces the failure to Vercel Logs alarms.

[Source: synthesized from src/lib/server/snapshots/generator.ts existing structure + src/lib/utils/retry.ts existing API + REL-01 requirement text + cron consumer behavior at cron/snapshots/+server.ts:71-72] [HIGH confidence]

### Pattern 5: Vendored Static Registry (REL-03)

**What:** Mirror the `rain.strategies` registry under `static/registry/` and serve via Vercel's static asset hosting at `https://www.st0x.io/registry/...`. `DotrainRegistry.new(URL)` reads from this same-origin URL instead of `raw.githubusercontent.com`.

**When to use:** REL-03 — replace `RAIN_STRATEGIES_COMMIT = '9dd64902...'` + `REGISTRY_URL = 'https://raw.githubusercontent.com/.../registry'` with `REGISTRY_URL = '/registry'` (relative to deploy origin) or `import { env } from '$env/dynamic/public'; const REGISTRY_URL = env.PUBLIC_REGISTRY_URL || '/registry'` for flexibility.

**How to vendor:**

1. `git clone https://github.com/rainlanguage/rain.strategies.git` into a sibling directory
2. `git checkout 9dd64902161158395d588335f0a02e3a6d52f772`
3. Copy contents of `rain.strategies/registry/` into `static/registry/` of st0x repo
4. Commit. The registry is now part of the st0x repo (subject to Phase 3's atomic-commits-with-svelte-check-green discipline).

**Refresh procedure (documented in 03-RUNBOOK.md):**

```bash
# Bumping the pinned commit (Phase 3 RUNBOOK)
cd ../rain.strategies && git fetch && git checkout <new-commit-sha>
cd ../st0x
rsync -av --delete ../rain.strategies/registry/ static/registry/
git add static/registry
git commit -m "chore: bump rain.strategies registry to <new-sha>"
# deploy via PR → merge → Vercel auto-deploy
```

**Bundle size:** `static/registry/` is NOT bundled into JS — Vercel serves it as static files. Zero impact on the trade-page bundle size (PERF-01 invariant preserved).

**Refresh-without-redeploy:** Vendoring requires a redeploy to bump. The CONTEXT discretion area allows picking; **research recommendation:** static/registry/ + redeploy is fine — Phase 3's atomic-commits-with-svelte-check-green discipline already gates each registry bump through the same review pipeline as code, which is the right outcome (a Rain registry change can functionally break order deployment; vendoring + redeploy gives the team a chance to QA before live).

**Alternative considered: external CDN (e.g., Vercel Blob with a stable URL).** Adds operational complexity (blob ACL management) and a single failure point separate from the deploy unit. Static-files inside the deploy unit are stronger: the same "deploy = good" discipline that gates code changes also gates registry changes.

[Source: static/ directory listing + svelte.config.js external for `@scalar/api-reference` + Vercel static asset docs] [HIGH confidence]

### Pattern 6: Atomic-Flip Authorization Cookie Migration (SEC-03+04 / D-04)

**What:** Single coupled PR — within ONE atomic commit (or tightly-sequenced PR pair within Wave 6) — flip every consumer of the `wallet-address` cookie to read from the new session-id cookie. Existing logged-in users get a one-time wallet signature prompt on next visit; that prompt happens once per session, never per request (D-04b).

**When to use:** Wave 6 plan body. Consumers to migrate (verified via `grep -rn "wallet-address" src`):

1. `src/hooks.server.ts:271` — `cookies.get('wallet-address')` → `cookies.get('session')` + KV lookup
2. `src/lib/server/logger.ts:98` — read 'wallet-address' for log enrichment → read session record
3. `src/routes/access/+page.server.ts:8` — `cookies.delete('wallet-address')` → ALSO delete 'session' cookie + delete KV record
4. `src/routes/api/access/check/+server.ts:25` — `cookieWallet === address` rate-limit tier check → use session record's walletAddress
5. `src/routes/+layout.svelte:65-80` — cookie set client-side: DOWNGRADE to non-authoritative hint (keep for the rate-limit tier optimization at access/check; comment that it's not auth)

**Manual smoke test (D-04 VALIDATION):**

```
1. Connect wallet (existing session) → page loads, wallet address visible in nav
2. Sign in modal appears → click Sign → wallet signature prompt → success
3. /trade/[id] loads, Buy or Sell quote visible → click "Place market order"
4. Single transaction prompt (no wallet-signature prompt, ONLY tx prompt)
5. Receipt visible, balance updated
6. Reload page (Ctrl+R) → still authenticated, no signature prompt
7. /trade/[id] again → place order → still no signature prompt
8. POST /api/auth/logout → cookie cleared, KV record deleted
9. Reload → access page or sign-in modal reappears
10. Sign in again → wallet signature prompt → continues working
```

[Source: CONTEXT D-04 + grep -rn "wallet-address" src/] [HIGH confidence]

### Anti-Patterns to Avoid

- **Per-request wallet signature.** Hard-rejected by D-04b. The session cookie + double-submit-cookie CSRF gives "I haven't seen this user since the last paint" via cookie absence — wallet signature only re-prompts when the cookie is gone. Never call `signMessage()` during normal request flow.
- **Centralizing SEC-02 throws in `hooks.server.ts`.** The existing `CRON_SECRET` precedent at `src/routes/api/cron/snapshots/+server.ts:45` is per-module. Per-module fails at cold start (Vercel Logs surfaces immediately). Centralizing means the throw fires once per route entry — same UX, more code.
- **Splitting Alchemy keys (D-02 rejected).** Bundle key is exposed regardless. Two apps = two rotation events. Keep single key both sides.
- **Storing the wallet signature in the session record.** The signature is an artifact of the auth event, not auth state. After verification, store ONLY `{ walletAddress, issuedAt, lastSeenAt }`. Re-verification (e.g., admin invalidation) uses a different mechanism (delete the KV record, not re-verify the stored signature).
- **Validating CSRF tokens against `Date.now()` timestamp.** The existing csrf.ts approach (timestamp-encoded token) is replaced by session-id-bound HMAC. The timestamp goes away — session expiry handles freshness.
- **Adding new failure paths to `marketOrderExecution.ts` in Phase 3.** None of SEC-01..07 / REL-01..03 touch that file. Phase 2 cross-cutting gate `failWith()` count ≥ 12 must hold unchanged at Phase 3 close.
- **Removing fallback URLs from networks.ts.** SEC-01 swaps the LITERAL Alchemy URL for an env var read; the fallbackRpcUrls array stays. Removing it would break the trade page on RPC outage (which is the core scenario for the "RPCs rotated multiple times" finding in CONCERNS.md — this is precisely the fallback we want to keep).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Random wallet-session ID generation | `Math.random().toString(36).slice(2)` | `crypto.randomBytes(32).toString('hex')` | CSPRNG vs predictable PRNG. Same pattern signatureChallenge.ts:58-60 already uses [HIGH] |
| Code generation (SEC-05) | Custom rejection-sampling math | `crypto.randomBytes` + modular bias check (`if (byte >= 256 - (256 % alphabet.length)) skip`) | Avoids modulo bias; standard CSPRNG idiom [HIGH] |
| Session-cookie HMAC validation | Naive `===` string compare | `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` | Constant-time compare prevents timing attacks. Already used in csrf.ts:65, auth.ts:30 [HIGH] |
| RPC retry/backoff | Custom `setTimeout` loop | `withRetry(fn, maxRetries, delayMs)` from `src/lib/utils/retry.ts` | Existing helper handles the RPC-specific error-code matchers (`-32000`, `'header not found'`, `'block not found'`) — REL-01 retry covers transient infrastructure errors [HIGH] |
| viem fallback chain | Custom Transport iterating URLs | `fallback([http(url1), http(url2)])` with `retryCount` | Battle-tested viem primitive; integrates with `verifyMessage` action; supports per-transport retry [HIGH per ctx7] |
| Vercel KV access | Direct `redis.createClient(...)` calls | `getKv()` + `kvGet`/`kvSet`/`kvDel` from `src/lib/server/kv.ts` | Existing helper handles connection pooling, dev-mode mock, lazy init; all KV access in Phase 3 should go through this [HIGH] |
| Vercel `VERCEL_ENV` polyfill | `process.env.NODE_ENV` checks | `env.VERCEL_ENV` from `$env/dynamic/private` | NODE_ENV is `'production'` in Vercel previews too; VERCEL_ENV distinguishes [VERIFIED: ctx7 /websites/vercel] |
| Telegram alert delivery | Custom HTTP POST to api.telegram.org | `notifyChainExhausted({ ... })` from `src/lib/server/alerts.ts` | Plan 01-06 / D-17 already shipped this; reuse for REL-01 chain-exhaustion [HIGH] |
| Wallet-signature challenge issuance | Build new nonce + message + storage | Extend `signatureChallenge.ts` with new `'session_login'` purpose | Existing flow has atomic GET+DEL Lua script, 5-min TTL, in-memory dev fallback. Adding a purpose is one-liner enum extension + new builder function [HIGH] |
| CSRF token validation | Stateless timestamp + signature | Session-id-bound HMAC (double-submit-cookie) | OWASP-recommended; binds tokens to authenticated session. Stateless tokens (current csrf.ts) are forgeable by anyone with the secret — and the secret is shared with the session HMAC, which means anyone who can read the JS bundle can forge tokens [HIGH per OWASP CSRF Cheat Sheet] |
| Vendored Rain registry refresh | Build a pull-request bot or CI hook | Manual `rsync` + commit + deploy (RUNBOOK procedure) | Solo/1-2 dev team scale; complexity of automated bumping >> savings; CONCERNS.md +PROJECT.md framing |

**Key insight:** Every Phase 3 problem has a Node-built-in or existing-helper answer. The phase is plumbing — connecting existing pieces (KV + viem fallback + signatureChallenge + withRetry + applyTieredRateLimit + VERCEL_ENV) — not invention.

## Runtime State Inventory

> Phase 3 is partially a refactor (rename / replace cookie consumers, rotate keys, vendor a registry). This section catalogs runtime state that survives a code-only edit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) Vercel KV records keyed by old `wallet-address` semantics: NONE — the wallet-address cookie was never read on the server beyond `getWalletFromRequest` for routing; no KV records reference it. (2) The `KV_KEYS.wallet(address)` records (RegisteredWallet) survive Phase 3 unchanged; SEC-03 ADDS a new `wallet_session:{sessionId}` namespace, doesn't migrate existing data. (3) `KV_KEYS.accessCode(code)` records (access codes) survive Phase 3 unchanged; SEC-05 only changes how NEW codes are minted. | **None.** SEC-03 introduces a new KV namespace; existing data untouched. SEC-05 affects NEW code minting only — existing codes remain valid. |
| **Live service config** | (1) Vercel project env vars: `SESSION_SECRET` and `CSRF_SECRET` are already set per Phase 1 evidence (auth.ts + csrf.ts use them with fallbacks). SEC-02 fail-closed makes them required; if `CSRF_SECRET` is unset (it's currently aliased to `SESSION_SECRET`), Phase 3 must EITHER add CSRF_SECRET to Vercel env OR keep using SESSION_SECRET as the source-of-truth. **Recommend keeping SESSION_SECRET as the source-of-truth for both** (current behavior; csrf.ts:10 reads `SESSION_SECRET || 'default-...'`); SEC-02 swap drops the fallback string. (2) `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` are NEW env vars that must be set in Vercel project (production + preview) before deploying SEC-01. (3) `OBSERVABILITY_ALERT_TELEGRAM_*` already set in Phase 1. | **Action required pre-deploy SEC-01:** Set `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` in Vercel (production + preview); rotate Alchemy key as per D-02a procedure. **Action required pre-deploy SEC-02:** Confirm `SESSION_SECRET` is set in Vercel (it should be, per Phase 1 evidence) — surfacing a cold-start crash on first deploy if not. |
| **OS-registered state** | None — no OS-level registrations embed any of the strings being changed. | **None.** |
| **Secrets and env vars** | (1) `SESSION_SECRET` — stays. (2) `CSRF_SECRET` — currently optional; Phase 3 either makes it required or drops to using SESSION_SECRET. (3) `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` — NEW (SEC-01). (4) `HCAPTCHA_SECRET` — already exists; SEC-07 only changes detection signal. (5) `VERCEL_ENV` — Vercel-provided system env var (no manual config). (6) The hardcoded Alchemy key `y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9` — must be REVOKED in Alchemy dashboard after deploy (D-02a step 5). | **Action required:** D-02a 6-step rotation procedure (provision new key → set env vars → deploy → verify → revoke old key). |
| **Build artifacts / installed packages** | (1) No egg-info / npm-global / Docker tags in this repo. (2) `static/registry/` is a NEW build artifact (vendored — not "stale"). (3) Old `RAIN_STRATEGIES_COMMIT` constant value lingers in git history; once REL-03 lands, the constant disappears from `src/`. | **None for build artifacts.** Watch for the `RAIN_STRATEGIES_COMMIT` grep gate in 03-08 (must return 0 hits in `src/lib/services/orderDeployment.ts`). |

**Summary:** Phase 3's only runtime-state action items are (a) provisioning the new `BASE_RPC_URL` env vars and rotating the Alchemy key, and (b) confirming the existing `SESSION_SECRET` is present (which it must be per Phase 1 evidence). Everything else is code-only changes that don't require data migration.

## Common Pitfalls

### Pitfall 1: PUBLIC_*-prefix discipline (SEC-01)

**What goes wrong:** Setting only `BASE_RPC_URL` (server) without `PUBLIC_BASE_RPC_URL` (client). Trade page loads but fails to fetch quotes — the bundled `networks.ts` reads `env.PUBLIC_BASE_RPC_URL` and gets `undefined`.

**Why it happens:** SvelteKit `$env/dynamic/public` only exposes vars that start with `PUBLIC_`. Server modules (`$lib/server/`) use `$env/dynamic/private`; bundled client code uses `$env/dynamic/public`. Same Alchemy URL value, two env-var names.

**How to avoid:** Set BOTH `BASE_RPC_URL` AND `PUBLIC_BASE_RPC_URL` in Vercel project (production + preview) to the same URL value. Document this as the SEC-01 deploy step in 03-RUNBOOK.md.

**Warning signs:** Trade page loads but `networks.ts:48` resolves to `undefined`; viem `http(undefined)` returns a transport that fetches from `localhost`; trade UI shows "no liquidity" because every quote fails.

### Pitfall 2: Module-load throw vs first-request throw (SEC-02)

**What goes wrong:** Putting the throw inside the function body of `createSessionToken` makes it fire only when the function is called — first authenticated request after cold-start, not at boot. Vercel Logs records a 500 error per affected request, not a clear "this lambda is broken on cold start" signal.

**Why it happens:** Tempting to wrap `if (!env.SESSION_SECRET) throw new Error(...)` inside the function. Module-top-level throws fire at import time.

**How to avoid:** Put the check at module top-level:

```typescript
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.SESSION_SECRET) {
  throw new Error('[auth] SESSION_SECRET required in production');
}
const SESSION_SECRET = env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');
// rest of module
```

**Warning signs:** Cold start in Vercel Logs shows lambda boot crashing — but only when the env var is missing. If the var is set, the import is silent.

### Pitfall 3: CSRF token NOT regenerated on session change (SEC-04)

**What goes wrong:** After logout + new session-login, the client's cached CSRF token is computed against the OLD session-id and now fails validation. User sees opaque 403s on form submits.

**Why it happens:** The CSRF token is bound to the session-id (HMAC). Logout destroys the session; new login creates a new session-id; the client's cached token references a session that no longer exists.

**How to avoid:** Document in 03-RUNBOOK.md that the client-side CSRF token must be re-fetched after every login (or on every page load — the existing `/api/auth/csrf` GET pattern is cheap). The new `csrf` endpoint already requires the session cookie, so calling it post-login naturally returns the right token.

**Warning signs:** Users report intermittent 403s on form submits after session changes.

### Pitfall 4: `applyTieredRateLimit` requires the tier in `tieredLimits` map (SEC-06)

**What goes wrong:** Calling `applyTieredRateLimit(request, 'snapshots-preview', ...)` with a tier name that doesn't exist in the `tieredLimits` map results in `console.error('[Rate Limit] Unknown tier key: snapshots-preview')` and **fails open** (`return null`). Not what we want.

**Why it happens:** `tieredLimits` is hardcoded in `src/lib/server/rateLimit.ts:311-322` with only `rewards` + `accessCheck` entries today. SEC-06 must ADD a new entry.

**How to avoid:** Plan 03-03 (SEC-06) MUST add a new entry to `tieredLimits`:

```typescript
// src/lib/server/rateLimit.ts (MOD — SEC-06)
export const tieredLimits: Record<string, TieredRateLimitConfig> = {
  rewards: { ... },
  accessCheck: { ... },
  // NEW for SEC-06:
  snapshotsPreview: {
    anonymous: { windowMs: 60 * 1000, maxRequests: 1 },     // 1/min — preview takes 10-60s
    authenticated: { windowMs: 60 * 1000, maxRequests: 3 }  // 3/min for connected wallets
  }
};
```

The "heaviest existing tier" per CONTEXT D-03 is the most-restrictive — `snapshots` rateLimiter is `2 req/min` (line 263); the preview endpoints take 10-60s wall time, so 1-3/min is right.

**Warning signs:** Rate-limit tests fail; logs show "Unknown tier key" warnings.

### Pitfall 5: Cron does NOT call `/api/snapshots/generate` (SEC-06 / D-03)

**Verified by grep:** `grep -rn "/api/snapshots/generate\|fetch.*snapshots/generate" src` returns 0 hits. The cron at `src/routes/api/cron/snapshots/+server.ts` directly calls `generateAllTokenSnapshots()` from the `$lib/server/snapshots/generator` module — bypassing the HTTP endpoint entirely.

**Implication:** Gating `POST /api/snapshots/generate` behind `requireAdmin` does NOT break the cron. CONTEXT D-03 Option A is safe; the Option B fallback (`requireAdmin + CRON_SECRET escape`) is unnecessary.

### Pitfall 6: `RAIN_STRATEGIES_COMMIT` NOT just a string constant (REL-03)

**What goes wrong:** Replacing `REGISTRY_URL = "https://raw.githubusercontent.com/.../${RAIN_STRATEGIES_COMMIT}/registry"` with `REGISTRY_URL = "/registry"` works at runtime — but if any other file imports `RAIN_STRATEGIES_COMMIT` (e.g., for a hash check, for analytics), removing the constant breaks them.

**Why it happens:** Pre-flight grep should confirm.

**How to avoid:** Run `grep -rn "RAIN_STRATEGIES_COMMIT" src/` before Plan 03-07 to confirm only `orderDeployment.ts` references it. (Verified on 2026-04-30: only `orderDeployment.ts:55` references the constant.)

### Pitfall 7: viem `verifyMessage` retries internally on fallback (REL-02)

**What goes wrong:** Wrapping `verifyMessage` in an outer `withRetry` causes double-retry: viem's fallback transport retries per-transport, then the outer `withRetry` retries again — multiplicatively.

**Why it happens:** The fallback Transport with `retryCount: 2` already retries each transport up to 2 times before falling through to the next.

**How to avoid:** REL-02 should NOT wrap `verifyMessage` in `withRetry`. Use viem's built-in `retryCount` + `retryDelay` on the fallback transport. The OBS-04 instrumentation wraps the outer call (per logical call), not per RPC attempt.

### Pitfall 8: SvelteKit 2 cookie `path` is required (SEC-03)

**What goes wrong:** `cookies.set('session', sessionId, { httpOnly: true })` in SvelteKit 2 throws because `path` is now mandatory.

**Why it happens:** SvelteKit 2 migration tightened the cookie API to prevent the implicit-path browser bug.

**How to avoid:** Always pass `{ path: '/' }`:

```typescript
cookies.set('session', sessionId, {
  httpOnly: true,
  secure: !dev,
  sameSite: 'strict',
  path: '/',                  // REQUIRED in SvelteKit 2
  maxAge: 30 * 24 * 60 * 60   // seconds, NOT milliseconds
});
```

[Source: ctx7 /sveltejs/kit migration guide] [HIGH confidence]

### Pitfall 9: rejection sampling vs simple modulo (SEC-05)

**What goes wrong:** `chars[crypto.randomBytes(1)[0] % 32]` for the access-code 32-char alphabet is **bias-free** (32 evenly divides 256). But `chars[crypto.randomBytes(1)[0] % 31]` for the referral-code 31-char alphabet is **biased** — values 0-247 map evenly across 0-30, but 248-255 (8 values) ALSO map back to 0-7, giving those 8 indices a slight (1-in-32 vs 1-in-31) extra weight.

**Why it happens:** Modulo bias is a classic CSPRNG-misuse bug.

**How to avoid:** Rejection sampling — when `byte >= floor(256/N) * N` (i.e., the "extra" range that would bias the modulo), discard the byte and draw again:

```typescript
function pick(alphabet: string): string {
  const n = alphabet.length;
  const limit = Math.floor(256 / n) * n;
  while (true) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < limit) return alphabet[byte % n];
    // else: re-roll
  }
}
```

For the 32-char access-code alphabet, `limit = 256` (no rejections). For the 31-char referral-code alphabet, `limit = 248` (rejection rate ~3%; negligible cost). [HIGH confidence — standard CSPRNG idiom]

### Pitfall 10: SvelteKit `cookies.delete` also requires path (SEC-03)

When deleting on logout, mirror the path: `cookies.delete('session', { path: '/' })`. Otherwise the delete may target a sub-path and the cookie persists for the root path.

## Code Examples

Verified patterns from official sources or existing codebase:

### SEC-01 + REL-02: Fallback transport with env-var-driven URL list

```typescript
// src/lib/server/accessCodes.ts (combined SEC-01 + REL-02)
// Source: ctx7 /wevm/viem fallback transport docs
import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { networks } from '$lib/config/networks';

const PRIMARY_RPC_URL = env.BASE_RPC_URL;
if (!dev && !PRIMARY_RPC_URL) {
  throw new Error('[accessCodes] BASE_RPC_URL required in production');
}

const RPC_URLS = (
  PRIMARY_RPC_URL ? [PRIMARY_RPC_URL] : []
).concat(networks[0].fallbackRpcUrls);

const basePublicClient = createPublicClient({
  chain: base,
  transport: fallback(
    RPC_URLS.map((url) => http(url)),
    { retryCount: 2, retryDelay: 200, rank: false }
  )
});

// verifyMessage call unchanged — fallback transport is transparent to the action
export async function verifyWalletSignature(address: string, message: string, signature: `0x${string}`): Promise<boolean> {
  const start = Date.now();
  try {
    const valid = await basePublicClient.verifyMessage({ address: address as `0x${string}`, message, signature });
    recordRpcAttempt({ rpc_url: 'fallback-chain-base', fn: 'verifyWalletSignature', ok: true, status_or_error: valid ? 'verified' : 'mismatch', duration_ms: Date.now() - start });
    return valid;
  } catch (error) {
    const status_or_error = error instanceof Error ? error.message : 'Unknown verification error';
    recordRpcAttempt({ rpc_url: 'fallback-chain-base', fn: 'verifyWalletSignature', ok: false, status_or_error, duration_ms: Date.now() - start });
    await reportChainExhausted({ fn: 'verifyWalletSignature', attempts: [{ rpc_url: 'fallback-chain-base', status_or_error }] });
    return false;
  }
}
```

### SEC-01: Client-side env-var read

```typescript
// src/lib/config/networks.ts (post-SEC-01)
// Source: existing $env/dynamic/public pattern from src/routes/+layout.svelte:5
import { env as publicEnv } from '$env/dynamic/public';

const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';  // dev fallback to public RPC

export const networks: Network[] = [{
  // ...
  rpcUrl: PRIMARY_RPC,
  fallbackRpcUrls: [
    'https://base-rpc.publicnode.com',
    PRIMARY_RPC,                            // duplicated as fallback — OK; simpler than de-dup
    'https://base.llamarpc.com',
    'https://base.meowrpc.com',
    'https://base-mainnet.public.blastapi.io',
    'https://gateway.tenderly.co/public/base'
  ],
  // ...
}];
```

```typescript
// src/lib/clients/raindex.ts (post-SEC-01)
// SETTINGS_YAML is hand-maintained; interpolate the public RPC env var
import { env as publicEnv } from '$env/dynamic/public';

const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';

const SETTINGS_YAML = `version: 5
networks:
  base:
    rpcs:
      - ${PRIMARY_RPC}
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: ...
...`;
```

### SEC-02: Module-load throw

```typescript
// src/lib/server/auth.ts (post-SEC-02)
// Source: src/routes/api/cron/snapshots/+server.ts:45 precedent
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.SESSION_SECRET) {
  throw new Error('[auth] SESSION_SECRET required in production');
}
const SESSION_SECRET = env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function createSessionToken(timestamp: number): string {
  const user = env.BASIC_AUTH_USER || '';
  const pass = env.BASIC_AUTH_PASS || '';
  const data = `${timestamp}-${user}:${pass}-${SESSION_SECRET}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}
// ...
```

### SEC-05: CSPRNG-backed access code with rejection sampling

```typescript
// src/lib/server/accessCodes.ts (post-SEC-05)
// Source: signatureChallenge.ts:58-60 precedent + standard rejection-sampling idiom
import crypto from 'crypto';

function pickFromAlphabet(alphabet: string): string {
  const n = alphabet.length;
  const limit = Math.floor(256 / n) * n;
  while (true) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < limit) return alphabet[byte % n];
  }
}

export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 32 chars (preserved verbatim)
  const part = (length: number) =>
    Array.from({ length }, () => pickFromAlphabet(chars)).join('');
  return `ST0X-${part(4)}-${part(4)}`;
}
```

```typescript
// src/lib/server/referrals.ts (post-SEC-05)
import crypto from 'crypto';

function pickFromAlphabet(alphabet: string): string {
  const n = alphabet.length;
  const limit = Math.floor(256 / n) * n;
  while (true) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < limit) return alphabet[byte % n];
  }
}

export function generateReferralCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';  // 31 chars (preserved verbatim)
  const part = Array.from({ length: 6 }, () => pickFromAlphabet(chars)).join('');
  return `st0x-ref-${part}`;
}
```

### SEC-06: Tier definition + endpoint wrap

```typescript
// src/lib/server/rateLimit.ts (MOD — add tier)
export const tieredLimits: Record<string, TieredRateLimitConfig> = {
  rewards: { /* unchanged */ },
  accessCheck: { /* unchanged */ },
  snapshotsPreview: {
    anonymous: { windowMs: 60 * 1000, maxRequests: 1 },
    authenticated: { windowMs: 60 * 1000, maxRequests: 3 }
  }
};
```

```typescript
// src/routes/api/snapshots/preview/+server.ts (MOD — SEC-06)
import { applyTieredRateLimit } from '$lib/server/rateLimit';
// existing imports...

export const GET: RequestHandler = async ({ url, request, cookies }) => {
  // Tiered rate-limit (heaviest tier per D-03)
  const sessionId = cookies.get('session');  // Phase 3 / SEC-03 cookie name
  const wallet = sessionId ? (await readSession(sessionId))?.walletAddress : null;
  const rateLimitResponse = await applyTieredRateLimit(request, 'snapshotsPreview', 'snapshots-preview', wallet);
  if (rateLimitResponse) return rateLimitResponse;
  // ... existing handler body unchanged
};
```

```typescript
// src/routes/api/snapshots/generate/+server.ts (MOD — SEC-06)
import { requireAdmin } from '$lib/server/adminAuth';
// existing imports...

export const POST: RequestHandler = async ({ request, cookies }) => {
  const guard = await requireAdmin(request, cookies, 'snapshots-generate');
  if (guard) return guard;
  // ... existing POST body unchanged
};
```

### SEC-07: VERCEL_ENV-based fail-closed

```typescript
// src/lib/server/accessCodes.ts (MOD — SEC-07, replaces verifyCaptcha at lines 88-114)
import { env } from '$env/dynamic/private';

export async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = env.HCAPTCHA_SECRET;
  if (!secret) {
    // Fail closed everywhere except local development (Vercel preview is "preview", not "development")
    if (env.VERCEL_ENV !== 'development') {
      console.error('[accessCodes] HCAPTCHA_SECRET not configured (VERCEL_ENV=' + env.VERCEL_ENV + ')');
      return false;
    }
    console.warn('[accessCodes] HCAPTCHA_SECRET not configured, skipping in development');
    return true;
  }
  try {
    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token })
    });
    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}
```

[Source: ctx7 /websites/vercel VERCEL_ENV docs — values are 'production' | 'preview' | 'development']

### REL-03: Vendored registry URL

```typescript
// src/lib/services/orderDeployment.ts (MOD — REL-03)
// Pinned commit constant + GitHub-raw URL DELETED
import { env as publicEnv } from '$env/dynamic/public';

const REGISTRY_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry';

let registryPromise: Promise<DotrainRegistryInstance> | null = null;
async function getRegistry(): Promise<DotrainRegistryInstance> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const DotrainRegistry = await getDotrainRegistry();
      const result = await DotrainRegistry.new(REGISTRY_URL);
      if (result.error) throw new Error(result.error.readableMsg);
      return result.value;
    })().catch((err) => { registryPromise = null; throw err; });
  }
  return registryPromise;
}
// rest of file unchanged
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded API keys in source | Env vars (`$env/dynamic/{public,private}` for SvelteKit; `process.env` for Node) | Standard for ~10+ years | SEC-01: trivial swap; the hardcoding is a pre-existing tech-debt entry, not a recent regression |
| Stateless CSRF tokens (HMAC + timestamp) | Session-bound CSRF via double-submit-cookie | OWASP recommendation since ~2010 | SEC-04: csrf.ts pre-Phase-3 was stateless; OWASP CSRF Cheat Sheet recommends session-bound for highest assurance |
| Client-set cookie as auth proof | Server-issued HttpOnly + Secure + SameSite session cookie tied to verified signature | OWASP since ~2015; "SIWE" (Sign-In With Ethereum, EIP-4361) since 2022 | SEC-03: existing wallet-address cookie is the entire footgun |
| `Math.random()` for security tokens | `crypto.randomBytes()` | Standard since Node 0.x | SEC-05: legacy convenience-over-security |
| `process.env.NODE_ENV === 'production'` for env detection on Vercel | `env.VERCEL_ENV` | Vercel docs since ~2020 | SEC-07: NODE_ENV is `'production'` on previews + production both; VERCEL_ENV distinguishes |
| Fetching pinned-commit content from GitHub raw at runtime | Vendor-into-deploy + version-locked refresh | Standard since ~2010 (don't depend on third-party CDN for runtime) | REL-03: existing code took the convenience shortcut |
| Single-RPC call without retry | Per-RPC retry + fallback chain (viem `fallback`) | Standard since ~2020 (multi-RPC redundancy) | REL-01 + REL-02: existing code did fallback but no retry; +1 dimension to add |

**Deprecated/outdated:**
- Stateless CSRF tokens that anyone can mint and use — replaced by session-bound HMAC.
- `process.env.NODE_ENV` for Vercel-specific env detection — replaced by `VERCEL_ENV`.
- Naive `Math.random()` for any security-relevant string generation — replaced by `crypto.randomBytes` + rejection sampling for arbitrary alphabets.
- Single-attempt fail-silent RPC fallback — replaced by retry + chain-exhaustion alerting.
- Reading runtime config from third-party CDNs at request time — replaced by build-time vendoring or static-asset hosting.

## Assumptions Log

> Claims tagged `[ASSUMED]` — researcher and discuss-phase use this to flag items the user must confirm before they become locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "heaviest existing tier" for SEC-06 (D-03) means heaviest-restriction (1-3 req/min, NOT 60-120 req/min) | Pattern 3 / SEC-06 | LOW — preview endpoints take 10-60s wall time per request; restrictive tier is correct. If the user meant "most permissive," the planner can flip the values. |
| A2 | Sliding-refresh frequency = once per 24h is acceptable UX | Pattern 1 / D-04a | LOW — KV write is ~5-10ms; doing it on every request is fine but adds load. 24h cap is a tradeoff between accuracy of "lastSeenAt" and KV write rate. The planner can tune to once-per-hour or once-per-request without functional impact. |
| A3 | viem version 2.40.3 (transitive via wagmi 2.22.1) supports `fallback([http(url)])` with `retryCount` | Pattern 3 / Pattern 5 | LOW — `fallback` Transport with `retryCount + retryDelay` has been part of viem since at least 1.x per ctx7 docs. If a runtime issue surfaces, planner can confirm with `npm view viem@2.40.3 versions` or bump viem (transitive — would require wagmi bump too). |
| A4 | CSRF_SECRET aliases to SESSION_SECRET in production (i.e., Vercel project does NOT have a separate CSRF_SECRET env var) | Runtime State Inventory | LOW — current csrf.ts:10 reads `env.SESSION_SECRET`, not `env.CSRF_SECRET`. SEC-02 must either preserve this aliasing or add a new env var. Recommend preserving (drop the fallback string only). User should confirm the Vercel project env-var list before SEC-02 deploy. |
| A5 | The single-instance KV-backed session storage has acceptable read latency on the auth path | Standard Stack / Alternatives Considered | LOW — Vercel KV reads are ~5-10ms intra-region. The existing access-check endpoint at `routes/api/access/check/+server.ts` already does a per-request KV read (cached 5min). One more KV read per authenticated request = same ballpark. If latency surfaces, in-memory L1 cache is a Phase 4 add-on. |
| A6 | The Rain registry refresh cadence is "rare" (months between bumps), not "weekly" | Pattern 5 / REL-03 | MEDIUM — vendoring + redeploy is friction-medium for weekly updates. If the team needs weekly bumps, the manual `rsync + commit + deploy` becomes a chore. The CONTEXT discretion area allows compiled-in or git-submodule alternatives. **User should confirm the rain.strategies bump cadence.** Phase 3 ships with `static/registry/`; if cadence proves too slow, Phase 4 can add automation. |
| A7 | The `/registry` same-origin URL works in dev (`npm run dev`) | Pattern 5 / REL-03 | LOW — Vite dev server serves `static/` at root by default in SvelteKit. Confirm at planning time with a smoke test. |
| A8 | The post-deploy one-time signature prompt is acceptable for ALL existing logged-in users (no whitelist needed) | Pattern 6 / D-04 | LOW — D-04 explicitly says "Existing logged-in users get a one-time wallet signature prompt on their next visit." User confirmed in CONTEXT discussion. |
| A9 | None of the SEC-* / REL-* surfaces touch `marketOrderExecution.ts`, `transaction.ts`, `orderPerspective.ts`, or any TRADE-* lockdown file | Cross-cutting gates | HIGH confidence — verified via grep (`grep -rn "marketOrderExecution\|orderPerspective" src/lib/server/{auth,csrf,accessCodes,referrals,rateLimit}.ts src/routes/api/snapshots/`) returns 0 hits. Phase 3 is server-side hardening; trade-execution refactor surface is not in scope. |
| A10 | The `OBSERVABILITY_ALERT_TELEGRAM_*` env vars are already set in Vercel project (per Phase 1 evidence) | REL-01 alert delivery | LOW — Plan 01-06 close note in STATE.md says alerts.ts shipped with Telegram; if the env var were missing, alerts would silently no-op, but REL-01 chain-exhaustion alerts would not fire. Recommend that 03-RUNBOOK.md include a check step to confirm both env vars are still set. |

**Empty-table heuristic:** Phase 3 is heavy on `[VERIFIED]` claims (existing code patterns + ctx7 docs). The 10 `[ASSUMED]` items above are mostly UX-tuning assumptions or operational-cadence guesses, not security-critical assumptions.

## Open Questions

1. **What is the Vercel project's current SESSION_SECRET / CSRF_SECRET status?**
   - What we know: csrf.ts reads `env.SESSION_SECRET || 'default-csrf-secret-change-in-production'`. So either both are set, or only SESSION_SECRET is set and CSRF_SECRET is the alias.
   - What's unclear: Whether the deploy has been silently using the `'default-csrf-secret-change-in-production'` fallback string this whole time (in which case SEC-02 deploy crashes the lambda).
   - Recommendation: 03-RUNBOOK.md MUST include a pre-deploy step: "Confirm `SESSION_SECRET` is set in Vercel project (production + preview); if `CSRF_SECRET` is set separately, keep both; otherwise SEC-02 will continue using SESSION_SECRET as the source-of-truth."

2. **What happens to existing users mid-session at the SEC-03+04 deploy moment?**
   - What we know: D-04 says "Existing logged-in users get a one-time wallet signature prompt on their next visit." Implementation: post-deploy, `hooks.server.ts` reads `cookies.get('session')` which returns undefined, so `getWalletFromRequest` returns null, so `requiresWalletRegistration` paths redirect to `/access` (or 401 for API).
   - What's unclear: Does the trade page's TanStack Query cache get cleared on the redirect-to-access? If not, on next visit the cache may serve stale data with the new session.
   - Recommendation: Wave 6 manual smoke test (D-04) catches this; if observed, add `queryClient.clear()` to the access-page mount.

3. **Should the existing 24h `auth.ts:SESSION_DURATION_MS` for basic-auth admin sessions also become sliding?**
   - What we know: D-04a explicitly says the existing 24h is for the basic-auth flow and is unchanged.
   - What's unclear: Whether admin users would also benefit from sliding session UX.
   - Recommendation: Out of scope for Phase 3. If future admin UX requires it, Phase 4+.

4. **Does the existing OBS-04 grep gate `'alchemy-base-mainnet'` survive REL-02?**
   - What we know: CONTEXT says "researcher updates the label or replaces it with the actual `rpc_url` value at instrumentation time."
   - What's unclear: How tight the OBS-04 grep gate is on the literal label.
   - Recommendation: Replace with `'fallback-chain-base'` (single stable identifier per logical call). The OBS-04 grep gate from Phase 1 should be lenient on the exact label — if 03-08 grep verifies the FORM (a `recordRpcAttempt` call exists with some `rpc_url:` arg), not the literal string, the rename is fine. Verify at planning time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 3 work | ✓ | Pinned via Nix flake (>= 19 per OBS-02 evidence) | — |
| viem (transitive) | REL-02 fallback transport | ✓ | 2.40.3 | None — fallback is core to viem since 1.x |
| `redis` package | All KV access (SEC-03 sessions, signatureChallenge, rate-limit) | ✓ | 5.10.0 | In-memory dev fallback in `getKv()` |
| Vercel KV (Redis URL) | KV-backed sessions, rate-limit | ✓ in production (per Phase 1 evidence) | — | Dev: in-memory; production: required |
| Vercel project env: `SESSION_SECRET` | SEC-02 fail-closed | Assumed ✓ (need to verify pre-deploy) | — | Pre-deploy verification step in 03-RUNBOOK.md |
| Vercel project env: `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` | SEC-01 + REL-02 | ✗ NEW | — | Must be provisioned before SEC-01 deploy |
| Vercel project env: `OBSERVABILITY_ALERT_TELEGRAM_*` | REL-01 chain-exhaustion alerts | Assumed ✓ (per Phase 1 D-17) | — | Pre-deploy verification step |
| Vercel project env: `HCAPTCHA_SECRET` | SEC-07 | ✓ (existing) | — | — |
| `static/registry/` directory | REL-03 | ✗ NEW | — | Must be created + populated from rain.strategies pinned commit before Plan 03-07 |

**Missing dependencies with no fallback:**
- `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` (NEW for SEC-01) — cannot deploy SEC-01 without these.
- `static/registry/` (NEW for REL-03) — cannot deploy REL-03 without populating.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

> `workflow.nyquist_validation: true` per `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 + jsdom 24.1.0 + @testing-library/svelte 5.1.0 |
| Config file | `vite.config.js` (test section, lines 24-32) + `vitest-setup.ts` |
| Quick run command | `npm test -- --run <file-pattern>` (example: `npm test -- --run accessCodes.test.ts`) |
| Full suite command | `npm test -- --run` (existing 523-test suite from Phase 2 close) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | env-var read replaces literal Alchemy URL in 3 sites | grep | `! grep -r "y3BXawVv5uuP" src/` | ✅ phase-exit grep gate |
| SEC-02 | Module-load throw on missing `SESSION_SECRET` in production | unit | `npm test -- --run auth.test.ts` (NEW test file or extend existing) | ❌ Wave 0 — auth.test.ts does not exist |
| SEC-02 | Same for csrf.ts | unit | `npm test -- --run csrf.test.ts` | ❌ Wave 0 — csrf.test.ts does not exist |
| SEC-03 | createSession + readSession + maybeRefreshSession round-trip | unit | `npm test -- --run walletSession.test.ts` | ❌ Wave 0 — module is NEW |
| SEC-03 | hooks.server.ts session cookie read replaces wallet-address cookie | integration | (manual smoke test per D-04 VALIDATION); TEST-01 in Phase 4 | ⚠️ HUMAN-UAT in Wave 6 + Phase 4 TEST-01 follow-up |
| SEC-04 | generateCsrfTokenForSession + validateCsrfTokenForSession round-trip | unit | `npm test -- --run csrf.test.ts` | ❌ Wave 0 |
| SEC-04 | CSRF token rejection when session-id changes | unit | `npm test -- --run csrf.test.ts` | ❌ Wave 0 |
| SEC-05 | generateAccessCode produces correct format + uses crypto.randomBytes | unit | `npm test -- --run accessCodes.test.ts` (existing file; ADD test) | ✅ accessCodes.test.ts exists |
| SEC-05 | generateReferralCode same | unit | `npm test -- --run referrals.test.ts` | ❌ Wave 0 — referrals.test.ts does not exist |
| SEC-05 | Rejection sampling has no modulo bias | unit | `npm test -- --run accessCodes.test.ts` (statistical test on 10000 samples) | ✅ |
| SEC-06 | applyTieredRateLimit rejects on 4th preview request | unit | `npm test -- --run rateLimit.test.ts` (existing) | ✅ |
| SEC-06 | requireAdmin guards POST /api/snapshots/generate | integration | manual smoke (POST without admin → 401; with admin → 200) | ⚠️ HUMAN-UAT |
| SEC-07 | verifyCaptcha returns false on Vercel preview without HCAPTCHA_SECRET | unit | `npm test -- --run accessCodes.test.ts` | ✅ |
| REL-01 | callRpc retries each RPC then falls through; throws on chain exhaustion | unit | `npm test -- --run generator.test.ts` | ❌ Wave 0 — generator.test.ts does not exist |
| REL-01 | getBlockNumberForTimestamp throws on full chain exhaustion (does NOT silently use latestBlock) | unit | `npm test -- --run generator.test.ts` | ❌ Wave 0 |
| REL-02 | verifyWalletSignature with fallback transport tries each RPC | unit | `npm test -- --run accessCodes.test.ts` (existing; ADD test with mocked viem fallback) | ✅ |
| REL-03 | DotrainRegistry.new('/registry') resolves in test environment | smoke | manual: `npm run build && npm run preview` and inspect order deployment flow | ⚠️ HUMAN-UAT in Wave 7 |

### Sampling Rate

- **Per task commit:** `npm test -- --run <relevant-test-file>` (specific to plan being executed; under 5s)
- **Per wave merge:** `npm test -- --run` (full 523-test suite + new Phase 3 tests; ~30s)
- **Phase gate:** Full suite green + `npm run check` (svelte-check baseline = 3 errors) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/server/auth.test.ts` — NEW: covers SEC-02 module-load throw, createSessionToken stability across module reload (smoke)
- [ ] `src/lib/server/csrf.test.ts` — NEW: covers SEC-02 module-load throw + SEC-04 session-bound HMAC round-trip + cross-session rejection
- [ ] `src/lib/server/walletSession.test.ts` — NEW: covers SEC-03 createSession / readSession / maybeRefreshSession / deleteSession + 30-day expiry + sliding refresh threshold
- [ ] `src/lib/server/referrals.test.ts` — NEW: covers SEC-05 generateReferralCode CSPRNG + format preservation
- [ ] `src/lib/server/snapshots/generator.test.ts` — NEW: covers REL-01 callRpc retry + chain exhaustion + getBlockNumberForTimestamp throw
- [ ] Extend `src/lib/server/accessCodes.test.ts` — ADD: SEC-05 (CSPRNG + rejection sampling), SEC-07 (VERCEL_ENV detection), REL-02 (fallback transport via mocked viem)

*(7 NEW or extended test files. Test infrastructure is already present — no framework install needed; follow existing pattern of `*.test.ts` next to the module under `src/lib/server/`.)*

## Project Constraints (from CLAUDE.md)

CLAUDE.md is in active **drift-warning mode** per CONTEXT canonical_refs (CLAUDE.md aspirationally describes multi-chain + AA, but only single-chain Base 8453 + wagmi+Dynamic exist in code). Phase 3 honors the existing drift-warning by treating `.planning/codebase/` as ground truth. Constraints from CLAUDE.md that ARE accurate and apply to Phase 3:

- **`<script lang="ts">` JSDoc does NOT work** — use typed constants or `as` casts. (No Phase 3 work touches `<script>` blocks; constraint preserved.)
- **Map constructor types with `flatMap`** — annotate the callback return type as `[string, string][]`. (No Phase 3 work uses this pattern.)
- **Token address variants** — use `getTokenByAnyAddress()` not `TOKENS.find()`. (No Phase 3 work touches token resolution.)
- **`staleTime: Infinity`** — TanStack Query default; Phase 3 must NOT change. (Server-side work doesn't touch the queryClient; preserved.)
- **Order Semantics — INPUT/OUTPUT Perspective** — the prose accurately describes the bug class TRADE-01 locked down. (No Phase 3 work touches `marketOrderExecution.ts` or `orderPerspective.ts`; preserved.)
- **`src/lib/server/` is server-only** — no imports from `.svelte` or browser-only files. (Phase 3 NEW files `walletSession.ts` MUST live under `src/lib/server/` — verified.)
- **`.tsx` files only allowed in `src/lib/dynamic/`** — Phase 3 adds zero `.tsx` files; preserved.

CLAUDE.md sections to IGNORE per drift-warning:
- Multi-chain support tables (Base/Arbitrum/Optimism/Ethereum) — only Base exists.
- Account abstraction (Rhinestone SDK / EIP-7702 / `account-abstraction/` directory) — none of this exists.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` per `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES | Server-issued session cookie tied to verified EIP-191 wallet signature (SEC-03); `signatureChallenge.ts` purpose enum + atomic GET+DEL Lua script for nonce consumption (existing precedent) |
| V3 Session Management | YES | HttpOnly + Secure + SameSite=Strict cookies (SEC-03); 30-day absolute expiry with sliding refresh (D-04a); explicit logout endpoint that deletes KV record + clears cookie; KV-backed sessions enable admin invalidation |
| V4 Access Control | YES | `requireAdmin` (SEC-06 POST snapshots/generate); `applyTieredRateLimit` (SEC-06 preview endpoints); `requiresWalletRegistration` in hooks.server.ts (existing, post-SEC-03 reads from session cookie not wallet-address cookie) |
| V5 Input Validation | YES | Address format check `/^0x[a-fA-F0-9]{40}$/` (existing pattern at hooks.server.ts:273, accessCodes.ts:160); session-id format `/^[a-f0-9]{64}$/` (NEW for SEC-03); CSRF token bytes (NEW for SEC-04) |
| V6 Cryptography | YES | `crypto.randomBytes()` for sessionId + access codes + referral codes (SEC-03 + SEC-05); `crypto.createHmac('sha256', SECRET)` for CSRF token + admin session token (SEC-04 + existing); `crypto.timingSafeEqual` for HMAC compare (existing pattern); never hand-roll any of these — Node built-ins only |
| V7 Error Handling & Logging | YES | OBS-02 pino structured logs (already shipped Phase 1); OBS-03 take-order failure transcript (already shipped Phase 1); OBS-04 RPC failure metrics + chain-exhausted alerts (already shipped Phase 1); REL-01 reuses `notifyChainExhausted` for chain-exhaustion |
| V12 API & Web Service | YES | CORS allowlist (existing hooks.server.ts:34-105); CSP allowlist (existing); rate-limit headers (existing); hCaptcha verification fail-closed on production + preview (SEC-07); CSRF double-submit-cookie binding (SEC-04) |
| V14 Configuration | YES | All secrets via `$env/dynamic/private`; module-load fail-closed pattern (SEC-01 + SEC-02); committed-key removal + rotation procedure (SEC-01 + D-02a); vendored-vs-runtime-fetch (REL-03 vendor) |

### Known Threat Patterns for Svelte 4 + SvelteKit 2 + Vercel + viem

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cookie spoofing (client-set wallet-address cookie) | Spoofing | Server-issued HttpOnly cookies bound to verified signature (SEC-03) |
| Stateless CSRF tokens forgeable by anyone with the secret | Tampering | Session-id-bound HMAC tokens (SEC-04 double-submit-cookie) |
| Hardcoded API keys leaked in JS bundle | Information Disclosure | Env-var-driven URL with quota-aware rotation (SEC-01 + D-02a) |
| RPC chain silent fallback to latestBlock | Tampering / Repudiation | Per-RPC retry + throw on chain exhaustion (REL-01) |
| Single-RPC EIP-1271 verification fails on Alchemy hiccup | Denial-of-Service | Fallback chain with retry (REL-02) |
| GitHub raw rate-limit blocks order deployment | Denial-of-Service | Vendor registry into deploy unit (REL-03) |
| Modulo bias in CSPRNG-derived codes | Cryptographic weakness | Rejection sampling (SEC-05) |
| hCaptcha bypass on Vercel preview share traffic with production | Bypass | VERCEL_ENV-driven fail-closed (SEC-07) |
| Session-id replay after KV record deletion | Repudiation | KV-backed session check (record absence = invalid; SEC-03 admin invalidation) |
| Per-request wallet signature regression | Usability + Auth | Hard-rejected by D-04b; CSRF is HTTP-level not signature-level |

## Sources

### Primary (HIGH confidence)
- ctx7 `/wevm/viem` — Fallback Transport docs (retryCount, retryDelay, rank options); verifyMessage docs (EIP-191 + EIP-1271 + EIP-6492). Used for Pattern 3, Pattern 5, REL-02 code example.
- ctx7 `/sveltejs/kit` — cookies.set / cookies.delete docs (path requirement in SvelteKit 2); hooks.server.ts handle / locals patterns. Used for Pattern 1, Pitfall 8.
- ctx7 `/websites/vercel` — VERCEL_ENV system env var (production / preview / development). Used for SEC-07 / Pitfall.
- Existing `src/lib/server/signatureChallenge.ts:58-60` — `crypto.randomBytes(16).toString('hex')` precedent. Used for SEC-03 + SEC-05 patterns.
- Existing `src/lib/server/auth.ts` + `src/lib/server/csrf.ts` — current HMAC + timingSafeEqual patterns. Used for SEC-02 + SEC-04 patterns.
- Existing `src/routes/api/cron/snapshots/+server.ts:45` — module-local `if (!cronSecret && !dev)` pattern. Used for SEC-02 example.
- Existing `src/lib/utils/retry.ts` — `withRetry(fn, maxRetries, delayMs)` exponential backoff. Used for REL-01 example.
- Existing `src/lib/server/rateLimit.ts:311-322,333-375` — `tieredLimits` map + `applyTieredRateLimit`. Used for SEC-06 example.
- Existing `src/lib/server/adminAuth.ts` — `requireAdmin` returns Response or null. Used for SEC-06 example.
- Existing `src/lib/server/alerts.ts` + `src/lib/server/rpcMetrics.ts` — Telegram alert delivery + RPC metrics. Used for REL-01 alerting.

### Secondary (MEDIUM confidence)
- OWASP CSRF Prevention Cheat Sheet — double-submit-cookie pattern. Used for Pattern 2.
- Vercel KV docs — read/write latency ~5-10ms intra-region. Used for Alternatives Considered.
- ctx7 `/llmstxt/vercel_llms_txt` — VERCEL_ENV system env var canonical name and possible values. Used for SEC-07 example.

### Tertiary (LOW confidence — none in this phase)
None. Every recommendation is HIGH confidence backed by Context7 docs or existing codebase patterns.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every library is already installed; APIs verified via ctx7 docs and existing usage.
- Architecture: HIGH — patterns are direct extensions of existing code (signatureChallenge.ts purpose enum, viem fallback transport, withRetry helper, applyTieredRateLimit tier map).
- Pitfalls: HIGH — pitfalls 1, 4, 5, 8 are concrete (path-required, tier missing, modulo bias, cron NOT calling /api/snapshots/generate); pitfalls 2, 3, 9 are general best-practices.
- Code examples: HIGH — synthesized from existing code + ctx7 docs; no speculative APIs.
- Cross-cutting gates: HIGH — verified by grep that none of the Phase 3 surfaces touch the carry-forward Phase 2 lockdown files.

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days for stable libraries; viem + redis + SvelteKit are mature). Refresh sooner if any of the following changes:
- viem major version bump (currently 2.40.3 transitive)
- SvelteKit 3 release
- Vercel changes the VERCEL_ENV semantics

---

*Phase 3 Research — production-grade hardening across SEC-01..07 + REL-01..03; 9 waves, atomic-flip session cookie at Wave 6 with 30-day sliding session per CONTEXT D-04, vendored Rain registry under static/registry/, viem fallback transport with retryCount for RPC reliability, all carry-forward Phase 2 cross-cutting gates preserved.*
