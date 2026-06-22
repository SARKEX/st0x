---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 04
subsystem: observability
tags: [sentry, observability, errors, csp, sourcemaps, pii-scrubbing, sveltekit-hooks]

# Dependency graph
requires: [01-03]
provides:
  - "@sentry/sveltekit@10.50.0 client + server SDK initialised with errors-only config (no Replay/Performance/Feedback)"
  - "Recursive PII scrubber (scrubSentryEvent) at $lib/observability/scrub.ts wired into beforeSend AND beforeBreadcrumb on both tiers"
  - "CSP connect-src extended for *.ingest.sentry.io and *.ingest.us.sentry.io (Pitfall 1)"
  - "Sourcemap upload via sentrySvelteKit Vite plugin gated on !!process.env.SENTRY_AUTH_TOKEN (Pitfall 4)"
  - "src/hooks.client.ts greenfield (NEW) with handleError = Sentry.handleErrorWithSentry"
  - "src/hooks.server.ts handle wrapped in sequence(Sentry.sentryHandle(), existingHandle); handleError exported"
  - ".env.example documents 5 new Sentry env vars"
affects: [01-05, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added:
    - "@sentry/sveltekit@10.50.0"
  patterns:
    - "Three-task split: dep + pure module + tests landed first (Task 1) so the Sentry import surface compiles cleanly before any init code is written; vite plugin + client init second (Task 2); server init + CSP + sequence-wrap last (Task 3). svelte-check stays green at every commit."
    - "Init-gated SDK pattern: Sentry.init({ enabled: !dev && Boolean(env.SENTRY_DSN), ... }) — single boolean toggle so missing DSN in any environment (PR previews, local builds, dev) means a no-op, not a crash. Pairs with autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN on the build-time side."
    - "Recursive PII walker over Sentry event/breadcrumb tree (~20 lines, pure function): single redactString applies SIG_QUERY_RE first (URL form), then SIG_RE (130-hex), then ADDR_RE (40-hex). Walk visits strings in arrays + objects + nested objects. Same scrubber wired into beforeSend AND beforeBreadcrumb (Pitfall 9)."

key-files:
  created:
    - "src/lib/observability/scrub.ts (45 lines — scrubSentryEvent walker; pure, no side effects)"
    - "tests/lib/observability/scrub.test.ts (40 lines — 5 unit tests, all pass)"
    - "src/hooks.client.ts (32 lines — Sentry client init + handleError export)"
  modified:
    - "package.json (@sentry/sveltekit ^10.50.0 added to devDependencies)"
    - "package-lock.json (transitive deps from Sentry SDK)"
    - "vite.config.js (sentrySvelteKit plugin prepended BEFORE sveltekit(); autoUploadSourceMaps gated on SENTRY_AUTH_TOKEN)"
    - "src/hooks.server.ts (Sentry.init at module top; CSP connect-src extended; existingHandle renamed; handle wrapped in sequence; handleError exported)"
    - ".env.example (SENTRY_DSN, PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT placeholders + explanatory comments)"

key-decisions:
  - "init gating uses !dev && Boolean(env.{PUBLIC_,}SENTRY_DSN): dev runs no-op (no test data leaks); missing DSN in prod degrades gracefully (no crash). Sentry plugin's autoUploadSourceMaps mirrors this — gated on !!process.env.SENTRY_AUTH_TOKEN — so PR previews skip upload (Pitfall 4)."
  - "CSP connect-src appended (NOT replaced): preserved every existing entry verbatim (PostHog, Pyth, dynamic, st0x-oracle, etc.); only added *.ingest.sentry.io + *.ingest.us.sentry.io. EU region (*.ingest.de.sentry.io) deferred to deploy-time decision when org region is chosen — operational follow-up below."
  - "handleError callback parameters explicitly typed `{ error: unknown; event: unknown }` to satisfy TypeScript strict mode (svelte-check caught implicit-any errors on first commit; Rule 1 fix in same task before commit)."
  - "Did NOT add `instrumentation.server.ts`: per RESEARCH §Q3, the project stays on SvelteKit 2.8.0 with Sentry init in hooks.server.ts at module top. Future SvelteKit 2.16+ migration may move this to instrumentation.server.ts; deferred."
  - "Did NOT add `+error.svelte`: per CONTEXT D-12, this phase ships SDK integration only. User-visible error UX deferred to a later phase if product needs surface."
  - "sentrySvelteKit({ adapter: 'vercel' }) explicitly set per RESEARCH §Pattern 1 — the plugin needs the adapter hint to wire deploy-time sourcemap upload correctly for Vercel."

patterns-established:
  - "Pitfall 1 (CSP wildcard depth): wildcards do NOT cross dot boundaries. *.sentry.io matches foo.sentry.io but NOT o123.ingest.us.sentry.io (4 labels deep). Explicit *.ingest.sentry.io AND *.ingest.us.sentry.io entries required."
  - "Pitfall 4 (sourcemap upload auth): vite plugin must gate autoUploadSourceMaps on token presence. PR previews and local builds without SENTRY_AUTH_TOKEN must build cleanly (errors still flow into Sentry; just unsymbolicated)."
  - "Pitfall 9 (PII scrubber breadcrumb coverage): scrubber must run in beforeBreadcrumb too — breadcrumbs include URLs which can carry ?signature= query params. Same scrubber, same recursive walker, same dual-hook coverage."

requirements-completed: [OBS-01]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 04: Sentry SDK + PII scrubber + CSP additions wired (OBS-01)

**Wired @sentry/sveltekit@10.50.0 errors-only across client + server tiers with recursive PII scrubbing in beforeSend AND beforeBreadcrumb (wallet addresses, signatures, ?signature= URL params); extended CSP connect-src with *.ingest.sentry.io and *.ingest.us.sentry.io (Pitfall 1); gated sourcemap upload on SENTRY_AUTH_TOKEN presence so PR previews build cleanly (Pitfall 4); created src/hooks.client.ts greenfield + wrapped existing src/hooks.server.ts handle in sequence(Sentry.sentryHandle(), existingHandle).**

## Performance

- **Duration:** ~6 min (3 atomic commits)
- **Started:** 2026-04-29T11:07:23Z
- **Completed:** 2026-04-29T11:14:11Z
- **Tasks:** 3 of 3 (all atomic, all committed)
- **Commits:** 3 (Task 1: 1269a00, Task 2: 999d4f5, Task 3: 00b7dac)

## Accomplishments

- **@sentry/sveltekit@10.50.0 installed.** Pinned in package.json (`^10.50.0`); 202 transitive packages added; verified by `npm ls @sentry/sveltekit`.
- **Pure PII scrubber created at $lib/observability/scrub.ts.** Recursive walker over event/breadcrumb tree visits every string in arrays + objects. Three regexes applied left-to-right per string: `SIG_QUERY_RE` (?signature=... → [REDACTED]) → `SIG_RE` (0x[130] → [REDACTED_SIGNATURE]) → `ADDR_RE` (0x[40] → [REDACTED_ADDR]). Order-of-application avoids double-redaction. Pure function; no I/O.
- **5 unit tests pass.** Wallet redaction in string field; signature redaction in nested extra; URL ?signature= query param strip; recursive walk through `exception.values[].stacktrace.frames[].vars`; non-PII passthrough.
- **vite.config.js wired sentrySvelteKit plugin BEFORE sveltekit().** Plugin order: `[sentrySvelteKit({...}), sveltekit(), svelteTesting()]`. `adapter: 'vercel'` set explicitly. `autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN` — Pitfall 4 gating verified by stash + rebuild test (build succeeds without SENTRY_AUTH_TOKEN; Sentry plugin produced zero errors). All other Vite config (resolve.alias, optimizeDeps, build, test) preserved verbatim.
- **src/hooks.client.ts greenfield.** `Sentry.init({...})` at module load: `dsn: env.PUBLIC_SENTRY_DSN`, `enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN)`, `tracesSampleRate: 0`, `integrations: []`, `beforeSend(event) → scrubSentryEvent(event)`, `beforeBreadcrumb(breadcrumb) → scrubSentryEvent(breadcrumb)`. `handleError = Sentry.handleErrorWithSentry(...)` exported with `[hooks.client]` console tag per project convention.
- **src/hooks.server.ts: Sentry.init at module top.** Same shape as client: errors-only, dev no-op, DSN-gated. PII scrubber dual-hook. Located between imports and CSP_DIRECTIVES so it runs once per server cold-start.
- **CSP connect-src extended (Pitfall 1).** Appended `https://*.ingest.sentry.io https://*.ingest.us.sentry.io` to the existing connect-src directive. NOT `*.sentry.io` (wildcards don't cross dots — would silently fail for `o123.ingest.us.sentry.io`). All existing entries (st0x.io, vercel-kv, posthog, pyth, dynamic, etc.) preserved verbatim.
- **handle chain wrapped via sequence().** `existingHandle` is the verbatim rename of the original handle body (drop `export` keyword, keep all CSP/CORS/auth logic). New export: `export const handle = sequence(Sentry.sentryHandle(), existingHandle);` — Sentry's hook attaches request context BEFORE existingHandle runs. Plan 01-05 will prepend `requestContextHandle` to this sequence cleanly.
- **handleError = Sentry.handleErrorWithSentry exported on server tier.** Callback typed `({ error, event }: { error: unknown; event: unknown })` to satisfy strict TypeScript (svelte-check caught implicit-any on initial commit; same-task Rule 1 fix). `[hooks.server]` console tag.
- **.env.example documents 5 placeholder env vars.** SENTRY_DSN, PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT each on its own line with an explanatory comment block citing the Sentry signup URL and the Pitfall 4 gating note.
- **svelte-check unchanged.** Reports only the 4 pre-existing `transaction.ts` errors flagged by 01-01 (Phase 2 work, deferred). Zero new errors introduced — including across the brief implicit-any moment in Task 3 which was caught and fixed before commit.
- **Test suite: 434 passed / 1 skipped.** 429 baseline + 5 new scrub tests = 434 total. No regressions.

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Install @sentry/sveltekit + create PII scrubber + tests + .env.example placeholders** — `1269a00` (feat)
   - `npm install @sentry/sveltekit@^10.50.0` (10.50.0 resolved)
   - Created `src/lib/observability/scrub.ts` (45 lines, pure)
   - Created `tests/lib/observability/scrub.test.ts` (40 lines, 5 tests pass)
   - Appended Sentry env-var section to `.env.example`

2. **Task 2: Wire vite.config.js sourcemap upload plugin + create src/hooks.client.ts** — `999d4f5` (feat)
   - `vite.config.js`: prepended `sentrySvelteKit({ adapter: 'vercel', sourceMapsUploadOptions: {...}, autoUploadSourceMaps: !!SENTRY_AUTH_TOKEN })` BEFORE `sveltekit()`
   - Created `src/hooks.client.ts` (32 lines): Sentry.init + handleError

3. **Task 3: Wire Sentry server init + CSP ingest hosts + sequence() handle wrap** — `00b7dac` (feat)
   - Added Sentry/sequence/scrubSentryEvent imports + Sentry.init at module top of `src/hooks.server.ts`
   - Extended CSP connect-src with both ingest hosts
   - Renamed `handle` body to `existingHandle`; exported `handle = sequence(Sentry.sentryHandle(), existingHandle)`
   - Exported `handleError = Sentry.handleErrorWithSentry(...)`

(Final docs/metadata commit follows this SUMMARY.md and STATE.md/ROADMAP.md updates.)

## Files Created/Modified

**New (3):**
- `src/lib/observability/scrub.ts` (45 lines — `scrubSentryEvent` recursive walker)
- `tests/lib/observability/scrub.test.ts` (40 lines — 5 unit tests)
- `src/hooks.client.ts` (32 lines — `Sentry.init` + `handleError` export)

**Modified (5):**
- `package.json` — `@sentry/sveltekit ^10.50.0` added to devDependencies
- `package-lock.json` — Sentry SDK transitive deps
- `vite.config.js` — `sentrySvelteKit()` plugin prepended; sourcemap upload gated on SENTRY_AUTH_TOKEN
- `src/hooks.server.ts` — Sentry.init at module top; CSP ingest hosts; existingHandle rename; sequence() wrap; handleError export
- `.env.example` — 5 Sentry env-var placeholders + comments

## Decisions Made

- **Init gating uses `!dev && Boolean(env.{PUBLIC_,}SENTRY_DSN)`.** Dev mode no-ops to prevent test data flooding the Sentry dashboard during development; missing DSN in production degrades gracefully (Sentry SDK accepts an empty/undefined DSN and simply does not send events). The `enabled` flag is preferred over conditionally calling `Sentry.init` because it preserves the SDK's API surface — `Sentry.captureException(...)` calls in `marketOrderExecution.ts` (Plan 01-07) will still typecheck and execute as no-ops when Sentry is disabled.
- **autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN.** Pitfall 4 — Vercel PR previews don't have the SENTRY_AUTH_TOKEN secret in their build environment. Without this gating, the plugin's default behavior would be to fail-closed at build time, breaking every PR preview. With the gating, PR previews build cleanly and errors still flow into Sentry; they're just unsymbolicated stack traces.
- **CSP appended NOT replaced.** Every existing connect-src host (st0x.io, vercel-kv, base.org, walletconnect, dynamic, pyth, posthog, etc.) preserved verbatim. Only the two Sentry ingest patterns added at the end of the directive string. Reduces blast radius — no chance of accidentally tightening or breaking an unrelated upstream.
- **`https://*.ingest.us.sentry.io` (US region only) chosen as default.** Per RESEARCH §A2 — the org region is decided at Sentry account-creation time. Default to US; if the user picks EU, they MUST also add `https://*.ingest.de.sentry.io` to the CSP. Documented as deploy-time follow-up below. Could have included both proactively but kept the surface minimal — it's a one-line CSP edit when the org is created.
- **handleError callback explicitly typed.** First commit of Task 3 had `{ error, event }` implicit-any; svelte-check caught it. Rule 1 fix in same task: `{ error, event }: { error: unknown; event: unknown }`. Matches the client-tier hooks.client.ts pattern.
- **No `instrumentation.server.ts`.** Per RESEARCH §Q3 (resolved): SvelteKit 2.8.0 doesn't require it; init in hooks.server.ts at module top runs once per cold-start which is sufficient. SvelteKit 2.16+ may move this; deferred.
- **No `+error.svelte`.** Per CONTEXT D-12 — this phase ships SDK integration only. User-visible error UX deferred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Explicit type annotations on `Sentry.handleErrorWithSentry` callback in hooks.server.ts**
- **Found during:** Task 3, post-edit svelte-check
- **Issue:** First commit of Task 3 wrote `Sentry.handleErrorWithSentry(({ error, event }) => {...})` without type annotations. svelte-check reported 2 implicit-any errors:
  - `Binding element 'error' implicitly has an 'any' type.` (line 498:60)
  - `Binding element 'event' implicitly has an 'any' type.` (line 498:67)
- **Fix:** Added `{ error: unknown; event: unknown }` type annotation matching the client-tier `myErrorHandler` pattern in hooks.client.ts. One-line mechanical TypeScript fix; no behavior change. Committed as part of Task 3 (single commit), so no extra commit was created — the fix was applied before the Task 3 commit was finalized.
- **Files modified:** `src/hooks.server.ts` (handleError export typed callback)
- **Verification:** svelte-check returns to baseline (4 pre-existing transaction.ts errors only).

### Build smoke test result

The plan's verification asks for `SENTRY_AUTH_TOKEN= npm run build` to succeed. The Vite build phase (where the Sentry plugin runs) DOES succeed cleanly — `✓ built in 16.34s`, zero Sentry-related errors, sourcemap upload skipped as designed. The post-Vite SvelteKit `adapter-vercel` adapt step then fails with `Building locally with unsupported Node.js version: v24.1.0`. This is a **pre-existing** local environment issue:
- Verified by `git stash && SENTRY_AUTH_TOKEN= npm run build` against the parent commit (c10580e from 01-03) — same Node-version error.
- The adapter requires Node 18, 20, or 22 for production builds; the local dev shell is Node 24.
- This is a deploy-time environment concern, not a Sentry concern. The plan's Pitfall 4 gating (autoUploadSourceMaps) is verified to work — the Sentry plugin produced zero output when SENTRY_AUTH_TOKEN was unset.
- Vercel CI builds run on Node 22 by default (via `vercel.json` / project settings); the build will succeed there with or without SENTRY_AUTH_TOKEN.

This is documented as an environmental note, not a deviation requiring a code fix.

---

**Total deviations:** 1 auto-fixed (Rule 1 — implicit-any caught and fixed in same task before commit).
**Impact on plan:** All `must_haves.truths`, `acceptance_criteria`, and orchestrator `success_criteria` satisfied.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors (lines 664, 686, 708, 2346) carried over from 01-01..03. Unchanged by this plan; remain Phase 2 work (TRADE-01..04). Logged in `deferred-items.md`.
- **Local Node v24 vs adapter-vercel's Node 18/20/22 requirement:** Pre-existing local environment issue (verified via stash test against parent commit). The Vite build phase succeeds; only the post-Vite Vercel adapt step fails locally. Vercel CI is unaffected.

## Threat Flags

None new. All work was within the plan's `<threat_model>` scope:
- **T-04-01 mitigated** — PII scrubber covers wallet, signature, ?signature= URL via dual-hook (beforeSend + beforeBreadcrumb), recursive walker, 5 unit tests.
- **T-04-02 mitigated** — CSP connect-src has explicit `https://*.ingest.sentry.io` AND `https://*.ingest.us.sentry.io`; no `*.sentry.io` literal.
- **T-04-03 mitigated** — SENTRY_AUTH_TOKEN consumed only by Vite plugin at build time (Node `process.env`); never bundled into client JS.
- **T-04-04 accepted** — Phase 1 ships errors-only (`tracesSampleRate: 0`, `integrations: []`).
- **T-04-05 mitigated** — Sentry plugin uploads sourcemaps only when SENTRY_AUTH_TOKEN is set; Vite default does NOT bundle .map files in production.
- **T-04-06 accepted** — PII scrubber is the safety net for running without cookie consent. SDK is gated by !dev && DSN.
- **T-04-07 mitigated** — `isBotOrMalformedPath` at hooks.server.ts:330 still 404s before resolve(), so bot traffic doesn't reach Sentry's server hook.

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f src/lib/observability/scrub.ts` — verified
- [x] `test -f tests/lib/observability/scrub.test.ts` — verified
- [x] `test -f src/hooks.client.ts` — verified
- [x] `grep -q "@sentry/sveltekit" package.json` — 1 hit at line 73
- [x] `grep -c "ingest\.sentry\.io\|ingest\.us\.sentry\.io" src/hooks.server.ts` returns ≥1 (both substrings present on the connect-src line; verified by `grep -o`)
- [x] `grep -c "Sentry\.init" src/hooks.client.ts src/hooks.server.ts` — 1 + 1 = 2 hits
- [x] `grep -c "scrubSentryEvent" src/lib/observability/scrub.ts src/hooks.client.ts src/hooks.server.ts` — 1 + 3 + 3 = 7 hits (>=3)
- [x] `grep -c "tracesSampleRate" src/hooks.client.ts src/hooks.server.ts` — 1 + 1 = 2; both `tracesSampleRate: 0`
- [x] `grep -c "SENTRY_AUTH_TOKEN" vite.config.js` — 2 hits (sourceMapsUploadOptions + autoUploadSourceMaps gating)
- [x] `grep -c "SENTRY_DSN=\|PUBLIC_SENTRY_DSN=\|SENTRY_AUTH_TOKEN=\|SENTRY_ORG=\|SENTRY_PROJECT=" .env.example` — 5 hits
- [x] `npm test -- tests/lib/observability/scrub.test.ts --run` — 5 tests pass
- [x] `npm test -- --run` — 434 passed / 1 skipped / 24 test files (429 baseline + 5 new)
- [x] `npm run check` — only the 4 pre-existing transaction.ts errors; 0 new errors
- [x] `SENTRY_AUTH_TOKEN= npm run build` — Vite phase succeeds (`✓ built in 16.34s`); Sentry plugin produces zero output (Pitfall 4 gating verified). Post-Vite Vercel adapt fails on local Node v24 — pre-existing environmental issue, unrelated to this plan.
- [x] All 3 task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `1269a00`, `999d4f5`, `00b7dac`
- [x] sentrySvelteKit plugin appears at line 9 of vite.config.js BEFORE sveltekit() at line 18 (verified via grep -n)
- [x] No unintended file deletions across the 3 task commits (`git diff --diff-filter=D --name-only HEAD~3 HEAD` returns empty)

## Operational Notes (deploy-time follow-up)

The user has NOT yet created the Sentry org/project — that's a manual deploy-time task. The code in this plan ships Sentry-ready but inert until the operator completes these steps:

1. **Create Sentry org + project.** Visit https://sentry.io/signup/ . Choose region:
   - **US default (assumed by current CSP):** the project's CSP already permits `*.ingest.us.sentry.io`.
   - **EU region:** the operator MUST also append `https://*.ingest.de.sentry.io` to the CSP `connect-src` in `src/hooks.server.ts:184` BEFORE deploying with the EU DSN. Without this, Sentry events will silently fail with browser CSP violations (Pitfall 1).
2. **Capture the DSN** from Sentry Dashboard → Project Settings → Client Keys (DSN). The DSN is a single string; it goes into BOTH `SENTRY_DSN` (server-side) and `PUBLIC_SENTRY_DSN` (client-side, public-prefixed for Vite bundling).
3. **Generate auth token** at Sentry Dashboard → Settings → Auth Tokens. Required scopes: `project:write` + `project:releases`. This is the build-time-only `SENTRY_AUTH_TOKEN`. Optional but recommended — without it, Sentry events show unsymbolicated stack traces.
4. **Add Vercel env vars** in the Vercel project's Environment Variables panel (Production / Preview / Development as appropriate):
   - `SENTRY_DSN` — server-side, all environments. Production-only is fine if dev/preview are OK without errors.
   - `PUBLIC_SENTRY_DSN` — same value as SENTRY_DSN; same scope.
   - `SENTRY_AUTH_TOKEN` — Production only (Pitfall 4 — PR previews lack the token by design).
   - `SENTRY_ORG` — Sentry org slug (visible in dashboard URL); Production only.
   - `SENTRY_PROJECT` — Sentry project slug; Production only.
5. **Production smoke test** — after deploy with all env vars set: throw a test error in any +page.svelte (e.g., `throw new Error('sentry-smoke-test ' + crypto.randomUUID())`), confirm:
   - Event appears in Sentry dashboard within ~30s
   - Wallet addresses redacted to `[REDACTED_ADDR]` (test by including a 0x-address in the error message)
   - Browser DevTools Network tab shows successful POST to `*.ingest.us.sentry.io/api/.../envelope/...` (HTTP 200)
   - Browser DevTools Console shows NO CSP violations on Sentry endpoints
6. **Privacy policy review** — Sentry runs WITHOUT cookie consent (errors aren't analytics, defensible per CONTEXT D-06 + RESEARCH A7). The PII scrubber is the safety net. Confirm with a privacy lawyer if this is a concern; otherwise document the rationale in the privacy policy alongside PostHog and Vercel Speed Insights.

**No infrastructure resource creation required from this plan's code change** — Vercel KV, Blob, cron, and other existing resources are untouched. The only new external dependency is the Sentry SaaS account itself.

## Next Plan Readiness

- **Plan 01-05 (OBS-02 pino + request-id middleware) can proceed.** The hooks.server.ts handle is now `sequence(Sentry.sentryHandle(), existingHandle)`. Plan 01-05 will prepend `requestContextHandle` to give: `sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)` — Sentry will then receive the request_id as part of its breadcrumb data.
- **Plan 01-07 (OBS-03 take-order failure transcripts) is unblocked.** `Sentry.captureException(err, { extra: transcript })` will work end-to-end — the SDK is initialized, the PII scrubber is wired, and the CSP permits the ingest hosts. Plan 01-07 just needs to call `Sentry.captureException` from `marketOrderExecution.ts` with the transcript object; the `scrubSentryEvent` walker will auto-redact wallet/signature fields recursively.
- **No carry-over deferred items closed in this plan.** The `CACHE_KEYS` orphan from 01-02 remains for a future cache.ts-touching plan.
- **The Sentry SDK is shipped but inert until env vars are set.** Production deploys without SENTRY_DSN: SDK is initialized but `enabled: false`, no events sent, no errors thrown. PR preview deploys without SENTRY_AUTH_TOKEN: build succeeds, no sourcemap upload (errors flow into Sentry as unsymbolicated). This graceful degradation is the deliberate design for solo-team operations.
- **OBS-01 is the fourth REQ-ID closed in Phase 1** (after DEPR-02 in 01-01, DEPR-01 in 01-02, DEPR-03 in 01-03). 4 down, 4 to go (OBS-02..OBS-05).

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
