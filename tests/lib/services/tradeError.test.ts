import { describe, expect, it } from 'vitest';
import { HttpError } from '$lib/clients/http';
import {
	createTradeError,
	shouldRetryTradeQuery,
	toUserFacingTradeError
} from '$lib/services/tradeError';

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

	it('maps oracle-unavailable quotes to temporary price-data guidance', () => {
		const error = new HttpError({
			status: 503,
			code: 'SWAP_ORACLE_UNAVAILABLE',
			requestId: 'request-oracle',
			publicMessage: 'raw oracle dependency wording',
			retryAfter: null
		});

		expect(toUserFacingTradeError(error, 'quote')).toEqual({
			code: 'SWAP_ORACLE_UNAVAILABLE',
			title: 'Price data unavailable',
			message: 'Live price data is temporarily unavailable. Try again in a moment.',
			requestId: 'request-oracle',
			stage: 'quote',
			retryable: true,
			action: 'try_later',
			errorClass: 'stale_oracle'
		});
	});

	it('does not immediately retry explicit backoff responses', () => {
		const httpError = (status: number) =>
			new HttpError({
				status,
				code: `HTTP_${status}`,
				requestId: null,
				publicMessage: 'request failed',
				retryAfter: null
			});

		expect(shouldRetryTradeQuery(0, httpError(429))).toBe(false);
		expect(shouldRetryTradeQuery(0, httpError(503))).toBe(false);
		expect(shouldRetryTradeQuery(0, httpError(502))).toBe(true);
		expect(shouldRetryTradeQuery(1, new Error('network failed'))).toBe(false);
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

	it('maps post-approve calldata lag to TRADE_APPROVAL_SETTLING (ST0-27)', () => {
		expect(
			toUserFacingTradeError(
				new Error('Approval is still settling on-chain. Please try the trade again in a moment.'),
				'approval'
			)
		).toMatchObject({
			code: 'TRADE_APPROVAL_SETTLING',
			stage: 'approval',
			retryable: true,
			action: 'try_later'
		});
	});

	it('maps RPC rate-limit failures to UPSTREAM_UNAVAILABLE instead of stage fallback', () => {
		expect(toUserFacingTradeError(new Error('over rate limit'), 'approval')).toMatchObject({
			code: 'UPSTREAM_UNAVAILABLE',
			stage: 'approval',
			errorClass: 'rpc_error'
		});
		expect(
			toUserFacingTradeError({ code: -32016, message: 'over rate limit' }, 'approval')
		).toMatchObject({
			code: 'UPSTREAM_UNAVAILABLE'
		});
		expect(
			toUserFacingTradeError(new Error('429 Too Many Requests'), 'confirmation')
		).toMatchObject({
			code: 'UPSTREAM_UNAVAILABLE',
			stage: 'confirmation'
		});
	});

	it('maps typed HTTP 429 errors while preserving their request ID', () => {
		const error = new HttpError({
			status: 429,
			code: 'HTTP_429',
			requestId: 'request-rate-limit',
			publicMessage: 'over rate limit',
			retryAfter: '1'
		});

		expect(toUserFacingTradeError(error, 'approval')).toMatchObject({
			code: 'UPSTREAM_UNAVAILABLE',
			requestId: 'request-rate-limit',
			stage: 'approval',
			errorClass: 'rpc_error'
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
