import { describe, expect, it } from 'vitest';
import { HttpError } from '$lib/clients/http';
import { createTradeError, toUserFacingTradeError } from '$lib/services/tradeError';

describe('tradeError', () => {
	it('maps a typed REST failure without exposing its raw public message', () => {
		const error = new HttpError({
			status: 502,
			code: 'ORDERS_QUERY_FAILED',
			requestId: 'request-42',
			publicMessage: 'raw upstream wording',
			retryAfter: null
		});

		expect(toUserFacingTradeError(error, 'quote')).toEqual({
			code: 'ORDERS_QUERY_FAILED',
			title: 'Market data unavailable',
			message: 'We could not load current orders. Try again in a moment.',
			requestId: 'request-42',
			stage: 'quote',
			retryable: true,
			action: 'retry',
			errorClass: 'rpc_error'
		});
	});

	it('uses a safe generic presentation for a future canonical API code', () => {
		const error = new HttpError({
			status: 500,
			code: 'FUTURE_API_FAILURE',
			requestId: 'request-future',
			publicMessage: 'do not display this',
			retryAfter: null
		});

		const result = toUserFacingTradeError(error, 'calldata');
		expect(result.code).toBe('FUTURE_API_FAILURE');
		expect(result.requestId).toBe('request-future');
		expect(result.message).not.toContain('do not display this');
	});

	it('normalizes wallet rejection and balance failures to stable local codes', () => {
		expect(toUserFacingTradeError({ code: 4001, message: 'Rejected' }, 'signing')).toMatchObject({
			code: 'TRADE_WALLET_ACTION_REJECTED',
			errorClass: 'user_rejected'
		});
		expect(toUserFacingTradeError(new Error('insufficient funds'), 'approval')).toMatchObject({
			code: 'TRADE_INSUFFICIENT_BALANCE',
			errorClass: 'insufficient_balance'
		});
	});

	it('rejects unsafe codes before they reach support details or telemetry', () => {
		const result = createTradeError('bad code\nsecret', { stage: 'submission' });
		expect(result.code).toBe('TRADE_UNKNOWN');
	});

	it('does not trust structurally similar objects from wallets or SDKs', () => {
		const injected = {
			code: 'ORDERS_QUERY_FAILED',
			title: 'Injected title',
			message: 'Injected raw detail',
			requestId: 'injected-request',
			stage: 'quote',
			retryable: false,
			action: 'none',
			errorClass: 'unknown'
		};

		const result = toUserFacingTradeError(injected, 'quote');
		expect(result.code).toBe('SWAP_QUOTE_FAILED');
		expect(result.message).not.toContain('Injected');
		expect(result.requestId).toBeNull();
	});

	it('provides wait-for-indexing guidance for the canonical REST code', () => {
		const error = new HttpError({
			status: 404,
			code: 'NOT_YET_INDEXED',
			requestId: 'request-indexing',
			publicMessage: 'not yet indexed',
			retryAfter: null
		});

		expect(toUserFacingTradeError(error, 'quote')).toMatchObject({
			code: 'NOT_YET_INDEXED',
			action: 'try_later',
			retryable: true
		});
	});
});
