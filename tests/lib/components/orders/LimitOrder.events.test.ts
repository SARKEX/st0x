/**
 * Plan 02-03 Task 2a — LimitOrder.svelte event instrumentation tests.
 *
 * Source-content + pure-logic verification (matches MarketOrder.test.ts /
 * MarketOrder.events.test.ts convention — TanStack Query + Modal harness is
 * heavier than the value of a render test).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyError } from '$lib/services/observability/classifyError';

const componentPath = resolve(process.cwd(), 'src/lib/components/orders/LimitOrder.svelte');
const componentSource = readFileSync(componentPath, 'utf-8');

describe('LimitOrder.svelte event instrumentation (Plan 02-03 Task 2a)', () => {
	it('Test L1: imports trade lifecycle modules', () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/);
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeId['"]/);
		expect(componentSource).toMatch(/mintTradeId/);
		expect(componentSource).toMatch(/clearTradeId/);
		expect(componentSource).toMatch(/trackTradeEvent/);
	});

	it("Test L2: handleDeploy uses trackTradeEvent('trade_button_clicked', ...) with order_type: 'limit'", () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_button_clicked['"][\s\S]*?order_type:\s*['"]limit['"]/
		);
	});

	it("Test L3: emits 'limit_order_deployed' via trackTradeEvent (both no-warning and warning-acknowledged paths)", () => {
		// Both deploy paths must use trackTradeEvent — no raw track('limit_order_deployed') calls left.
		const matches = componentSource.match(/trackTradeEvent\(\s*['"]limit_order_deployed['"]/g);
		expect(matches).toBeTruthy();
		expect(matches!.length).toBeGreaterThanOrEqual(2);
		const rawTrack = componentSource.match(/track\(\s*['"]limit_order_deployed['"]/g);
		expect(rawTrack).toBeNull();
	});

	it('Test L4: handleDeploy pairs mintTradeId() with clearTradeId() reachable from finally', () => {
		const handlerStart = componentSource.indexOf('const handleDeploy');
		expect(handlerStart).toBeGreaterThan(-1);
		const handlerBlock = componentSource.slice(handlerStart, handlerStart + 5000);
		expect(handlerBlock).toMatch(/mintTradeId\(\)/);
		// Find `finally {` then ensure `clearTradeId()` appears within ~300 chars
		// after it (covers both direct call and guarded `if (!deferredToProceed) clearTradeId()`).
		const finallyIdx = handlerBlock.indexOf('finally {');
		expect(finallyIdx).toBeGreaterThan(-1);
		const after = handlerBlock.slice(finallyIdx, finallyIdx + 300);
		expect(after).toMatch(/clearTradeId\(\)/);
	});

	it('Test L4b: warning-deferred paths (proceedWithDeploy + cancelDeploy) call clearTradeId', () => {
		// Pitfall 2 (T-2-E) — warning-acknowledged AND warning-cancel paths must
		// clear the deferred trade_id minted by handleDeploy.
		const proceedFn = componentSource.match(/const proceedWithDeploy = [\s\S]*?\n\s*\};/);
		const cancelFn = componentSource.match(/const cancelDeploy = [\s\S]*?\n\s*\};/);
		expect(proceedFn).toBeTruthy();
		expect(cancelFn).toBeTruthy();
		expect(proceedFn![0]).toMatch(/clearTradeId\(\)/);
		expect(cancelFn![0]).toMatch(/clearTradeId\(\)/);
	});

	it('Test L4c: component teardown clears a trade id deferred to the warning modal', () => {
		const destroyFn = componentSource.match(/onDestroy\(\(\) => \{[\s\S]*?\n\s*\}\);/);
		expect(destroyFn).toBeTruthy();
		expect(destroyFn![0]).toMatch(/if \(pendingTradeId\)[\s\S]*?clearTradeId\(\)/);
		expect(destroyFn![0]).toMatch(/pendingTradeId = null/);
	});

	it('Test L5: emits trade_failed with order_type "limit" and error_class on error path', () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_failed['"][\s\S]*?order_type:\s*['"]limit['"][\s\S]*?error_class:/
		);
	});

	it('Test L5b: warning-acknowledged deployment failures emit trade_failed', () => {
		const proceedFn = componentSource.match(/const proceedWithDeploy = [\s\S]*?\n\s*\};/);
		expect(proceedFn).toBeTruthy();
		expect(proceedFn![0]).toMatch(
			/catch \(error\)[\s\S]*?trackTradeEvent\(\s*['"]trade_failed['"]/
		);
		expect(proceedFn![0]).toMatch(/error_class:\s*classifyError\(error\)/);
	});

	it('Test L6: panel-level events route through trackTradeEvent', () => {
		// Following the PR-174 review: every name in TradeEventName goes through
		// trackTradeEvent so the trade_id property is consistently attached.
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_panel_opened['"]/);
		expect(componentSource).toMatch(/trackTradeEvent\(\s*['"]trade_panel_abandoned['"]/);
	});

	it('Test L7: shared classifyError covers the deploy-scope ErrorClass branches', () => {
		expect(classifyError(new Error('user denied tx'))).toBe('user_rejected');
		expect(classifyError(new Error('User rejected the request'))).toBe('user_rejected');
		expect(classifyError(new Error('Insufficient balance'))).toBe('insufficient_balance');
		expect(classifyError(new Error('rpc connection refused'))).toBe('rpc_error');
		expect(classifyError(new Error('something went sideways'))).toBe('unknown');
	});

	it('Test L8: component imports the shared classifyError', () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/classifyError['"]/);
		expect(componentSource).toMatch(/classifyError\s*\(/);
	});

	it("Test L9: deployOrder caller passes eventContext: { order_type: 'limit' } per Task 2c contract", () => {
		// transactionStore.handleLimitDeploy now requires the eventContext parameter
		// (Task 2c modifies the orderDeployment.ts signature; LimitOrder must update
		// the call site to satisfy the typed contract).
		expect(componentSource).toMatch(/order_type:\s*['"]limit['"]/);
		expect(componentSource).toMatch(/trade_id:\s*(tradeId|pendingTradeId)/);
		expect(componentSource).toMatch(/await\s+transactionStore\.handleLimitDeploy/);
	});
});
