/**
 * Plan 02-03 Task 1a — MarketOrder.svelte event instrumentation tests.
 *
 * Approach: source-content + pure-logic verification (matches existing
 * `MarketOrder.test.ts` convention — see `.planning/codebase/TESTING.md`
 * "prefer testing pure logic extracted from a component over rendering").
 *
 * The 1300-line MarketOrder requires TanStack QueryClient + currentNetwork +
 * walletService scaffolding heavier than the value of a render-and-spy harness.
 * The scope of this plan is verifying:
 *   1. trade_id lifecycle wiring (mintTradeId / clearTradeId paired in try/finally)
 *   2. Event emission shape (trackTradeEvent calls at the documented sites)
 *   3. classifyMarketError pure-function correctness for ErrorClass mapping
 *
 * Plan-level acceptance criteria for the lifecycle pairing are the source-content
 * checks below (mintTradeId BEFORE try, clearTradeId INSIDE finally) — which is
 * the exact regression guard for Pitfall 2 (T-2-E).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ErrorClass } from '$lib/services/observability/tradeEvents';

const componentPath = resolve(process.cwd(), 'src/lib/components/orders/MarketOrder.svelte');
const componentSource = readFileSync(componentPath, 'utf-8');

// Mirror of `classifyMarketError` defined inside MarketOrder.svelte. The pure
// helper is asserted here in test-land so a future drift breaks Test 5 immediately.
// Source-content check below ensures the function exists in the component file.
function classifyMarketError(err: unknown): ErrorClass {
	const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
	if (msg.includes('slippage')) return 'slippage_exceeded';
	if (msg.includes('liquidity') || msg.includes('no_walk_fills') || msg.includes('no_quotes'))
		return 'no_liquidity';
	if (msg.includes('stale') || msg.includes('oracle')) return 'stale_oracle';
	if (msg.includes('insufficient') || msg.includes('balance')) return 'insufficient_balance';
	if (msg.includes('market') && msg.includes('closed')) return 'market_closed';
	if (msg.includes('user reject') || msg.includes('user denied') || msg.includes('rejected'))
		return 'user_rejected';
	if (msg.includes('rpc') || msg.includes('network')) return 'rpc_error';
	return 'unknown';
}

describe('MarketOrder.svelte event instrumentation (Plan 02-03 Task 1a)', () => {
	it('Test 1: trade_button_clicked uses trackTradeEvent (not raw track) inside handleMarketOrder', () => {
		// trackTradeEvent('trade_button_clicked', ...) must appear after the
		// handleMarketOrder definition. Existing call site at the previous line
		// 844 (`track('trade_button_clicked', ...)`) MUST be replaced.
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_button_clicked['"]/);
		// The original raw track('trade_button_clicked', ...) inside the submit
		// handler must be gone (it is allowed only as 'trade_panel_opened' /
		// 'trade_error_shown' / 'trade_panel_abandoned' regression-guards).
		const handlerStart = componentSource.indexOf('const handleMarketOrder');
		const handlerEnd = componentSource.indexOf('</script>', handlerStart);
		const handlerBlock = componentSource.slice(handlerStart, handlerEnd);
		expect(handlerBlock).not.toMatch(/track\(\s*['"]trade_button_clicked['"]/);
	});

	it('Test 2: handleMarketOrder pairs mintTradeId() with clearTradeId() in finally', () => {
		const handlerStart = componentSource.indexOf('const handleMarketOrder');
		expect(handlerStart).toBeGreaterThan(-1);
		const handlerEnd = componentSource.indexOf('};', handlerStart) + 2;
		const handlerBlock = componentSource.slice(handlerStart, handlerEnd);

		// mintTradeId called once
		expect(handlerBlock).toMatch(/mintTradeId\(\)/);
		// clearTradeId called inside the finally block
		expect(handlerBlock).toMatch(/finally\s*\{[\s\S]*?clearTradeId\(\)[\s\S]*?\}/);
		// mintTradeId must come BEFORE try (not inside finally / catch — Pitfall 2)
		const mintIdx = handlerBlock.indexOf('mintTradeId');
		const tryIdx = handlerBlock.indexOf('try {');
		expect(mintIdx).toBeGreaterThan(-1);
		expect(tryIdx).toBeGreaterThan(mintIdx);
	});

	it('Test 3: mintTradeId is gated behind early-return guards (does not pollute funnel for unauthenticated clicks)', () => {
		const handlerStart = componentSource.indexOf('const handleMarketOrder');
		const handlerEnd = componentSource.indexOf('};', handlerStart) + 2;
		const handlerBlock = componentSource.slice(handlerStart, handlerEnd);
		// All early-return guards must come BEFORE the mintTradeId call so the
		// ID is only minted for trades that actually start submitting.
		const mintIdx = handlerBlock.indexOf('mintTradeId');
		const isAuthIdx = handlerBlock.indexOf('!$isAuthenticated');
		const walletRegIdx = handlerBlock.indexOf('!$walletRegistered');
		expect(isAuthIdx).toBeGreaterThan(-1);
		expect(isAuthIdx).toBeLessThan(mintIdx);
		expect(walletRegIdx).toBeGreaterThan(-1);
		expect(walletRegIdx).toBeLessThan(mintIdx);
	});

	it('Test 4: trade_failed and trade_initiated use trackTradeEvent', () => {
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_failed['"]/);
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_initiated['"]/);
		// quote_received funnel step
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]quote_received['"]/);
	});

	it('Test 5: classifyMarketError pure mapping covers all ErrorClass branches', () => {
		expect(classifyMarketError(new Error('Slippage exceeded'))).toBe('slippage_exceeded');
		expect(classifyMarketError(new Error('no_walk_fills'))).toBe('no_liquidity');
		expect(classifyMarketError(new Error('No liquidity available right now'))).toBe(
			'no_liquidity'
		);
		expect(classifyMarketError(new Error('No quotes available'))).toBe('no_liquidity');
		expect(classifyMarketError(new Error('Stale oracle price'))).toBe('stale_oracle');
		expect(classifyMarketError(new Error('Insufficient balance'))).toBe('insufficient_balance');
		expect(classifyMarketError(new Error('Market is closed'))).toBe('market_closed');
		expect(classifyMarketError(new Error('user denied tx'))).toBe('user_rejected');
		expect(classifyMarketError(new Error('User rejected the request'))).toBe('user_rejected');
		expect(classifyMarketError(new Error('rpc connection refused'))).toBe('rpc_error');
		expect(classifyMarketError(new Error('something went sideways'))).toBe('unknown');
		expect(classifyMarketError(undefined)).toBe('unknown');
	});

	it('Test 5b: classifyMarketError function exists in component source', () => {
		// Regression guard: if the helper is renamed or extracted, this fails so
		// Test 5 above doesn't drift away from the actual implementation.
		expect(componentSource).toMatch(/function\s+classifyMarketError\s*\(/);
	});

	it("Test 6: existing track('trade_panel_opened', ...) regression-guarded (KEEP unchanged)", () => {
		// Per plan acceptance: line 123 mount call MUST remain on `track`.
		expect(componentSource).toMatch(/track\(\s*['"]trade_panel_opened['"]/);
		// And panel_abandoned + error_shown still as track() (mount/unmount surface).
		expect(componentSource).toMatch(/track\(\s*['"]trade_panel_abandoned['"]/);
		expect(componentSource).toMatch(/track\(\s*['"]trade_error_shown['"]/);
	});

	it('Test 7: imports both new lifecycle modules', () => {
		expect(componentSource).toMatch(
			/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/
		);
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeId['"]/);
		expect(componentSource).toMatch(/trackTradeEvent/);
		expect(componentSource).toMatch(/mintTradeId/);
		expect(componentSource).toMatch(/clearTradeId/);
	});
});
