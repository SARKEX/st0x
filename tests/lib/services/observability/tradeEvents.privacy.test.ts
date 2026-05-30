/**
 * Privacy regression test for OBS-07 Plan 02-01 Task 2 (T-2-B mitigation).
 *
 * Verifies trackTradeEvent's `error_message` scrubbing: any 0x[40] address or
 * 0x[130] signature in error_message is redacted to placeholders BEFORE the
 * payload reaches PostHog (mirrors src/lib/observability/scrub.ts which is
 * Sentry-only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const trackMock = vi.fn();

vi.mock('$lib/services/analytics', () => ({
	track: (...args: unknown[]) => trackMock(...args)
}));

vi.mock('$lib/services/observability/tradeId', () => ({
	getCurrentTradeId: () => 'priv-test-uuid'
}));

import { trackTradeEvent } from '$lib/services/observability/tradeEvents';

describe('trackTradeEvent privacy (T-2-B)', () => {
	beforeEach(() => {
		trackMock.mockReset();
	});

	it('redacts a 0x[40] wallet address in error_message', () => {
		const addr = '0x1234567890abcdef1234567890abcdef12345678';
		trackTradeEvent('trade_failed', {
			order_type: 'market',
			error_class: 'rpc_error',
			error_message: `Failed for ${addr}`
		});

		expect(trackMock).toHaveBeenCalledTimes(1);
		const [, payload] = trackMock.mock.calls[0];
		const msg = (payload as { error_message: string }).error_message;
		expect(msg).toContain('[REDACTED_ADDR]');
		expect(msg).not.toContain(addr);
	});

	it('redacts a 0x[130] signature in error_message', () => {
		const sig = '0x' + 'a'.repeat(130);
		trackTradeEvent('trade_failed', {
			order_type: 'market',
			error_class: 'rpc_error',
			error_message: `Sig: ${sig}`
		});

		const [, payload] = trackMock.mock.calls[0];
		const msg = (payload as { error_message: string }).error_message;
		expect(msg).toContain('[REDACTED_SIGNATURE]');
		expect(msg).not.toContain(sig);
	});

	it('leaves error_message untouched when no PII patterns present', () => {
		trackTradeEvent('trade_failed', {
			order_type: 'market',
			error_class: 'slippage_exceeded',
			error_message: 'Price moved beyond slippage tolerance'
		});
		const [, payload] = trackMock.mock.calls[0];
		expect((payload as { error_message: string }).error_message).toBe(
			'Price moved beyond slippage tolerance'
		);
	});

	it('does not crash when error_message is absent', () => {
		expect(() =>
			trackTradeEvent('trade_failed', {
				order_type: 'market',
				error_class: 'unknown'
			})
		).not.toThrow();
	});
});
