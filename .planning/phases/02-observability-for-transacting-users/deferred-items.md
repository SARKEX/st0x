# Deferred Items — Phase 02 Observability

Out-of-scope discoveries logged during plan execution. NOT fixed in their discovering plan; address in a follow-up.

## From Plan 02-01 execution

- **rpcMetrics test type errors** — `tests/lib/server/rpcMetrics.test.ts:165,181,182` — `Tuple type [] of length 0 has no element at index 0` (TS-strict tuple inference on `mockNotifyChainExhausted.mock.calls[0]`). Pre-existing as of commit 66958043 (2026-05-05). Out of scope for OBS-09 trade-id work.

## From Plan 02-02 execution

- **`npm run build` requires production secrets at SvelteKit `analyse` step** — `SESSION_SECRET`, `BASE_RPC_URL`, etc. fail-fast on import in `src/lib/server/auth.ts` and `src/lib/server/accessCodes.ts`. The Vite/Rollup compile itself succeeds (Sentry Replay resolves cleanly from `@sentry/sveltekit` ^10.50.0); only the post-build server-bundle analyse phase trips. Pre-existing — out of scope for Plan 02-02. Suggest a future plan to gate the production-only checks in those modules so `npm run build` works in dev/CI without a full secrets fixture.

