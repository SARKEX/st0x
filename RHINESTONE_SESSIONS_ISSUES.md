# Rhinestone Sessions — Combined Issues & Fix Plan

Combined findings from Claude Code and Codex reviews of the `2026-02-17-rhinetsone-sessions` branch. Issues are ordered by priority.

---

## Blockers (sessions cannot work without fixing these)

### B1. Smart Sessions module never enabled on account

**Files:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `createAccount()` (line ~349-413)

`createAccount()` never passes `experimental_sessions: { enabled: true }` to the `RhinestoneAccountConfig`. The SDK requires this to install the Smart Sessions validator module on the account. Without it, `experimental_getSessionDetails` and `experimental_signEnableSession` will throw `SmartSessionsNotEnabledError`.

**Fix:** When sessions are enabled (`sessionsEnabled()` returns true), add `experimental_sessions: { enabled: true }` to the `createAccountOptions` passed to `this.sdk.createAccount()`.

```ts
// In createAccount(), add:
if (this.sessionsEnabled()) {
  createAccountOptions.experimental_sessions = { enabled: true };
}
```

**Ref:** Rhinestone docs — `rhinestone.createAccount({ experimental_sessions: { enabled: true } })`

---

### B2. `enableData` field name mismatch — `sessionIndex` vs `sessionToEnableIndex`

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `maybeAttachSessionSigner()` (line ~588)

The code passes `sessionIndex: 0` but the SDK's `SessionEnableData` type expects `sessionToEnableIndex: number` (see `node_modules/@rhinestone/sdk/dist/src/types.d.ts:244`).

**Note:** The Rhinestone docs page for multi-chain sessions shows `sessionIndex: 0`, so there's a docs/types discrepancy. The TypeScript type definition is the contract. Codex confirmed the SDK runtime reads `sessionToEnableIndex` at `smart-sessions.js:203`.

**Fix:** Rename `sessionIndex` to `sessionToEnableIndex` in the `enableData` object.

---

### B3. `verifyExecutions` not set — enable-mode packing may be skipped

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `maybeAttachSessionSigner()` (line ~582)

Codex found that the SDK only uses enable-mode signature packing when `verifyExecutions` is set on the `SessionSignerSet` (see `smart-sessions.js:94`). Without it, the enable signature may not be applied, making the session flow inert.

**Fix:** Add `verifyExecutions: true` to the signers object:

```ts
const signers: SessionSignerSet = {
  type: 'experimental_session',
  session: sessions[sessionIndex],
  verifyExecutions: true,
  enableData: {
    userSignature: enableSignature,
    hashesAndChainIds,
    sessionToEnableIndex: sessionIndex
  }
};
```

---

### B4. localStorage deserialization breaks session accounts — signing fails on page reload

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `getOrCreateSessionEnableBundle()` (line ~510-528)

When serializing sessions to localStorage, `owners.accounts` are stored as plain `{ address: string }` objects. On deserialization, these are NOT viem `Account` instances — they lack `signMessage`, `signTransaction`, etc. When the SDK tries to use the restored session to sign, it will fail.

**Fix:** On deserialization, reconstruct the real session owner Account from the private key that's already stored in localStorage under `rhinestone:sessionOwnerPk:{wallet}`:

```ts
// In the localStorage cache deserialization path:
const sessionOwner = this.getSessionOwnerAccount(walletAddress);
const sessions: Session[] = parsed.sessions.map((s) => ({
  chain: CHAIN_CONFIG[(s.chainId ?? s.chain?.id) as SupportedNetworkId],
  owners: { type: 'ecdsa' as const, accounts: [sessionOwner] }
}));
```

---

### B5. `bigint` values lost during JSON round-trip

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `getOrCreateSessionEnableBundle()` (line ~547-560)

`hashesAndChainIds` contains `ChainDigest` objects where `chainId` is `bigint`. The custom serializer converts bigints to strings, but the deserializer does no bigint restoration. The SDK expects `chainId: bigint` in `SessionEnableData.hashesAndChainIds`.

**Fix:** On deserialization, convert `chainId` strings back to `bigint`:

```ts
const bundle = {
  sessions,
  enableSignature: parsed.enableSignature,
  hashesAndChainIds: parsed.hashesAndChainIds.map((h: any) => ({
    ...h,
    chainId: BigInt(h.chainId)
  }))
};
```

---

## High Priority

### H1. Sessions created without actions/policies — defaults to sudo

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `getOrCreateSessionEnableBundle()` (line ~531)

Sessions are created with no `actions`:

```ts
const sessions: Session[] = chainIds.map((id) => ({
  chain: CHAIN_CONFIG[id as SupportedNetworkId],
  owners: { type: 'ecdsa', accounts: [sessionOwner] }
}));
```

Codex confirmed that missing actions default to sudo policy (`smart-sessions.js:398`) with effectively unbounded lifetime (`smart-sessions.js:370`). Combined with the plaintext localStorage key storage, this is a significant security risk — any XSS gives persistent, unrestricted signing capability.

**Fix:** Define explicit actions and policies scoped to the app's needs:

```ts
const sessions: Session[] = chainIds.map((id) => ({
  chain: CHAIN_CONFIG[id as SupportedNetworkId],
  owners: { type: 'ecdsa', accounts: [sessionOwner] },
  actions: [
    {
      // Scope to ERC20 approve + transfer only
      target: undefined, // or specific token addresses
      selector: undefined, // or specific function selectors
      policies: [
        { type: 'time-frame', validAfter: Date.now(), validUntil: Date.now() + 24 * 60 * 60 * 1000 },
        { type: 'spending-limits', limits: [/* per-token limits */] },
      ]
    }
  ]
}));
```

**Decision needed:** Do you want strict least-privilege sessions (action + spending + timeframe policies) for production, or intentionally broad sessions for MVP UX? Even for MVP, a 24h timeframe policy is strongly recommended.

---

### H2. Cross-chain signing hard-coded to Base

**Files:**
- `src/lib/dynamic/DynamicReactProvider.tsx:341` — hard-codes `getWalletClient('8453')`
- `src/lib/services/account-abstraction/wallets/dynamic.ts:184` — defaults account creation to Base
- `src/lib/stores/aaPaymentStore.ts:53` and `src/lib/services/walletService.ts:107` — callers omit chain

**Impact:** Non-Base AA flows (Arbitrum, Optimism, Ethereum) can fail authorization/signing because the wallet client is always created for Base.

**Fix:** Thread the target `chainId` through the Dynamic wallet client creation path. `getDynamicAccountForRhinestone()` should accept and use the target chain ID, and callers should pass it.

---

### H3. Authorization fallback silently proceeds with missing coverage

**Files:**
- `src/lib/dynamic/DynamicReactProvider.tsx:358` — Dynamic signer bridge throws for `signAuthorization`
- `src/lib/services/account-abstraction/rhinestone/client.ts:736` — fallback "skips manual auth"
- `src/lib/services/account-abstraction/rhinestone/client.ts:1503` — cross-chain manual completion only runs when SDK fully failed

**Impact:** When the SDK partially succeeds (returns authorizations for some chains but not all), the manual fallback doesn't fill in the gaps. Transaction submission then fails due to chain coverage gaps.

**Fix:** In the cross-chain `signAuths()` function, check for missing chain coverage even when `sdkSucceeded = true`, and attempt manual signing for any uncovered chains.

---

### H4. `RhinestoneAccount` interface type drift

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` (line ~153-184)

The PR defines a custom `RhinestoneAccount` interface instead of importing from `@rhinestone/sdk`. The `experimental_getSessionDetails` return type is wrong:

```ts
// PR says:
experimental_getSessionDetails?: (sessions: Session[]) => Promise<{
  hashesAndChainIds: Array<{ hash: Hex; chainId: number }>;
}>;

// SDK actually returns SessionDetails:
interface SessionDetails {
  nonces: bigint[];
  hashesAndChainIds: ChainDigest[];  // { chainId: bigint; sessionDigest: Hex }
  data: TypedDataDefinition<...>;
}
```

Field name `hash` doesn't exist (it's `sessionDigest`), and `chainId` is `bigint` not `number`. The methods are also marked optional (`?`) but are always present on SDK accounts.

**Fix:** Import `RhinestoneAccount` from the SDK, or at minimum fix the local interface to match the actual `SessionDetails` type. Consider importing `SessionDetails` from `@rhinestone/sdk/dist/src/modules/validators/smart-sessions`.

---

## Medium Priority

### M1. Sessions not integrated into cross-chain transaction methods

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts`

`maybeAttachSessionSigner()` is called in:
- `executeSameChainSwap()` (line ~1857)
- `executeSameChainTransaction()` (line ~2004)

But NOT in:
- `executeCrossChainSwap()` — the most complex transaction flow
- `executeOmnichainTransaction()`

**Fix:** Add `maybeAttachSessionSigner()` calls to both cross-chain methods, before `prepareTransaction()`.

---

### M2. Manual EIP-7702 fallback hard-codes nonce 0

**Files:**
- `src/lib/services/account-abstraction/rhinestone/client.ts:710`
- `src/lib/services/account-abstraction/rhinestone/client.ts:1517`

Both manual `signAuthorization` calls pass `nonce: 0`. After the first authorization use, this will cause replay/nonce mismatch failures.

**Fix:** Fetch the actual nonce from the chain before signing:

```ts
const publicClient = createPublicClient({ chain, transport: createRpcTransport(chainId) });
const nonce = await publicClient.getTransactionCount({ address: walletAccount.address });
```

---

### M3. No session validity checking or expiry

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts`

- Cached session bundles persist in localStorage forever — no TTL
- No check for on-chain session revocation via `experimental_isSessionEnabled()`
- No cleanup when user disconnects/logs out
- No way for users to see or revoke sessions from the UI

**Fix:**
1. Add a TTL to cached session bundles (e.g., 24h) — store a `createdAt` timestamp alongside
2. Call `experimental_isSessionEnabled()` before using a cached session; if invalid, re-create
3. Clear session caches on wallet disconnect/logout
4. Consider adding a UI for session management (lower priority)

---

### M4. Single-chain session bundles per transaction

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts` — `maybeAttachSessionSigner()` (line ~578)

Each transaction creates/retrieves a bundle for just `[chainId]`, meaning each chain gets a separate enable signature. This defeats the multi-chain session benefit (sign once, enable everywhere).

**Fix:** Enable sessions for all supported chains at once during onboarding or first use:

```ts
const allChainIds = [8453, 42161, 10, 1]; // all supported chains
const bundle = await this.getOrCreateSessionEnableBundle(
  rhinestoneAccount, walletAddress, allChainIds
);
```

Then index into the correct session when attaching to a transaction.

---

### M5. USDC send flow in SendFundsModal is broken

**File:** `src/lib/components/SendFundsModal.svelte`

- `walletUsdcBal` is always `0n` (line ~262)
- `vault` is set to the USDC token address (line ~266) instead of a vault
- Code routes to ERC4626 `withdraw` (line ~287/296) which will revert on a plain ERC20

**Fix:** Check if the token is an ERC4626 vault before using `withdraw`. For plain USDC, use a standard ERC20 `transfer` call instead.

---

### M6. RPC fallback / CSP mismatch

**Files:**
- `src/lib/utils/rpc.ts:28` — adds Alchemy Base endpoint as fallback
- `src/hooks.server.ts:162` — CSP `connect-src` does not include that Alchemy host

**Fix:** Add the Alchemy RPC domain to CSP `connect-src`, or remove the fallback if it's not needed.

---

### M7. Session key stored in plaintext localStorage

**File:** `src/lib/services/account-abstraction/rhinestone/client.ts:476`

Acknowledged with a `⚠️` comment. For MVP this is acceptable if paired with restrictive policies (see H1). For production, consider:
- Encrypted storage (Web Crypto API)
- Short-lived sessions (24h timeframe policy)
- Secure enclave / KMS solutions

---

## Low Priority

### L1. Enable overhead on every transaction

Every transaction carries the `enableData` (enable-mode). More efficient approach: install sessions once, check with `experimental_isSessionEnabled()`, and only pass `enableData` when the session isn't yet installed. After installation, pass just `signers: { type: 'experimental_session', session }` without `enableData`.

### L2. No UI for session management/consent

No user-facing indication that sessions are active, no consent flow for session creation, no ability to manage or revoke sessions.

### L3. Session signing intended audience unclear

Is session signing intended for Dynamic embedded wallets only, or for direct EOAs too? The current code exposes AA paths broadly. Consider gating session creation to Dynamic wallets only if direct wallet users shouldn't use sessions.

---

## Fix Order

1. **B1** — Enable Smart Sessions module in `createAccount` (nothing else works without this)
2. **B2 + B3** — Fix `enableData` field names and add `verifyExecutions: true`
3. **B4 + B5** — Fix localStorage serialization/deserialization
4. **H1** — Add session policies (at minimum, 24h timeframe)
5. **H4** — Fix `RhinestoneAccount` interface types or import from SDK
6. **H2** — Fix cross-chain signing Base hard-coding
7. **H3** — Fix authorization fallback coverage gaps
8. **M1** — Integrate sessions into cross-chain methods
9. **M2** — Fix hard-coded nonce 0
10. **M3** — Add session validity checking and TTL
11. **M4** — Multi-chain session enablement
12. **M5** — Fix SendFundsModal USDC flow
13. **M6** — Fix CSP mismatch

---

## References

- [Rhinestone Smart Sessions Overview](https://docs.rhinestone.dev/sdk/smart-sessions/overview)
- [Multi-Chain Session Signatures](https://docs.rhinestone.dev/smart-wallet/smart-sessions/multi-session-signature)
- [EIP-7702 Concept](https://docs.rhinestone.dev/home/concepts/smart-eoas-eip-7702)
- [viem signAuthorization](https://viem.sh/docs/eip7702/signAuthorization)
- SDK types: `node_modules/@rhinestone/sdk/dist/src/types.d.ts`
- SDK session module: `node_modules/@rhinestone/sdk/dist/src/modules/validators/smart-sessions.d.ts`
- SDK account interface: `node_modules/@rhinestone/sdk/dist/src/index.d.ts`
