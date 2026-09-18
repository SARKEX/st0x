/**
 * Client-side trading latency knobs (SUP-19).
 *
 * Keep quote debounce short enough to feel snappy, but non-zero so typing
 * bursts do not amplify REST quote calls. Approval settle + trade-index polls
 * run after chain inclusion — tighten them carefully without lowering
 * APPROVAL_TX_CONFIRMATIONS (still 2 per CONVENTIONS.md).
 */

/** Debounce before firing a market swap quote request while the user types. */
export const MARKET_QUOTE_DEBOUNCE_MS = 150;

/** Post-approval calldata retries while allowance propagates across RPCs. */
export const APPROVAL_SETTLE_ATTEMPTS = 3;
export const APPROVAL_SETTLE_DELAY_MS = 200;

/** Poll for indexer/subgraph trade rows after take-order receipt. */
export const TRADE_INDEX_MAX_ATTEMPTS = 60;
export const TRADE_INDEX_POLL_INTERVAL_MS = 2_000;
