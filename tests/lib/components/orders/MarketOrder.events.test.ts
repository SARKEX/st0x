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
import { classifyError } from '$lib/services/observability/classifyError';

const componentPath = resolve(process.cwd(), 'src/lib/components/orders/MarketOrder.svelte');
const componentSource = readFileSync(componentPath, 'utf-8');

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

	it('Test 2: handleMarketOrder brackets the submit body with withTradeId()', () => {
		const handlerStart = componentSource.indexOf('const handleMarketOrder');
		expect(handlerStart).toBeGreaterThan(-1);
		const handlerEnd = componentSource.indexOf('};', handlerStart) + 2;
		const handlerBlock = componentSource.slice(handlerStart, handlerEnd);

		// withTradeId encapsulates the mint-before / clear-in-finally Pitfall 2
		// discipline so the call site only has to invoke the wrapper.
		expect(handlerBlock).toMatch(/await\s+withTradeId\(/);
		// The mint/clear pair must NOT be open-coded in the handler — that's the
		// whole point of the wrapper.
		expect(handlerBlock).not.toMatch(/mintTradeId\(\)/);
		expect(handlerBlock).not.toMatch(/clearTradeId\(\)/);
	});

	it('Test 3: withTradeId is gated behind early-return guards (does not pollute funnel for unauthenticated clicks)', () => {
		const handlerStart = componentSource.indexOf('const handleMarketOrder');
		const handlerEnd = componentSource.indexOf('};', handlerStart) + 2;
		const handlerBlock = componentSource.slice(handlerStart, handlerEnd);
		// All early-return guards must come BEFORE the withTradeId call so the
		// ID is only minted for trades that actually start submitting.
		const withIdx = handlerBlock.indexOf('withTradeId');
		const isAuthIdx = handlerBlock.indexOf('!$isAuthenticated');
		const walletRegIdx = handlerBlock.indexOf('!$walletRegistered');
		expect(withIdx).toBeGreaterThan(-1);
		expect(isAuthIdx).toBeGreaterThan(-1);
		expect(isAuthIdx).toBeLessThan(withIdx);
		expect(walletRegIdx).toBeGreaterThan(-1);
		expect(walletRegIdx).toBeLessThan(withIdx);
	});

	it('Test 4: trade_failed and trade_initiated use trackTradeEvent', () => {
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_failed['"]/);
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_initiated['"]/);
		// quote_received funnel step
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]quote_received['"]/);
	});

	it('Test 5: shared classifyError covers the market-scope ErrorClass branches', () => {
		expect(classifyError(new Error('Slippage exceeded'), 'market')).toBe('slippage_exceeded');
		expect(classifyError(new Error('no_walk_fills'), 'market')).toBe('no_liquidity');
		expect(classifyError(new Error('No liquidity available right now'), 'market')).toBe(
			'no_liquidity'
		);
		expect(classifyError(new Error('no_quotes available'), 'market')).toBe('no_liquidity');
		expect(classifyError(new Error('Stale oracle price'), 'market')).toBe('stale_oracle');
		expect(classifyError(new Error('Insufficient balance'), 'market')).toBe('insufficient_balance');
		expect(classifyError(new Error('Market is closed'), 'market')).toBe('market_closed');
		expect(classifyError(new Error('user denied tx'), 'market')).toBe('user_rejected');
		expect(classifyError(new Error('User rejected the request'), 'market')).toBe('user_rejected');
		expect(classifyError(new Error('rpc connection refused'), 'market')).toBe('rpc_error');
		expect(classifyError(new Error('something went sideways'), 'market')).toBe('unknown');
		expect(classifyError(undefined, 'market')).toBe('unknown');
	});

	it("Test 5b: component imports the shared classifyError + calls it with the 'market' scope", () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/classifyError['"]/);
		expect(componentSource).toMatch(/classifyError\s*\([^,]*,\s*['"]market['"]\s*\)/);
	});

	it('Test 6: panel-level events route through trackTradeEvent', () => {
		// Following the PR-174 review: every name in TradeEventName goes through
		// trackTradeEvent so the trade_id property is consistently attached
		// (null when no trade is in flight, value once mintTradeId has fired).
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_panel_opened['"]/);
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_panel_abandoned['"]/);
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_error_shown['"]/);
		// And the raw `track` import must not be needed in the component anymore.
		expect(componentSource).not.toMatch(
			/import\s+\{\s*track\s*\}\s+from\s+['"]\$lib\/services\/analytics['"]/
		);
	});

	it('Test 7: imports both new lifecycle modules', () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/);
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeId['"]/);
		expect(componentSource).toMatch(/trackTradeEvent/);
		expect(componentSource).toMatch(/withTradeId/);
	});

	it('Test 8: reports submit-time quote and preparation failures with the explicit trade id', () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeFlow['"]/);
		expect(componentSource).toMatch(/withTradeId\(async\s*\(tradeId\)/);
		expect(componentSource).toMatch(/captureTradeFlowError/);
		expect(componentSource).toMatch(/flowContext\(['"]quote['"]/);
		expect(componentSource).toMatch(/activeStage\s*=\s*['"]calldata['"]/);
	});

	it('Test 9: reports token-configuration failures during quote preparation', () => {
		const validationContexts = componentSource.match(
			/flowContext\(['"]quote['"],\s*['"]validate_token_config['"]\)/g
		);
		expect(validationContexts).toHaveLength(2);
		expect(componentSource).not.toMatch(
			/flowContext\(['"]calldata['"],\s*['"]validate_token_config['"]\)/
		);
	});

	it('Test 10: remaps unexpected post-preparation failures at the wallet boundary', () => {
		expect(componentSource).toMatch(/inferWalletFailureStage/);
		expect(componentSource).toMatch(
			/activeStage === ['"]calldata['"]\s*\? inferWalletFailureStage\(error\)\s*:\s*activeStage/
		);
		expect(componentSource).toMatch(/flowContext\(failureStage, ['"]submit_market_order['"]\)/);
	});
});
