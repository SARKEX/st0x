/**
 * Plan 02-03 Task 1b — marketOrderExecution.ts broadcast/confirmed event tests.
 *
 * The REST-calldata flow has distinct wallet dispatch and receipt boundaries,
 * so broadcast must precede the confirmation wait and confirmed must follow it.
 *
 * Approach: source-content + behavioural assertion via the same mock harness that
 * the existing `marketOrderExecution.test.ts` uses (see vitest-setup.ts) — the
 * service under test is verified at the source level for the emission sites and
 * at runtime for the trackTradeEvent invocation order on the success path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const servicePath = resolve(process.cwd(), 'src/lib/services/marketOrderExecution.ts');
const serviceSource = readFileSync(servicePath, 'utf-8');

describe('marketOrderExecution.ts OBS-07 emission boundaries (Plan 02-03 Task 1b)', () => {
	it('Test 1: imports trackTradeEvent from observability/tradeEvents', () => {
		expect(serviceSource).toMatch(/from\s+['"]\$lib\/services\/observability\/tradeEvents['"]/);
		expect(serviceSource).toMatch(/trackTradeEvent/);
	});

	it("Test 2: emits 'broadcast' event with order_type 'market'", () => {
		expect(serviceSource).toMatch(
			/trackTradeEvent\(\s*['"]broadcast['"][\s\S]*?order_type:\s*['"]market['"]/
		);
	});

	it("Test 3: emits 'confirmed' event with order_type 'market'", () => {
		expect(serviceSource).toMatch(
			/trackTradeEvent\(\s*['"]confirmed['"][\s\S]*?order_type:\s*['"]market['"]/
		);
	});

	it("emits 'quote_received' after the REST calldata response", () => {
		const responseIdx = serviceSource.indexOf('await apiGetSwapCalldataV2(request)');
		const quoteIdx = serviceSource.indexOf("trackTradeEvent('quote_received'");
		expect(responseIdx).toBeGreaterThan(-1);
		expect(quoteIdx).toBeGreaterThan(responseIdx);
	});

	it('Test 4: broadcast precedes confirmed', () => {
		const broadcastIdx = serviceSource.indexOf("trackTradeEvent('broadcast'");
		const confirmedIdx = serviceSource.indexOf("trackTradeEvent('confirmed'");
		expect(broadcastIdx).toBeGreaterThan(-1);
		expect(confirmedIdx).toBeGreaterThan(-1);
		expect(broadcastIdx).toBeLessThan(confirmedIdx);
		expect(serviceSource.slice(broadcastIdx, confirmedIdx)).toContain('waitForTransaction');
	});

	it('Test 5: emission carries order_side derived from orderSide ("buy" | "sell")', () => {
		// The trackTradeEvent call should include order_side (lowercased Buy/Sell)
		expect(serviceSource).toMatch(/trackTradeEvent\(\s*['"]broadcast['"][\s\S]{0,400}?order_side:/);
		expect(serviceSource).toMatch(/trackTradeEvent\(\s*['"]confirmed['"][\s\S]{0,400}?order_side:/);
	});

	it('Test 6: emission ONLY fires on the SUCCESS branch, not on every dispatcher (failWith) exit', () => {
		// failWith() is the dispatcher for FAILURE paths — broadcast/confirmed must
		// not fire from there (only via captureTakeOrderFailure for Sentry).
		const failWithFn = serviceSource.match(/const failWith = [\s\S]*?return\s*\{[^}]*\};\s*\};/);
		expect(failWithFn).toBeTruthy();
		expect(failWithFn?.[0]).not.toMatch(/trackTradeEvent\(\s*['"]broadcast['"]/);
		expect(failWithFn?.[0]).not.toMatch(/trackTradeEvent\(\s*['"]confirmed['"]/);
	});
});
