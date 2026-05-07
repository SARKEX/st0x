/**
 * Behavioural unit tests for OBS-07 Plan 02-01 Task 2 — trackTradeEvent typed wrapper.
 *
 * Covers (per 02-01-PLAN.md):
 *  - Test 1: trackTradeEvent('trade_button_clicked', props) calls track once with name
 *    and properties merged with trade_id
 *  - Test 2: When getCurrentTradeId() returns null, trade_id is null in payload (still emitted)
 *  - Test 3: When track throws, trackTradeEvent swallows + console.error logs
 *  - Test 4: All 12 TradeEventName values accept type-wise (compile-time + runtime)
 *  - Test 5: All 11 ErrorClass values type-wise (compile-time + runtime)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const trackMock = vi.fn();
const getCurrentTradeIdMock = vi.fn<[], string | null>();

vi.mock('$lib/services/analytics', () => ({
	track: (...args: unknown[]) => trackMock(...args)
}));

vi.mock('$lib/services/observability/tradeId', () => ({
	getCurrentTradeId: () => getCurrentTradeIdMock()
}));

import {
	trackTradeEvent,
	type TradeEventName,
	type ErrorClass,
	type TradeEventProps
} from '$lib/services/observability/tradeEvents';

describe('trackTradeEvent', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		trackMock.mockReset();
		getCurrentTradeIdMock.mockReset();
		getCurrentTradeIdMock.mockReturnValue('test-uuid');
	});

	it('Test 1: calls track once with eventName + props + trade_id', () => {
		const props: TradeEventProps = {
			order_type: 'market',
			order_side: 'buy',
			asset_symbol: 'tNVDA'
		};
		trackTradeEvent('trade_button_clicked', props);

		expect(trackMock).toHaveBeenCalledTimes(1);
		const [name, payload] = trackMock.mock.calls[0];
		expect(name).toBe('trade_button_clicked');
		expect(payload).toMatchObject({
			order_type: 'market',
			order_side: 'buy',
			asset_symbol: 'tNVDA',
			trade_id: 'test-uuid'
		});
	});

	it('Test 2: emits trade_id=null when no id is active (still present)', () => {
		getCurrentTradeIdMock.mockReturnValue(null);
		trackTradeEvent('trade_panel_opened', { order_type: 'limit' });

		expect(trackMock).toHaveBeenCalledTimes(1);
		const [, payload] = trackMock.mock.calls[0];
		expect(payload).toHaveProperty('trade_id', null);
	});

	it('Test 3: when track throws, swallows + console.error logs', () => {
		trackMock.mockImplementation(() => {
			throw new Error('track exploded');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() =>
			trackTradeEvent('confirmed', { order_type: 'market' })
		).not.toThrow();

		const errLine = consoleSpy.mock.calls.find(
			(call) =>
				typeof call[0] === 'string' && call[0].includes('[trackTradeEvent] failed')
		);
		expect(errLine).toBeDefined();
	});

	it('Test 4: all 12 TradeEventName values accepted + emitted', () => {
		const names: TradeEventName[] = [
			'trade_panel_opened',
			'trade_button_clicked',
			'quote_received',
			'trade_initiated',
			'sign_approval',
			'sign_trade',
			'broadcast',
			'confirmed',
			'trade_failed',
			'trade_panel_abandoned',
			'trade_error_shown',
			'limit_order_deployed'
		];
		for (const n of names) {
			trackTradeEvent(n, { order_type: 'market' });
		}
		expect(trackMock).toHaveBeenCalledTimes(names.length);
		const namesSeen = trackMock.mock.calls.map((c) => c[0]);
		expect(namesSeen).toEqual(names);
	});

	it('Test 5: all 11 ErrorClass values accepted (compile-time + runtime)', () => {
		const classes: ErrorClass[] = [
			'slippage_exceeded',
			'no_liquidity',
			'stale_oracle',
			'insufficient_balance',
			'market_closed',
			'user_rejected',
			'rpc_error',
			'preflight_chain_unreachable',
			'preflight_order_vanished',
			'auto_retry_exhausted',
			'unknown'
		];
		for (const c of classes) {
			trackTradeEvent('trade_failed', { order_type: 'market', error_class: c });
		}
		expect(trackMock).toHaveBeenCalledTimes(classes.length);
		const classesSeen = trackMock.mock.calls.map(
			(c) => (c[1] as { error_class: ErrorClass }).error_class
		);
		expect(classesSeen).toEqual(classes);
	});
});
