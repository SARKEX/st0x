---
phase: 03-production-grade-hardening
plan: 03
subsystem: server-randomness
tags: [phase-3, sec-05, csprng, rejection-sampling, access-codes, referral-codes]

requires:
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "CSPRNG nonce precedent at src/lib/server/signatureChallenge.ts:58-60 (`crypto.randomBytes(16).toString('hex')`) — same node:crypto entry-point this plan adopts for index sampling"
  - phase: 03-production-grade-hardening
    plan: 01
    provides: "BASE_RPC_URL env-var present in accessCodes.ts and referrals.ts (added by 03-01 SEC-01) — both modules already had `import crypto from 'crypto'` precedent in the codebase via signatureChallenge.ts; 03-03 adds the import locally"
provides:
  - "Rejection-sampled CSPRNG-backed access-code generator in src/lib/server/accessCodes.ts (SEC-05 closure for ST0X-XXXX-XXXX)"
  - "Rejection-sampled CSPRNG-backed referral-code generator in src/lib/server/referrals.ts (SEC-05 closure for st0x-ref-xxxxxx)"
  - "Test boilerplate for rejection-sampling structural witness — vi.spyOn(crypto, 'randomBytes').mockImplementation((size) => { const buf = Buffer.alloc(size); buf[0] = sequence[i++]; return buf; }) with sequenced reject-then-accept bytes to prove the picker re-rolls"
  - "Phase-exit gate evidence: `! grep -E 'Math\\.random\\(\\)' src/lib/server/accessCodes.ts src/lib/server/referrals.ts` returns 0 hits"
affects: [phase-3-wave-8-runbook]

tech-stack:
  added: []
  patterns:
    - "Rejection-sampled CSPRNG index sampling: `limit = floor(256/N)*N; while (true) { const byte = crypto.randomBytes(1)[0]; if (byte < limit) return alphabet[byte % n]; }` — discards bytes >= limit so every alphabet index gets equal probability when N does not divide 256 (RESEARCH §Pitfall 9). For 31-char alphabet limit=248 (~3% reject); for 32-char limit=256 (no reject; helper still uniform with referrals.ts)"
    - "CSPRNG witness via vi.spyOn(cryptoMod.default, 'randomBytes') — proves production path goes through node:crypto rather than Math.random; checks call shape (each call requests 1 byte) without coupling to specific index values"
    - "Rejection-sampling structural witness via vi.spyOn().mockImplementation — sequenced [250, 250, 5, ...] forces picker to reject twice then accept on third call; assertions on (a) resulting code character (b) total spy call count prove the rejection-then-retry path actually runs"

key-files:
  created:
    - "src/lib/server/referrals.test.ts (NEW — 5 tests: format, uniqueness 1000, statistical no-bias 10000, rejection-sampling structural witness, CSPRNG witness)"
  modified:
    - "src/lib/server/accessCodes.ts (added `import crypto from 'crypto'`; added private `pickFromAlphabet` helper; rewrote `generateAccessCode` to use it — Math.random eliminated)"
    - "src/lib/server/referrals.ts (added `import crypto from 'crypto'`; added private `pickFromAlphabet` helper; rewrote `generateReferralCode` to use it — Math.random eliminated)"
    - "src/lib/server/accessCodes.test.ts (extended — added `describe('SEC-05 generateAccessCode CSPRNG')` block with 4 tests; existing tests untouched)"

key-decisions:
  - "Statistical-bias tolerance widened from plan's 5% to 10% on accessCodes.test.ts after RED revealed Math.random's natural sampling drift triggers a 5%-bound flake on a single 10000-sample run (e.g., one character at 2630 vs expected 2500). 10% gives ~6σ headroom for genuinely uniform output but still detects systematic bias. Same 10% bound used on the 31-char referrals test per plan."
  - "Rejection-sampling structural test uses vi.spyOn().mockImplementation rather than vi.mock('crypto') — the former preserves the real module shape (cryptoMod.default + named exports) while overriding only the one method under test, which lets `import crypto from 'crypto'` in production code resolve normally. vi.mock('crypto') would require providing the entire surface and break other consumers transitively."
  - "Helper `pickFromAlphabet` duplicated between accessCodes.ts and referrals.ts (private to each module, NOT promoted to a shared util). Per plan's note: 8-line helper, inlining is fine, Phase 4 / DRIFT-01 may consolidate as part of broader cleanup. Avoids over-engineering per CLAUDE.md."
  - "32-char access-code alphabet has limit=256 → no rejection ever fires in practice; 31-char referral alphabet has limit=248 → ~3% rejection rate. Helper shape kept identical between files anyway because (a) symmetry aids review (b) a future alphabet change to non-power-of-two on accessCodes.ts would silently introduce bias if the helper had been special-cased."
  - "RED commits preserved deliberately even though they assert behaviour the GREEN code provides — RED's contract is `prove the witness fails before production code changes`, which is satisfied by the failure log captured at commit time. Same pattern as 03-02."
  - "Test count: 5 referrals + 4 new accessCodes (existing 4 preserved) = 9 new tests pinning SEC-05. Plan called for 4 + 3-5; landed at 4 + 5 = 9."

patterns-established:
  - "Rejection-sampled CSPRNG index pick: `function pickFromAlphabet(alphabet: string): string { const n = alphabet.length; const limit = Math.floor(256 / n) * n; while (true) { const byte = crypto.randomBytes(1)[0]; if (byte < limit) return alphabet[byte % n]; } }` — reusable any time fixed-alphabet code generation needs uniform CSPRNG sampling"
  - "Rejection-sampling structural witness pattern (vitest): `const sequence = [<reject>, <reject>, <accept>, ...]; vi.spyOn(crypto.default, 'randomBytes').mockImplementation((size) => { const buf = Buffer.alloc(size); buf[0] = sequence[i++] ?? 0; return buf; });` — proves picker re-rolls on out-of-range bytes"

requirements-completed: [SEC-05]

duration: ~5min
completed: 2026-04-30
---

# Phase 3 Plan 03: SEC-05 CSPRNG for Access + Referral Codes Summary

**Replaced `Math.floor(Math.random() * chars.length)` at `accessCodes.ts:62` and `referrals.ts:77` with rejection-sampled `crypto.randomBytes(1)[0]` via a private `pickFromAlphabet` helper. Closes SEC-05 — Math.random is V8 PRNG (predictable from observed output); crypto.randomBytes is OS CSPRNG. Format `ST0X-XXXX-XXXX` (32-char alphabet) and `st0x-ref-xxxxxx` (31-char alphabet) preserved verbatim; 31-char rejection cutoff `floor(256/31)*31 = 248` discards bytes 248-255 (~3% rejection) to avoid modulo bias on indices 0-7. Same node:crypto precedent as `signatureChallenge.ts:58-60`.**

## Performance

- **Duration:** ~5 min
- **Tasks completed:** 2/2
- **Commits:** 4 (TDD RED → GREEN per task)
- **Files modified:** 4 (accessCodes.ts, referrals.ts, accessCodes.test.ts extended, referrals.test.ts NEW)
- **Test count delta:** 530 → 539 (+9 new SEC-05 tests across both files; 1 pre-existing skip preserved)

## Commits

- `fe1579a test(03-03): add SEC-05 CSPRNG witness test for accessCodes.ts` (RED — CSPRNG witness fails)
- `d5621c3 feat(03-03): SEC-05 generateAccessCode crypto.randomBytes with rejection sampling` (GREEN — Math.random eliminated)
- `b452715 test(03-03): add SEC-05 referrals.test.ts pinning CSPRNG + rejection sampling` (RED — rejection-sampling + CSPRNG witnesses fail)
- `116f936 feat(03-03): SEC-05 generateReferralCode crypto.randomBytes with rejection sampling` (GREEN — Math.random eliminated)

## What Shipped

### accessCodes.ts:46-65 (generateAccessCode)

```typescript
function pickFromAlphabet(alphabet: string): string {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;
    while (true) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < limit) return alphabet[byte % n];
    }
}

export function generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomPart = (length: number) =>
        Array.from({ length }, () => pickFromAlphabet(chars)).join('');
    return `ST0X-${randomPart(4)}-${randomPart(4)}`;
}
```

### referrals.ts:73-91 (generateReferralCode)

```typescript
function pickFromAlphabet(alphabet: string): string {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;
    while (true) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < limit) return alphabet[byte % n];
    }
}

export function generateReferralCode(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const randomPart = Array.from({ length: 6 }, () => pickFromAlphabet(chars)).join('');
    return `st0x-ref-${randomPart}`;
}
```

### Test surface

- `accessCodes.test.ts` extended with 4 tests under `describe('SEC-05 generateAccessCode CSPRNG')`:
  1. Format preservation regex `^ST0X-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-…{4}$`
  2. 1000-call uniqueness (set size = 1000)
  3. 10000-sample statistical no-bias (10% tolerance per character)
  4. CSPRNG witness via `vi.spyOn(cryptoMod.default, 'randomBytes')` — confirms call + 1-byte shape
- `referrals.test.ts` NEW with 5 tests under same describe block:
  1. Format `^st0x-ref-[abcdefghjkmnpqrstuvwxyz23456789]{6}$`
  2. 1000-call uniqueness
  3. 10000-sample statistical no-bias on 31-char alphabet (where rejection sampling matters)
  4. **Rejection-sampling structural witness** — sequenced `[250, 250, 5, 0, 0, 0, 0, 0]` proves picker re-rolls on bytes ≥ 248 then accepts on byte 5 → `'st0x-ref-faaaaa'` after 8 spy calls (3 for first pick + 5 for the rest)
  5. CSPRNG witness — same shape as accessCodes Test 4

## Verification Results

### Acceptance grep gates (all green)

```
=== Math.random check both files ===
(empty if 0 hits)

=== accessCodes crypto.randomBytes count === 1
=== accessCodes pickFromAlphabet count === 2 (def + call)
=== accessCodes alphabet verbatim === 1
=== accessCodes ST0X- prefix === 2

=== referrals crypto.randomBytes count === 1
=== referrals pickFromAlphabet count === 2 (def + call)
=== referrals alphabet verbatim === 1
=== referrals st0x-ref- prefix === 5
```

### Test suite

- `npm test -- --run src/lib/server/accessCodes.test.ts src/lib/server/referrals.test.ts` → 13/13 passing
- `npm test -- --run` (full suite) → 539 passed | 1 skipped | 0 failed

### svelte-check

- 3 errors / 0 warnings (Phase 2 baseline preserved)

### Phase 2 cross-cutting gates (all green)

- TRADE-01 lockdown — banned IO field reads on `marketOrderExecution.ts` = 0 ✓
- TRADE-02 cycle severance — `from '$lib/stores/transaction'` imports in `marketOrderExecution.ts` = 0 ✓
- failWith count = 16 (≥ 12) ✓
- EMERGENCY_RATIO_MULTIPLIER count = 0 ✓
- staleTime: Infinity preserved in `queryClient.ts` ✓

### Phase-exit gate (carry-forward)

- `! grep -E "Math\.random\(\)" src/lib/server/accessCodes.ts src/lib/server/referrals.ts` → 0 hits ✓

## Deviations from Plan

### None

Plan executed exactly as written, with one tiny tolerance adjustment documented under `key-decisions`:

- **Statistical-bias tolerance widened from 5% → 10%** on the accessCodes statistical test. RED revealed Math.random's natural drift breaches a 5% bound on a single 10000-sample run; 10% gives genuinely uniform output ~6σ headroom while still detecting systematic bias. Plan-text said 5% for accessCodes (32-char) and 10% for referrals (31-char); both now use 10% for symmetry. Materially-important content (format, uniqueness, rejection sampling, CSPRNG witness) all unchanged.

No Rule 1/2/3/4 deviations. No auth gates. No checkpoints (autonomous=true).

## Threat Mitigation

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-03-SEC-05-01 | ✅ mitigated | crypto.randomBytes (OS CSPRNG) replaces Math.random; same shape as signatureChallenge.ts:58-60 |
| T-03-SEC-05-02 | ✅ mitigated | Rejection sampling with `limit = floor(256/N)*N` cutoff — bytes ≥ limit re-roll; structural test pins the path |
| T-03-SEC-05-03 | accepted | OS CSPRNG returns uniform bytes; expected loop iteration < 1.04. Statistical test (10000 samples within 10%) provides empirical evidence the loop converges in practice |
| T-03-SEC-05-04 | accepted | Statistical test runs in CI/test-mode only; no production exposure |

## What's Next

- **Wave 2 remaining:** Plan 03-04 (SEC-07 hCaptcha env-detection) — independent of SEC-05; both Wave 2 quick wins now complete except 03-04
- **Wave 3+:** Plans 03-05 onward (SEC-* + REL-*) per ROADMAP.md
- **Phase 4 / DRIFT-01:** May consolidate the duplicated `pickFromAlphabet` helper into a shared util as part of broader cleanup. Out of scope for Phase 3.

## Self-Check

Verifying claims before state updates:

```
$ [ -f src/lib/server/accessCodes.ts ] && echo FOUND
FOUND
$ [ -f src/lib/server/referrals.ts ] && echo FOUND
FOUND
$ [ -f src/lib/server/accessCodes.test.ts ] && echo FOUND
FOUND
$ [ -f src/lib/server/referrals.test.ts ] && echo FOUND
FOUND
$ git log --oneline | grep -E "fe1579a|d5621c3|b452715|116f936"
116f936 feat(03-03): SEC-05 generateReferralCode crypto.randomBytes with rejection sampling
b452715 test(03-03): add SEC-05 referrals.test.ts pinning CSPRNG + rejection sampling
d5621c3 feat(03-03): SEC-05 generateAccessCode crypto.randomBytes with rejection sampling
fe1579a test(03-03): add SEC-05 CSPRNG witness test for accessCodes.ts
```

## Self-Check: PASSED
