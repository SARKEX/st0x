# Deferred Items — Phase 02 Observability

Out-of-scope discoveries logged during plan execution. NOT fixed in their discovering plan; address in a follow-up.

## From Plan 02-01 execution

- **rpcMetrics test type errors** — `tests/lib/server/rpcMetrics.test.ts:165,181,182` — `Tuple type [] of length 0 has no element at index 0` (TS-strict tuple inference on `mockNotifyChainExhausted.mock.calls[0]`). Pre-existing as of commit 66958043 (2026-05-05). Out of scope for OBS-09 trade-id work.

