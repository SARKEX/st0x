/**
 * ESLint fixture for TRADE-01 `no-restricted-syntax` rule.
 *
 * This file intentionally contains 4 banned raw property reads. The rule MUST
 * fire on every MemberExpression below. Verified by:
 *   npm run lint-check -- tests/fixtures/io-perspective-violation.ts
 *
 * DO NOT allowlist this file. It is *expected* to fail lint. The plan-checker
 * uses this fixture to confirm the rule is active in CI as well as the editor.
 */
import type { ProcessedQuote } from '$lib/utils/orderbook';

declare const quote: ProcessedQuote;

// All four reads must trigger the rule:
const a = quote.inputTokenAddress; // banned
const b = quote.outputTokenAddress; // banned
const c = quote.inputIOIndex; // banned
const d = quote.outputIOIndex; // banned

export const violations = { a, b, c, d };
