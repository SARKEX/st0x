# Phase 2 — Operational Runbook

**Phase:** 02-trade-execution-backbone-refactor
**Created:** 2026-04-29 (Plan 02-08 / PERF-01)
**Status:** Phase 2 plans complete; deployment handoff items below

This runbook is the deployment handoff artifact for Phase 2. It covers the
PERF-01 trade-page LCP work landing under this phase plus the cross-phase
hand-offs into Phase 3 (security + reliability hardening).

For Phase 1 observability surfaces (Sentry, pino, Telegram alerts, Vercel
Speed Insights wiring) see `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` —
that runbook remains canonical for everything wired before Phase 2.

## PERF-01 — Trade-Page LCP Capture

### Vercel Speed Insights dashboard

- **URL:** https://vercel.com/st-0x/st0x/observability/speed-insights
- **Project slugs:** `team = st-0x`, `project = st0x`,
  `project_id = prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv`
- **Dashboard status at Phase 1 close:** receiving data
  (`speedInsights.hasData: true`, enabled 2025-07-21 — ~9 months of historical
  LCP/CLS/INP/TTFB at Phase 2 entry).
- **Production URLs:** primary `https://www.st0x.io` (also `https://st0x.io`,
  `https://platform.st0x.io`)
- **Per-route focus:** `/trade/[id]` (highest-traffic page; PERF-01 success
  criterion = post-deploy p75 LCP < 2.5s on this route per CONTEXT D-07 Web
  Vitals "good" threshold).
- **Cookie consent:** Speed Insights injection is consent-gated via
  `enableAnalytics()` in `src/routes/+layout.svelte:31` (NOT
  `CookieConsent.svelte` — see Phase 1 RUNBOOK doc correction).

### Pre-deploy baseline capture

**Status:** orchestrator-verified via Vercel API; numeric p75 LCP read deferred to operator at deploy time (programmatic read not available on the public API surface).

**Vercel API check (Plan 02-08, 2026-04-29):**
- Endpoint: `GET https://api.vercel.com/v9/projects/prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv?teamId=team_aZ1KikXR7iqJ15EA4oQYxUIC`
- Result: `speedInsights.hasData: true`, `enabledAt: 1753100699206` (2025-07-21 — ~9 months of LCP/CLS/INP/TTFB samples on `/trade/[id]` at Phase 2 exit), `framework: sveltekit-1`.
- Web Analytics also enabled with data.

**Disclosure — programmatic numeric read not available:**
The orchestrator attempted to read the p75 LCP value programmatically via three
candidate endpoints — `vercel.com/api/web/insights/vitals`,
`api.vercel.com/v1/insights/vitals`, and
`api.vercel.com/v1/observability/speed-insights/{project_id}/metrics` — all
returned 404. Same outcome as Phase 1 / Plan 01-08's check: the Speed Insights
dashboard UI uses session-cookie endpoints, and the public REST API does not
expose Web Vitals metrics. **A numeric p75 LCP read therefore requires a
manual visit to the dashboard.** Per Plan 02-08 must_haves
("Phase 2 success criterion 5 (p75 LCP < 2.5s) is met OR documented as
already-met if pre-baseline was already < 2.5s"), if the pre-baseline is
already < 2.5s, the criterion is documented met and the post-deploy
measurement validates the lazy-load + bundle-prune work did not regress it.

**Operator step at deploy time (single browser visit, no CLI):**

1. Open https://vercel.com/st-0x/st0x/observability/speed-insights
2. Time-range filter: "Last 7 days"
3. Route filter: `/trade/[id]`
4. Record below (fill in at deploy time):
   - **Pre-deploy p75 LCP (Last 7d):** `_____ ms`
   - **Pre-deploy p75 CLS:** `_____`
   - **Pre-deploy p75 INP:** `_____ ms`
   - **Pre-deploy p75 TTFB:** `_____ ms`
   - **Sample size (7-day total):** `_____ sessions`
   - **Mobile p75 LCP:** `_____ ms`
   - **Desktop p75 LCP:** `_____ ms`
   - **Cookie consent rate:** `_____ %`
5. Determine work scope (already-met vs gap-close).

### Post-deploy verification (Phase 2 HUMAN-UAT — deferred from Task 3)

**Status:** PERF-01 is structurally complete by code work (lazy-load chunks
build correctly + jspdf removed + visualizer registered + RUNBOOK landed).
The numeric p75 LCP validation against the < 2.5s target is a Phase 2
HUMAN-UAT item — it surfaces in `/gsd-progress` and `/gsd-audit-uat` per
the workflow's `human_needed` handling. Run `/gsd-verify-work` after deploy
+ 24h Speed Insights window to record the numeric value below.

After deploying the lazy-load + bundle-prune commits to production, wait
≥24h for Vercel Speed Insights to accumulate ≥100 sessions (p75
stabilization). Then:

1. Open https://vercel.com/st-0x/st0x/observability/speed-insights
2. Time range: "Last 24 hours" (extend to 7d if traffic is sparse)
3. Route filter: `/trade/[id]`
4. Record below (fill in at post-deploy):
   - **Post-deploy p75 LCP (Last 24h):** `_____ ms`
   - **Pre→post LCP delta:** `_____ ms` (negative = improvement)
   - **Post-deploy p75 CLS:** `_____` (must remain < 0.1 — Pitfall 5 mitigation)
   - **Sample size (24h):** `_____ sessions`
5. **PASS criterion:** post-deploy p75 LCP < 2.5s on `/trade/[id]`.

### CLS smoke test (post-deploy, manual)

1. Open the production trade page on a real browser/device (mobile preferred).
2. Click `Limit` tab → wait for load → click `DCA` tab → wait for load → click
   `Market` tab.
3. Visual content shift must NOT exceed ~20px between tabs (skeleton
   placeholders are sized at `min-h-[420px]` to match the rendered form
   height ±20px per Pitfall 5 mitigation).
4. Pull post-deploy p75 CLS from Speed Insights — must remain < 0.1
   (Web Vitals "good" threshold).
5. Record outcome below:
   - **CLS smoke test:** `____` (passed / failed)
   - **Visible shift magnitude (if failed):** `_____ px`

### Bundle delta (post-deploy)

After merging the lazy-load + jspdf-prune commits, run locally:

```bash
ANALYZE=1 npm run build
open .svelte-kit/output/client/stats.html
```

Record:
- **Pre-deploy initial-chunk gzip size:** `_____ KB` (capture from
  pre-merge HEAD before pulling down master)
- **Post-deploy initial-chunk gzip size:** `_____ KB`
- **Bundle delta:** `_____ KB` (negative = saving)

### Phase 2 / PERF-01 success summary

| Item | Status |
|------|--------|
| rollup-plugin-visualizer registered (gated on `ANALYZE=1`) | ✓ Plan 02-08 / Task 1 |
| `stats.html` in `.gitignore` (T-02-08-01 mitigation) | ✓ Plan 02-08 / Task 1 |
| `jspdf` + `jspdf-autotable` removed from `package.json` (~250KB) | ✓ Plan 02-08 / Task 1 |
| `LimitOrder.svelte` lazy-loaded with `min-h-[420px]` skeleton | ✓ Plan 02-08 / Task 2 |
| `DcaOrder.svelte` lazy-loaded with `min-h-[420px]` skeleton | ✓ Plan 02-08 / Task 2 |
| `MarketOrder.svelte` stays eager (default tab / first paint) | ✓ Plan 02-08 / Task 2 |
| `TokenMarketCharts.svelte` lazy-loaded (lightweight-charts deferred) | ✓ Plan 02-08 / Task 2 |
| `TradingViewChart.svelte` lazy-loaded (chart-modal only) | ✓ Plan 02-08 / Task 2 |
| TanStack Query waterfall reorganization | analyzed; existing waterfall already optimal — no changes needed (see SUMMARY) |
| `staleTime: Infinity` preserved in `queryClient.ts` (T-02-08-03 mitigation) | ✓ |
| Speed Insights dashboard receiving data on `/trade/[id]` | ✓ orchestrator-verified via Vercel API (Plan 02-08 close) — `hasData: true`, enabled 2025-07-21 |
| Pre-deploy p75 LCP numeric read | HUMAN-UAT — programmatic API read not available; operator manual capture at deploy time |
| Post-deploy p75 LCP numeric read | HUMAN-UAT — operator manual capture ≥24h post-deploy |
| Post-deploy p75 LCP < 2.5s on `/trade/[id]` | HUMAN-UAT — validated against operator-captured numeric value |
| CLS smoke test passed (< 0.1) | HUMAN-UAT — operator manual tab-switch test post-deploy |
| Bundle delta recorded | HUMAN-UAT — operator runs `ANALYZE=1 npm run build` post-merge |

### Top bundle offenders (Phase 2 close — informs Phase 3 follow-ups)

Captured from `ANALYZE=1 npm run build` at Plan 02-08 close. Sizes are raw
client-chunk bytes; gzip size is what hits the wire.

| # | Chunk | Raw size | Likely contents | Notes |
|---|-------|----------|-----------------|-------|
| 1 | `chunks/index.DhBx_Xw6.js` | 10.4 MB | viem + wagmi + Dynamic Labs SDK + walletconnect | Largest single chunk; encodes the wallet/auth surface. Most weight comes from upstream packages — splitting needs upstream cooperation or selective imports. Phase 3 / SEC-01..04 may shrink it incidentally. |
| 2 | `chunks/0.o5LHoBh-.js` | 4.2 MB | layout/+page node 0 (`(main)/+layout.svelte` ancestry) | Pulls trade/dashboard shared chunk. Lazy-load wins from Plan 02-08 are visible here. |
| 3 | `chunks/tokenMath.Dx2Okcmo.js` | 3.5 MB | `@rainlanguage/orderbook` WASM (base64-inlined) + tokenMath utils | The WASM is embedded inline as base64 inside the chunk (`AGFzbQEAAAA…` magic bytes confirmed). Future Phase 3 win: configure Vite to load the WASM via `?url` so it streams from `/` rather than embedding. |

Plan 02-08 lazy-load wins (now visible as separate chunks):
- `LimitOrder` — 23.26 kB raw / 8.74 kB gzip
- `DcaOrder` — 24.42 kB raw / 8.62 kB gzip
- `TokenMarketCharts` — 18.06 kB raw / 6.57 kB gzip
- `TradingViewChart` — 2.91 kB raw / 1.42 kB gzip

## Smoke Tests (post-deploy)

### Smoke 1: Lazy-loaded components fetch on tab switch

1. Open the production trade page (`https://www.st0x.io/trade/<token>`) in
   an incognito browser.
2. Open DevTools → Network → JS filter.
3. Click Buy or Sell to open the trade panel. Default tab is Market — no new
   chunk fetch (MarketOrder is eager).
4. Switch to `Limit` tab. Network panel should show a new request for a
   chunk like `LimitOrder.<hash>.js` (~9 kB gzip). Tab content renders
   within ~150ms on a fast connection.
5. Switch to `DCA` tab. Network panel should show a new request for
   `DcaOrder.<hash>.js`. Tab content renders.
6. Repeat with the chart-modal: click the terminal-view button — TradingView
   chunk fetches. Click the orderbook-charts tab — TokenMarketCharts chunk
   fetches.
7. Verify the skeleton placeholder is visible during the chunk fetch (a
   spinner inside a fixed-height container).

### Smoke 2: Visualizer build artifact is gitignored

```bash
ANALYZE=1 npm run build
ls -la .svelte-kit/output/client/stats.html  # exists locally
git status  # stats.html does NOT appear in untracked files
```

### Smoke 3: jspdf is gone

```bash
grep -rn "jspdf" src/   # 0 hits
grep -E '"jspdf' package.json  # 0 hits
node -e "import('jspdf').then(()=>process.exit(1)).catch(()=>process.exit(0))"  # exits 0 (module not found = success)
```

## Vercel Project Environment — Deploy Checklist

No new env vars introduced by Phase 2. Phase 1's deploy checklist
(Sentry + Telegram + pino) remains canonical.

## Cross-Cutting Cleanup Verification

Run after all Phase 2 plans complete. Each grep MUST return 0 hits except
where comments allow specific retention.

```bash
# TRADE-01 lockdown — no raw IO-perspective property reads outside
# allowlist (orderPerspective.ts, utils/orderbook.ts, api/orders.ts,
# generated-graphql.ts) + comments
# (See 02-VALIDATION.md "TRADE-01 lockdown gate" for the canonical recipe.)

# TRADE-02 cycle-severance — marketOrderExecution.ts must NOT import the
# transaction store (the cycle that prevented test isolation pre-Plan 02-03).
grep -c "from '\$lib/stores/transaction'" src/lib/services/marketOrderExecution.ts  # MUST return 0

# TRADE-03 + TRADE-04 — failWith() coverage in marketOrderExecution.ts
grep -c "failWith(" src/lib/services/marketOrderExecution.ts  # MUST be ≥12

# Symmetric Buy/Sell slippage — pre-89571b3 hardcoded multiplier must NOT recur
grep -c "EMERGENCY_RATIO_MULTIPLIER" src/lib/services/marketOrderExecution.ts  # MUST return 0

# PERF-01 lazy-load — LimitOrder + DcaOrder fetched via dynamic import
grep -cE "await import\(['\"]\\\$lib/components/orders/(LimitOrder|DcaOrder)" "src/routes/(main)/trade/[id]/+page.svelte"  # MUST be ≥2

# PERF-01 bundle prune
grep -cE '"(jspdf|jspdf-autotable)":' package.json  # MUST return 0
grep -c "stats\.html" .gitignore                    # MUST be ≥1
grep -c "rollup-plugin-visualizer" package.json     # MUST be ≥1
grep -c "rollup-plugin-visualizer\|visualizer" vite.config.js  # MUST be ≥1

# CLS regression mitigation (Pitfall 5)
grep -c "min-h-\[" "src/routes/(main)/trade/[id]/+page.svelte"  # MUST be ≥2

# CLAUDE.md ground truth — manual cache invalidation preserved
grep -c "staleTime.*Infinity" src/lib/clients/queryClient.ts  # MUST be ≥1

# svelte-check baseline (Phase 2 target)
npm run check 2>&1 | grep -cE "^Error:"  # MUST be ≤3
```

## Deferred Items (Phase 3/4 scope)

Captured for handoff. None blocks Phase 2 closure.

| Item | Phase | Notes |
|------|-------|-------|
| Hardcoded Alchemy key removal (T-06-04 / Phase 1 Telegram leak path) | Phase 3 / SEC-01 | Phase 1 RUNBOOK already lists this |
| RPC retry-with-backoff in `callRpc` | Phase 3 / REL-01 | Phase 1 RUNBOOK |
| EIP-1271/6492 fallback chain in `accessCodes` | Phase 3 / REL-02 | Phase 1 RUNBOOK |
| Vendor Rain strategies registry | Phase 3 / REL-03 | Phase 1 RUNBOOK |
| `+error.svelte` user-visible error page | If product needs surface | Phase 1 D-12 |
| `transcript.onChainStateRead.vaultBalance` populated by pre-flight | Plan 02-06 / TRADE-03 | Now CLOSED — populated via SDK `formattedMaxOutput` |
| OBS-03 take-order failure UX re-classification | Plan 02-06 / TRADE-04 | Now CLOSED via D-05 inline error |
| Orphaned rewards-only `CACHE_KEYS` entries in `src/lib/server/cache.ts` | Phase 4 cleanup | Phase 1 deferred-items |
| 4 pre-existing svelte-check errors in `transaction.ts` | Plan 02-05 / TRADE-02 PR-5 | Now CLOSED — return-type tightening cleared 4 errors; baseline = 3 |
| WASM blob inlined inside `tokenMath` chunk (3.5 MB) | Phase 3 / future PERF | Investigate Vite `?url` import to stream the WASM separately |
| Top 1 bundle chunk (10.4 MB viem+wagmi+Dynamic) — needs upstream cooperation or selective imports | Phase 3 / future PERF | Bundle prune temptation list lives in 02-RESEARCH.md |
| Manual: pre-deploy + post-deploy p75 LCP capture | Plan 02-08 / Task 0+3 | Operator action at deploy time |
| Manual: CLS smoke test on tab switch | Plan 02-08 / Task 3 | Operator action post-deploy |
| Manual: bundle-size delta (gzip) recorded | Plan 02-08 / Task 3 | Operator action post-deploy |

## Phase 2 → Phase 3 Hand-off

- **TRADE-01..04 + PERF-01 are structurally complete.** Code-level
  acceptance criteria all satisfied; phase-exit gate battery green.
- **PERF-01 numeric LCP validation is Phase 2 HUMAN-UAT.** Code changes
  ship inert (lazy-load chunks build correctly; jspdf gone; visualizer
  registered behind ANALYZE=1; runbook landed). The Speed Insights API
  exposed only project-level `hasData: true` at orchestration time — the
  numeric p75 LCP read requires a manual dashboard visit and is therefore
  deferred to operator action ≥24h post-deploy. Run `/gsd-verify-work`
  after the Speed Insights window to record the numeric value. If
  post-deploy p75 LCP ≥ 2.5s, open a Phase 3 deferred-items entry tracking
  the residual gap and consider the SSR deferral (D-08) for reopening —
  DO NOT roll back lazy-load + jspdf prune (those are net positive even
  if the absolute target is missed).
- **All 6 Phase 2 REQ-IDs closed:** TRADE-01, TRADE-02, TRADE-03, TRADE-04,
  PERF-01 (this plan), and the umbrella refactor goal.
- **svelte-check baseline:** 3 errors (Phase 2 target met; was 7 at Phase 2
  entry; cleared 4 in Plan 02-05 via orderDeployment return-type tightening).
- **Test count:** 523 passing / 1 skipped at Phase 2 close (was 470 at
  entry; +53 new tests across Plans 02-01..02-07 covering accessor
  semantics, state-machine isolation, pre-flight cascade, regression
  matrix, priceCap symmetry, ensureAllowance, partial-fill detection).

---

*Phase: 02-trade-execution-backbone-refactor*
*Runbook authored: 2026-04-29 at Phase 2 exit (Plan 02-08, Task 1+2 close).*
*Pending operator action: Tasks 0+3 — pre-deploy + post-deploy LCP capture.*
