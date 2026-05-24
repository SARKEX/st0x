// TEST-07 — Sell market order via UI.
//
// STATUS: SKIPPED. Same blocker as marketBuy.spec.ts — Path-B's synthetic
// stubs surface deployed maker orders to the UI but the SDK preflight against
// anvil reports `no_liquidity`. See marketBuy.spec.ts for the full diagnosis
// and unblocking checklist.
import { test } from './fixtures';

test.skip('TEST-07 Sell market order — Path-B blocked on no_liquidity; see marketBuy.spec.ts header', () => {});
