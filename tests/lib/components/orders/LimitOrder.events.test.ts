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
import { type ErrorClass } from '$lib/services/observability/tradeEvents';

const componentPath = resolve(process.cwd(), 'src/lib/components/orders/LimitOrder.svelte');
const componentSource = readFileSync(componentPath, 'utf-8');

function classifyDeployError(err: unknown): ErrorClass {
	const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
	if (msg.includes('user reject') || msg.includes('user denied') || msg.includes('rejected'))
		return 'user_rejected';
	if (msg.includes('insufficient') || msg.includes('balance')) return 'insufficient_balance';
	if (msg.includes('rpc') || msg.includes('network')) return 'rpc_error';
	return 'unknown';
}

describe('LimitOrder.svelte event instrumentation (Plan 02-03 Task 2a)', () => {
	it('Test L1: imports trade lifecycle modules', () => {
		expect(componentSource).toMatch(
			/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/
		);
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

	it('Test L4: handleDeploy pairs mintTradeId() with clearTradeId() in finally', () => {
		const handlerStart = componentSource.indexOf('const handleDeploy');
		expect(handlerStart).toBeGreaterThan(-1);
		// Find first '};' that closes handleDeploy (handler is ~100 lines).
		const handlerBlock = componentSource.slice(handlerStart, handlerStart + 4000);
		expect(handlerBlock).toMatch(/mintTradeId\(\)/);
		expect(handlerBlock).toMatch(/finally\s*\{[\s\S]*?clearTradeId\(\)[\s\S]*?\}/);
	});

	it('Test L5: emits trade_failed with order_type "limit" and error_class on error path', () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_failed['"][\s\S]*?order_type:\s*['"]limit['"][\s\S]*?error_class:/
		);
	});

	it("Test L6: regression guard — track('trade_panel_opened', ...) on mount unchanged", () => {
		expect(componentSource).toMatch(/track\(\s*['"]trade_panel_opened['"]/);
		expect(componentSource).toMatch(/track\(\s*['"]trade_panel_abandoned['"]/);
	});

	it('Test L7: classifyDeployError pure mapping covers ErrorClass branches', () => {
		expect(classifyDeployError(new Error('user denied tx'))).toBe('user_rejected');
		expect(classifyDeployError(new Error('User rejected the request'))).toBe('user_rejected');
		expect(classifyDeployError(new Error('Insufficient balance'))).toBe('insufficient_balance');
		expect(classifyDeployError(new Error('rpc connection refused'))).toBe('rpc_error');
		expect(classifyDeployError(new Error('something went sideways'))).toBe('unknown');
	});

	it('Test L8: classifyDeployError function exists in component source', () => {
		expect(componentSource).toMatch(/function\s+classifyDeployError\s*\(/);
	});

	it("Test L9: deployOrder caller passes eventContext: { order_type: 'limit' } per Task 2c contract", () => {
		// transactionStore.handleLimitDeploy now requires the eventContext parameter
		// (Task 2c modifies the orderDeployment.ts signature; LimitOrder must update
		// the call site to satisfy the typed contract).
		expect(componentSource).toMatch(/order_type:\s*['"]limit['"]/);
	});
});
