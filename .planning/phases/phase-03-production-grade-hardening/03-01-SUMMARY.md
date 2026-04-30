---
phase: 03-production-grade-hardening
plan: 01
subsystem: infra
tags: [phase-3, sec-01, env-vars, alchemy-rotation, base-rpc, viem, sveltekit-env]

requires:
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "OBS-04 instrumentation surface (rpcMetrics.ts recordRpcAttempt + reportChainExhausted) and CRON_SECRET module-load fail-closed precedent that this plan mirrors"
  - phase: 02-trade-execution-backbone-refactor
    provides: "Phase 2 cross-cutting gates (TRADE-01 IO lockdown, TRADE-02 cycle severance, failWith count >=12, EMERGENCY_RATIO_MULTIPLIER = 0, svelte-check baseline = 3 errors, staleTime: Infinity) preserved unchanged"
provides:
  - "PUBLIC_BASE_RPC_URL client-side env var read pattern in networks.ts and raindex.ts (consumed by entire client bundle for Base mainnet RPC)"
  - "BASE_RPC_URL server-side env var read pattern in accessCodes.ts and referrals.ts with module-load fail-closed throw guard"
  - "Foundation for REL-02 (Wave 5 / Plan 03-07) to read BASE_RPC_URL and networks[0].fallbackRpcUrls when wrapping the verifyWalletSignature client in viem's fallback([...]) transport"
  - ".env.example documentation for both env vars so contributors know what to set"
affects: [phase-3-wave-5-rel-02, phase-3-wave-8-rel-03, phase-3-runbook]

tech-stack:
  added: []
  patterns:
    - "Client-side PUBLIC_* env var with public-RPC dev fallback for `npm run dev` operability without env provisioning"
    - "Server-side env var with module-top throw guard mirroring CRON_SECRET pattern (cold-start failure visible in Vercel Logs, not lazy first-request)"

key-files:
  created: []
  modified:
    - "src/lib/config/networks.ts (client-bundle network config — rpcUrl + fallbackRpcUrls now read PUBLIC_BASE_RPC_URL)"
    - "src/lib/clients/raindex.ts (Raindex SDK SETTINGS_YAML interpolates PUBLIC_BASE_RPC_URL)"
    - "src/lib/server/accessCodes.ts (signature-verification basePublicClient now reads BASE_RPC_URL with !dev throw)"
    - "src/lib/server/referrals.ts (Rule 2 deviation auto-fix — third basePublicClient site missed in plan files list)"
    - ".env.example (documents both PUBLIC_BASE_RPC_URL and BASE_RPC_URL per D-02)"

key-decisions:
  - "Auto-fixed referrals.ts under Rule 2 — plan listed 3 files but phase-exit gate `! grep -r 'y3BXawVv5uuP' src/` requires complete key removal across src/; referrals.ts had a fourth basePublicClient site with the same hardcoded Alchemy URL. Same env-var + dev-fallback + module-load throw pattern applied for consistency."
  - "Single Alchemy key on both sides per D-02 (PUBLIC_BASE_RPC_URL = BASE_RPC_URL value-wise) — operational simplicity over marginal blast-radius reduction; the bundle key is exposed regardless."
  - "Dev fallback URL `https://base-rpc.publicnode.com` keeps `npm run dev` working without env provisioning. Production never reaches the fallback because the !dev throw guards run BEFORE the `||` evaluates at lambda boot."
  - "OBS-04 `'alchemy-base-mainnet'` rpc_url label preserved unchanged in verifyWalletSignature — REL-02 (Wave 5) updates the label when fallback transport lands; preserving it now keeps Phase 1 alert/log search stability."
  - "Duplicated PRIMARY_RPC entry inside fallbackRpcUrls is intentional (per RESEARCH §SEC-01) — viem's fallback transport tries each entry once, so falling back to itself is harmless and simpler than runtime de-dup."

patterns-established:
  - "PUBLIC_* + dev-fallback for client-bundle env vars: `publicEnv.PUBLIC_X || 'public-rpc-fallback'`"
  - "Server-side fail-closed at module top: read env var → `if (!dev && !X) throw` → use X with dev fallback in the consumer"
  - "Module-load throw vs first-request throw: throw lives at module top so cold start surfaces in Vercel Logs at boot rather than at first request (Pitfall 2)"

requirements-completed: [SEC-01]

duration: ~3min
completed: 2026-04-30
---

# Phase 3 Plan 01: SEC-01 Alchemy Env Vars Summary

**Removed hardcoded Alchemy API key (`y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9`) from all 4 sites under src/ and replaced with `PUBLIC_BASE_RPC_URL` (client) + `BASE_RPC_URL` (server) reads, with module-load fail-closed throw guards on the server path mirroring the CRON_SECRET pattern**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-30T08:21:01Z
- **Completed:** 2026-04-30T08:24:06Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 5 (4 src + .env.example)

## Accomplishments

- Client-bundle network config (`networks.ts`) and Raindex SETTINGS_YAML (`raindex.ts`) now read `PUBLIC_BASE_RPC_URL` from `$env/dynamic/public` with `https://base-rpc.publicnode.com` dev fallback
- Server-side signature-verification client in `accessCodes.ts` reads `BASE_RPC_URL` from `$env/dynamic/private` with module-top throw guard `if (!dev && !PRIMARY_RPC_URL) throw new Error('[accessCodes] BASE_RPC_URL required in production')`
- Phase-exit gate `! grep -r "y3BXawVv5uuP" src/` returns 0 hits across the entire src/ tree (committed Alchemy key fully removed; will be revoked in Vercel side post-deploy per D-02a rotation procedure)
- `.env.example` documents both `PUBLIC_BASE_RPC_URL=` and `BASE_RPC_URL=` so contributors know what to set
- All Phase 2 cross-cutting gates verified green: TRADE-01 IO lockdown, TRADE-02 cycle severance (`marketOrderExecution.ts` has 0 imports from `$lib/stores/transaction`), `failWith()` count = 16 (≥12), `EMERGENCY_RATIO_MULTIPLIER` count = 0, svelte-check baseline = 3 errors preserved, staleTime: Infinity preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-01 client-side env-var swap (networks.ts + raindex.ts)** — `70520c8` (refactor)
2. **Task 2: SEC-01 server-side env-var swap with module-load fail-closed (accessCodes.ts + referrals.ts) + .env.example** — `e9cae57` (refactor)

## Files Created/Modified

- `src/lib/config/networks.ts` — client-bundle network config; added `import { env as publicEnv } from '$env/dynamic/public'`, defined `PRIMARY_RPC` const above `networks` array, replaced 2 hardcoded URL literals (rpcUrl on line 48 + duplicate inside fallbackRpcUrls on line 51) with `PRIMARY_RPC` reference
- `src/lib/clients/raindex.ts` — Raindex SDK settings; added publicEnv import, defined `PRIMARY_RPC` const, replaced literal Alchemy URL inside `SETTINGS_YAML` template literal with `${PRIMARY_RPC}` interpolation; all other YAML fields (chain-id, network-id, currency, subgraphs, metaboards, orderbooks, rainlangs) preserved verbatim
- `src/lib/server/accessCodes.ts` — added `import { dev } from '$app/environment'`, replaced `basePublicClient` definition with env-var read + module-load throw guard + dev fallback URL; OBS-04 instrumentation labels at lines 92, 103, 113 preserved unchanged (REL-02 updates them)
- `src/lib/server/referrals.ts` — same pattern as accessCodes.ts (Rule 2 auto-fix; see Deviations); fourth basePublicClient site that the plan's files list missed
- `.env.example` — appended `PUBLIC_BASE_RPC_URL=` and `BASE_RPC_URL=` entries with comment block referencing D-02 single-key rationale

## Decisions Made

- **Single PRIMARY_RPC const reused inside fallbackRpcUrls** — simpler than runtime de-dup logic; viem's fallback transport tries each entry once so falling back to itself is harmless
- **Dev fallback to `https://base-rpc.publicnode.com`** — public RPC chosen for both client and server dev fallback so the same string is consistent across the codebase; production fail-closed throws BEFORE this fallback evaluates
- **Module-top throw chosen over first-request 503** — per RESEARCH Pitfall 2: cold-start crash surfaces in Vercel Logs immediately rather than at first request, faster MTTD for missing env var deploys
- **OBS-04 `'alchemy-base-mainnet'` label preserved unchanged** — REL-02 (Wave 5 / Plan 03-07) is the right place to swap the synthetic label for the real `rpc_url` value when the fallback transport lands; preserving it now means Phase 1 chain-exhausted alert/log searches in Telegram + Vercel Logs continue to work without grep-pattern updates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed fourth Alchemy URL site in referrals.ts**

- **Found during:** Task 2 (post-edit phase-exit grep `! grep -r "y3BXawVv5uuP" src/`)
- **Issue:** Plan's `<files>` field listed 3 files (networks.ts, raindex.ts, accessCodes.ts) but the plan's verification gate (lines 230, 239, 275) requires `! grep -r "y3BXawVv5uuP" src/` returns 0 hits across the ENTIRE src/ tree. After Task 2 the grep still returned 1 hit: `src/lib/server/referrals.ts:17` had its own `basePublicClient` with the same committed Alchemy URL. Closing the SEC-01 contract — the audit finding from CONCERNS.md and the must_haves truth `"The literal Alchemy URL ... does not appear anywhere under src/"` — required removing this fourth occurrence. Leaving it would have failed the phase-exit gate and partially exposed the rotated key.
- **Fix:** Applied the same env-var + dev-fallback + module-load-throw pattern as accessCodes.ts: imported `env` from `$env/dynamic/private` and `dev` from `$app/environment`, defined `PRIMARY_RPC_URL = env.BASE_RPC_URL`, threw at module top in production if missing, used `http(PRIMARY_RPC_URL || 'https://base-rpc.publicnode.com')` in the basePublicClient transport
- **Files modified:** src/lib/server/referrals.ts
- **Verification:** `grep -r "y3BXawVv5uuP" src/` returns 0 hits; `npm run check` baseline = 3 errors (unchanged); `npm test -- --run accessCodes` passes (4 tests). The basePublicClient in referrals.ts is unused in the current codebase (no `verifyMessage` calls in the file) but the import/init code path runs at module load, so the throw guard still fires correctly on missing env.
- **Committed in:** e9cae57 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / SEC-01 contract completion)
**Impact on plan:** Auto-fix necessary to close SEC-01 contract per the plan's own phase-exit gate. No scope creep — same pattern, same file class, satisfies the must_haves truth verbatim. The plan's `<files>` field undercounted by 1; the verification gate was correct.

## Issues Encountered

None during planned work. All svelte-check baseline preserved (3 errors), accessCodes test suite green, no test-suite changes required.

## User Setup Required

None — no external service configuration required for this plan. The actual Alchemy app + key provisioning + Vercel env-var setting + key revocation is the deploy-time operational step documented in 03-RUNBOOK.md (Plan 03-10 / phase-exit). This plan ships the code so the rotation can land on next deploy.

## Next Phase Readiness

- Wave 1 complete; SEC-01 closed structurally. Wave 2 (parallel: SEC-02 / SEC-05 / SEC-07) unblocked.
- REL-02 (Wave 5 / Plan 03-07) can now read `BASE_RPC_URL` from `env` and `networks[0].fallbackRpcUrls` from `$lib/config/networks` to build the viem `fallback([...])` transport. Same env-var both sides per D-02.
- 03-RUNBOOK.md (Plan 03-11 / phase-exit) needs to document: (1) provision new Alchemy app + key, (2) set both env vars in Vercel production+preview to the new URL, (3) deploy this code, (4) verify via OBS-04 logs + browser network tab, (5) revoke old Alchemy key in dashboard.
- All cross-cutting Phase 2 gates green: TRADE-01 lockdown, TRADE-02 cycle severance, failWith count = 16, EMERGENCY_RATIO_MULTIPLIER = 0, svelte-check = 3 errors, staleTime: Infinity.

## Self-Check: PASSED

All claimed files exist on disk; all claimed commit hashes (70520c8, e9cae57) found in git log.

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
