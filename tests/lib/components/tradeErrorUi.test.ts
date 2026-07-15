import { describe, expect, it } from 'vitest';
import { createTradeError } from '$lib/services/tradeError';
import {
	selectVisibleTradeError,
	toTradeFailureAnalytics
} from '$lib/components/trade/tradeErrorUi';

describe('trade error UI state', () => {
	it('gives the current blocking quote failure precedence over an older execution failure', () => {
		const executionError = createTradeError('WALLET_SIGNATURE_REJECTED', {
			stage: 'signing'
		});
		const quoteError = createTradeError('ORDERS_QUERY_FAILED', {
			stage: 'quote',
			requestId: 'request-current'
		});

		expect(selectVisibleTradeError(quoteError, executionError)).toBe(quoteError);
		expect(selectVisibleTradeError(null, executionError)).toBe(executionError);
	});

	it('builds a self-consistent analytics payload from the current error', () => {
		const error = createTradeError('UPSTREAM_UNAVAILABLE', {
			stage: 'submission',
			requestId: 'request-99'
		});

		expect(toTradeFailureAnalytics(error)).toEqual({
			error: error.message,
			error_code: 'UPSTREAM_UNAVAILABLE',
			request_id: 'request-99'
		});
	});
});
