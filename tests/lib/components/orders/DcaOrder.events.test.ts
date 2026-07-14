/**
 * Plan 02-03 Task 2b — DcaOrder.svelte gap-fill (zero analytics today).
 *
 * Source-content + pure-logic verification (matches LimitOrder.events.test.ts
 * pattern). DCA had ZERO analytics before this plan — every assertion below is
 * a regression guard for the gap-fill (Assumption A7 in 02-RESEARCH).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentPath = resolve(process.cwd(), 'src/lib/components/orders/DcaOrder.svelte');
const componentSource = readFileSync(componentPath, 'utf-8');

describe('DcaOrder.svelte event instrumentation (Plan 02-03 Task 2b)', () => {
	it('Test D1: imports trade lifecycle modules (raw analytics import removed)', () => {
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/);
		expect(componentSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeId['"]/);
		expect(componentSource).toMatch(/trackTradeEvent/);
		expect(componentSource).toMatch(/withTradeId/);
		// Raw `track` is no longer used — every panel-level event goes via trackTradeEvent.
		expect(componentSource).not.toMatch(
			/import\s+\{\s*track\s*\}\s+from\s+['"]\$lib\/services\/analytics['"]/
		);
	});

	it("Test D2: mount fires trackTradeEvent('trade_panel_opened', { order_type: 'dca', ... }) — gap-fill", () => {
		// DCA had zero analytics before; the mount event is the gap-fill regression guard.
		expect(componentSource).toMatch(/onMount\s*\(/);
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_panel_opened['"][\s\S]*?order_type:\s*['"]dca['"]/
		);
	});

	it("Test D3: deploy handler uses trackTradeEvent('trade_button_clicked', ...) with order_type: 'dca'", () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_button_clicked['"][\s\S]*?order_type:\s*['"]dca['"]/
		);
	});

	it("Test D4: deploy handler emits 'limit_order_deployed' with order_type 'dca' (per Assumption A7 — reuse deploy event family)", () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]limit_order_deployed['"][\s\S]*?order_type:\s*['"]dca['"]/
		);
	});

	it('Test D5: deploy handler brackets the submit body with withTradeId()', () => {
		// withTradeId owns mint/clear lifecycle — call site must not open-code it.
		expect(componentSource).toMatch(/await\s+withTradeId\(async\s*\(tradeId\)/);
		expect(componentSource).not.toMatch(/mintTradeId\(\)/);
		expect(componentSource).not.toMatch(/clearTradeId\(\)/);
	});

	it('Test D6: emits trade_failed with order_type: "dca" + error_class on error path', () => {
		expect(componentSource).toMatch(
			/trackTradeEvent\(\s*['"]trade_failed['"][\s\S]*?order_type:\s*['"]dca['"][\s\S]*?error_class:/
		);
	});

	it("Test D7: DCA caller passes eventContext: { order_type: 'dca' } to transactionStore.handleDcaDeploy", () => {
		// Per checker fix #6: no silent fallback — DCA must explicitly identify itself.
		expect(componentSource).toMatch(/order_type:\s*['"]dca['"]/);
		expect(componentSource).toMatch(/trade_id:\s*tradeId/);
		expect(componentSource).toMatch(/await\s+transactionStore\.handleDcaDeploy/);
	});

	it('Test D7b: deploy event context keeps user-perspective symbols stable across order sides', () => {
		const deployStart = componentSource.indexOf('await transactionStore.handleDcaDeploy');
		expect(deployStart).toBeGreaterThan(-1);
		const deployCall = componentSource.slice(deployStart, deployStart + 1800);
		expect(deployCall).toMatch(/asset_symbol:\s*selectedInputToken\?\.symbol \?\? ''/);
		expect(deployCall).toMatch(/payment_symbol:\s*selectedOutputToken\?\.symbol \?\? ''/);
		expect(deployCall).not.toMatch(/asset_symbol:[\s\S]*?orderSide === ['"]Buy['"]/);
	});

	it("Test D8: occurrences of order_type: 'dca' >= 2 (mount + deploy events at minimum)", () => {
		const matches = componentSource.match(/order_type:\s*['"]dca['"]/g);
		expect(matches).toBeTruthy();
		expect(matches!.length).toBeGreaterThanOrEqual(2);
	});
});
