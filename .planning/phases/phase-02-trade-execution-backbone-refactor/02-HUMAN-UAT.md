---
status: partial
phase: 02-trade-execution-backbone-refactor
source: [02-VERIFICATION.md, 02-08-SUMMARY.md]
started: 2026-04-30T00:00:00Z
updated: 2026-04-30T00:00:00Z
---

## Current Test

[awaiting human testing — post-deploy numeric p75 LCP capture]

## Tests

### 1. Capture pre-deploy + post-deploy p75 LCP from Vercel Speed Insights

**Why this is a HUMAN-UAT:** The Vercel public REST API does not expose Web Vitals metrics for programmatic read. Three candidate endpoints (`/v1/observability/speed-insights/{id}/metrics`, `/v1/insights/vitals`, `vercel.com/api/web/insights/vitals`) all return 404 — same disclosure as Phase 1 OBS-05. The dashboard UI uses session-cookie endpoints. Speed Insights is confirmed receiving data on `/trade/[id]` (`hasData=true` since 2025-07-21, ~9 months of samples).

**How to verify:**

1. Pull pre-deploy baseline NOW (before merge):
   - Open https://vercel.com/st-0x/st0x/observability/speed-insights
   - Time range: Last 7 days
   - Route filter: `/trade/[id]`
   - Record values into `02-RUNBOOK.md` "Pre-deploy baseline" section: p75 LCP (mobile + desktop), p75 CLS, p75 INP, p75 TTFB, sample size.

2. Merge phase-2 branch + deploy to production via Vercel.

3. Wait ≥24h for Speed Insights to accumulate ≥100 sessions on `/trade/[id]`.

4. Pull post-deploy values from same dashboard URL.

5. Record into `02-RUNBOOK.md` "Post-deploy capture" section:
   - Post-deploy p75 LCP (mobile + desktop): ___ ms
   - Pre→post LCP delta: ___ ms
   - Post-deploy p75 CLS: ___ (must remain < 0.1)
   - Sample size: ___ sessions

6. Manual CLS smoke: open production trade page → cycle Limit/DCA/Market tabs → confirm visible shift ≤ 20px.

7. Run locally: `ANALYZE=1 npm run build && open .svelte-kit/output/client/stats.html` → record initial-chunk gzip size + delta.

**expected:** Post-deploy p75 LCP < 2.5s on `/trade/[id]` (CONTEXT D-07 Web Vitals "good" threshold) OR pre-baseline already < 2.5s and post-deploy did not regress.

**result:** [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

(none yet — pending operator capture)
