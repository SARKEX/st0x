/**
 * Plan 02-03 Task 2c — orderDeployment.ts mandatory eventContext + page_viewed.
 *
 * Source-content + behaviour verification (matches the convention used by the
 * other event-instrumentation tests in this plan).
 *
 * Per checker fix #6: orderDeployment functions (getLimitOrderDeploymentArgs,
 * getDcaDeploymentArgs) require a mandatory `eventContext: { order_type: 'limit'
 * | 'dca' }` parameter. NO default. NO silent fallback to 'limit'. TypeScript
 * enforces at compile time — this test asserts the source-level signature.
 *
 * Per checker fix #7: trade page route emits `page_viewed` (not `page_opened`)
 * with `page: 'trade'` (not 'trade_page') so the OBS-08 funnel filter on
 * `page === 'trade'` works. Existing call site uses `'trade_page'` and is
 * updated as part of this task.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const orderDeploymentPath = resolve(process.cwd(), 'src/lib/services/orderDeployment.ts');
const orderDeploymentSource = readFileSync(orderDeploymentPath, 'utf-8');

const tradePagePath = resolve(process.cwd(), 'src/routes/(main)/trade/[id]/+page.svelte');
const tradePageSource = readFileSync(tradePagePath, 'utf-8');

const deployStorePath = resolve(process.cwd(), 'src/lib/stores/deployTransactionStore.ts');
const deployStoreSource = readFileSync(deployStorePath, 'utf-8');

describe('orderDeployment.ts mandatory eventContext (Plan 02-03 Task 2c)', () => {
	it('Test O1: imports trackTradeEvent (will emit funnel events)', () => {
		expect(orderDeploymentSource).toMatch(
			/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/
		);
		expect(orderDeploymentSource).toMatch(/trackTradeEvent/);
	});

	it('Test O2: exports DeployEventContext type with order_type union', () => {
		expect(orderDeploymentSource).toMatch(
			/export\s+(interface|type)\s+DeployEventContext[\s\S]*?order_type:\s*['"]limit['"]\s*\|\s*['"]dca['"]/
		);
		expect(orderDeploymentSource).toMatch(/trade_id:\s*string/);
		expect(orderDeploymentSource).toMatch(/order_side:\s*['"]buy['"]\s*\|\s*['"]sell['"]/);
	});

	it('Test O3: getLimitOrderDeploymentArgs requires eventContext as second parameter (no `?`, no default)', () => {
		// Match the signature; the param must NOT have a `?`.
		expect(orderDeploymentSource).toMatch(
			/getLimitOrderDeploymentArgs\s*=\s*async\s*\(\s*network[^,]*,\s*args[^,]*,\s*eventContext\s*:\s*DeployEventContext/
		);
	});

	it('Test O4: getDcaDeploymentArgs requires eventContext as second parameter (no `?`, no default)', () => {
		expect(orderDeploymentSource).toMatch(
			/getDcaDeploymentArgs\s*=\s*async\s*\(\s*network[^,]*,\s*args[^,]*,\s*eventContext\s*:\s*DeployEventContext/
		);
	});

	it('Test O5: emits sign_trade with order type and side from eventContext', () => {
		const signCalls = orderDeploymentSource.match(
			/trackTradeEvent\(\s*['"]sign_trade['"][\s\S]*?\n\s*\}\);/g
		);
		expect(signCalls).toHaveLength(2);
		for (const call of signCalls ?? []) {
			expect(call).toMatch(/order_type:\s*eventContext\.order_type/);
			expect(call).toMatch(/order_side:\s*eventContext\.order_side/);
		}
	});

	it("Test O6: NO silent 'limit' literal default in trackTradeEvent calls (checker fix #6)", () => {
		// All trackTradeEvent invocations in orderDeployment.ts MUST use
		// eventContext.order_type. A bare `order_type: 'limit'` literal would be
		// the silent-fallback bug — assert it's absent.
		const calls = orderDeploymentSource.match(/trackTradeEvent\([\s\S]*?\}\s*\)/g) ?? [];
		for (const call of calls) {
			// Either uses eventContext.order_type, OR doesn't include order_type.
			// Hardcoded 'limit' or 'dca' literals are a bug.
			expect(call).not.toMatch(/order_type:\s*['"]limit['"]/);
			expect(call).not.toMatch(/order_type:\s*['"]dca['"]/);
		}
	});
});

describe('+page.svelte page_viewed (Plan 02-03 Task 2c)', () => {
	it("Test P1: route emits trackPageView('trade', ...) — page === 'trade' for OBS-08 filter (checker fix #7)", () => {
		// Per checker fix #7: page name MUST be 'trade' (not 'trade_page') so
		// OBS-08 funnel can filter `page === 'trade'`. The previous call site
		// used 'trade_page' — this test asserts the rename landed.
		expect(tradePageSource).toMatch(/trackPageView\(\s*['"]trade['"]/);
		// And NOT the old 'trade_page' name (regression guard for the rename).
		expect(tradePageSource).not.toMatch(/trackPageView\(\s*['"]trade_page['"]/);
	});

	it('Test P2: trackPageView call passes token_id from $page.params.id', () => {
		expect(tradePageSource).toMatch(/trackPageView\(\s*['"]trade['"][\s\S]*?token_id:/);
	});
});

describe('deployTransactionStore.ts plumbs eventContext through (Plan 02-03 Task 2c)', () => {
	it('Test S1: handleLimitDeploy accepts eventContext and forwards to getLimitOrderDeploymentArgs', () => {
		expect(deployStoreSource).toMatch(
			/handleLimitDeploy\s*=\s*async\s*\(\s*args[^,]*,\s*eventContext\s*:\s*DeployEventContext/
		);
		expect(deployStoreSource).toMatch(/getLimitOrderDeploymentArgs\([^)]*eventContext/);
	});

	it('Test S2: handleDcaDeploy accepts eventContext and forwards to getDcaDeploymentArgs', () => {
		expect(deployStoreSource).toMatch(
			/handleDcaDeploy\s*=\s*async\s*\(\s*args[^,]*,\s*eventContext\s*:\s*DeployEventContext/
		);
		expect(deployStoreSource).toMatch(/getDcaDeploymentArgs\([^)]*eventContext/);
	});

	it('Test S3: emits broadcast + confirmed events for deploy flow at SDK boundary in handleStrategyDeployment', () => {
		// SDK boundary for deploys lives in handleStrategyDeployment (sendTransaction
		// + waitForTransaction). Plan 02-03 Task 2c §action says emit at SDK
		// callbacks; deployTransactionStore is where that happens. The events fire
		// only when an eventContext is plumbed through (from limit/DCA paths).
		expect(deployStoreSource).toMatch(/trackTradeEvent\(\s*['"]broadcast['"]/);
		expect(deployStoreSource).toMatch(/trackTradeEvent\(\s*['"]confirmed['"]/);
	});

	it('Test S4: reports handled calldata, signing, submission, and confirmation failures to Sentry', () => {
		expect(deployStoreSource).toMatch(/captureTradeFlowError/);
		for (const stage of ['calldata', 'approval', 'signing', 'submission', 'confirmation']) {
			expect(deployStoreSource).toContain(`'${stage}'`);
		}
		expect(deployStoreSource).toMatch(/tradeId:\s*eventContext\.trade_id/);
	});

	it('Test S5: uses one operation name for balance reads and insufficient-balance failures', () => {
		expect(deployStoreSource).toContain("'check_balances'");
		expect(deployStoreSource).not.toContain("'check_balance'");
	});

	it('Test S6: restores and clears the explicit trade id around deferred modal deployment', () => {
		const confirmationStart = deployStoreSource.indexOf('export const showRainlangConfirmation');
		expect(confirmationStart).toBeGreaterThan(-1);
		const confirmationBlock = deployStoreSource.slice(confirmationStart, confirmationStart + 2400);
		expect(confirmationBlock).toMatch(/onDeploy:\s*async/);
		expect(confirmationBlock).toMatch(/setTradeId\(eventContext\.trade_id\)/);
		expect(confirmationBlock).toMatch(/await handleStrategyDeployment/);
		expect(confirmationBlock).toMatch(/finally[\s\S]*?clearTradeId\(\)/);
	});
});
