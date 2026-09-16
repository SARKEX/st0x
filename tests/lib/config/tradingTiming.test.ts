import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	APPROVAL_SETTLE_ATTEMPTS,
	APPROVAL_SETTLE_DELAY_MS,
	MARKET_QUOTE_DEBOUNCE_MS,
	TRADE_INDEX_MAX_ATTEMPTS,
	TRADE_INDEX_POLL_INTERVAL_MS
} from '$lib/config/tradingTiming';

describe('tradingTiming (SUP-19)', () => {
	it('keeps quote debounce snappy without going to zero', () => {
		expect(MARKET_QUOTE_DEBOUNCE_MS).toBe(150);
		expect(MARKET_QUOTE_DEBOUNCE_MS).toBeGreaterThan(0);
		expect(MARKET_QUOTE_DEBOUNCE_MS).toBeLessThan(300);
	});

	it('tightens post-approval settle polling vs the prior 4×400ms backoff', () => {
		expect(APPROVAL_SETTLE_ATTEMPTS).toBe(3);
		expect(APPROVAL_SETTLE_DELAY_MS).toBe(200);
		const worstCaseSettleMs =
			APPROVAL_SETTLE_DELAY_MS * (2 ** 0 + 2 ** 1); // attempts 1..2 delays
		expect(worstCaseSettleMs).toBeLessThan(400 * (1 + 2 + 4));
	});

	it('polls trade indexing faster than the previous 5s cadence', () => {
		expect(TRADE_INDEX_POLL_INTERVAL_MS).toBe(2_000);
		expect(TRADE_INDEX_MAX_ATTEMPTS).toBe(60);
		expect(TRADE_INDEX_POLL_INTERVAL_MS * TRADE_INDEX_MAX_ATTEMPTS).toBeLessThan(5_000 * 60);
	});

	it('is wired into market quote + execution paths', () => {
		const files = [
			'src/lib/components/orders/MarketOrder.svelte',
			'src/lib/components/QuickTrade.svelte',
			'src/lib/components/earn/SaveEarnModal.svelte',
			'src/lib/services/marketOrderExecution.ts',
			'src/lib/stores/marketTakeStore.ts'
		];
		for (const relative of files) {
			const source = readFileSync(resolve(process.cwd(), relative), 'utf8');
			expect(source).toContain('$lib/config/tradingTiming');
		}
	});
});
