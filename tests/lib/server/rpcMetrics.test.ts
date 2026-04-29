/**
 * Behavioural unit tests for OBS-04 (Plan 01-06) — rpcMetrics.ts.
 *
 * Covers:
 *  - recordRpcAttempt({ok: true})  → debug-level pino line, event: 'rpc_attempt'
 *  - recordRpcAttempt({ok: false}) → warn-level pino line,  event: 'rpc_failed'
 *  - reportChainExhausted          → error-level pino line  AND notifyChainExhausted call
 *  - chain-exhausted log/payload carries fn, attempts (rpc_url + last status_or_error each),
 *    and request_id from getRequestContext()
 *  - notifyChainExhausted alert-delivery exception is caught + logged (rpcMetrics never throws)
 *
 * Implementation pinning: src/lib/server/rpcMetrics.ts. Logger + alerts are stubbed
 * via `vi.mock` per-file — vitest-setup.ts is intentionally not modified.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockGetLogger, mockGetRequestContext, mockNotifyChainExhausted } = vi.hoisted(() => {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
	return {
		mockLogger: logger,
		mockGetLogger: vi.fn(() => logger),
		mockGetRequestContext: vi.fn<[], { request_id?: string } | undefined>(() => undefined),
		mockNotifyChainExhausted: vi.fn(async () => undefined)
	};
});

vi.mock('$lib/server/logger', () => ({
	getLogger: mockGetLogger,
	getRequestContext: mockGetRequestContext
}));

vi.mock('$lib/server/alerts', () => ({
	notifyChainExhausted: mockNotifyChainExhausted
}));

// Import AFTER mocks so the module picks up the stubs
import { recordRpcAttempt, reportChainExhausted } from '$lib/server/rpcMetrics';

describe('recordRpcAttempt', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('emits a debug-level `rpc_attempt` event with all required fields when ok=true', () => {
		recordRpcAttempt({
			rpc_url: 'https://rpc.example/key',
			fn: 'callRpc:eth_blockNumber',
			ok: true,
			status_or_error: 'ok',
			duration_ms: 42
		});

		expect(mockLogger.debug).toHaveBeenCalledTimes(1);
		expect(mockLogger.warn).not.toHaveBeenCalled();
		expect(mockLogger.error).not.toHaveBeenCalled();

		const [payload, msg] = mockLogger.debug.mock.calls[0];
		expect(payload).toMatchObject({
			event: 'rpc_attempt',
			rpc_url: 'https://rpc.example/key',
			fn: 'callRpc:eth_blockNumber',
			ok: true,
			status_or_error: 'ok',
			duration_ms: 42
		});
		expect(msg).toBe('rpc ok');
	});

	it('emits a warn-level `rpc_failed` event with all required fields when ok=false', () => {
		recordRpcAttempt({
			rpc_url: 'https://rpc.example/key',
			fn: 'callRpc:eth_call',
			ok: false,
			status_or_error: 'HTTP 503',
			duration_ms: 1234
		});

		expect(mockLogger.warn).toHaveBeenCalledTimes(1);
		expect(mockLogger.debug).not.toHaveBeenCalled();
		expect(mockLogger.error).not.toHaveBeenCalled();

		const [payload, msg] = mockLogger.warn.mock.calls[0];
		expect(payload).toMatchObject({
			event: 'rpc_failed',
			rpc_url: 'https://rpc.example/key',
			fn: 'callRpc:eth_call',
			ok: false,
			status_or_error: 'HTTP 503',
			duration_ms: 1234
		});
		expect(msg).toBe('rpc failed');
	});

	it('never throws when pino itself throws (CONVENTIONS.md error-handling)', () => {
		mockLogger.warn.mockImplementationOnce(() => {
			throw new Error('pino broken');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() =>
			recordRpcAttempt({
				rpc_url: 'x',
				fn: 'fn',
				ok: false,
				status_or_error: 'err',
				duration_ms: 0
			})
		).not.toThrow();

		expect(consoleSpy).toHaveBeenCalled();
		const recoveryLine = consoleSpy.mock.calls.find(
			(call) => typeof call[0] === 'string' && call[0].includes('[rpcMetrics] failed to record attempt')
		);
		expect(recoveryLine).toBeDefined();
	});
});

describe('reportChainExhausted', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRequestContext.mockReturnValue(undefined);
		mockNotifyChainExhausted.mockResolvedValue(undefined);
	});

	it('logs at error level with `rpc_chain_exhausted` event and forwards attempts + request_id', async () => {
		mockGetRequestContext.mockReturnValue({ request_id: 'req-uuid-42' });

		await reportChainExhausted({
			fn: 'callRpc:eth_blockNumber',
			attempts: [
				{ rpc_url: 'https://rpc-a/', status_or_error: 'HTTP 502' },
				{ rpc_url: 'https://rpc-b/', status_or_error: 'fetch timeout' }
			]
		});

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		const [payload, msg] = mockLogger.error.mock.calls[0];
		expect(payload).toMatchObject({
			event: 'rpc_chain_exhausted',
			fn: 'callRpc:eth_blockNumber',
			request_id: 'req-uuid-42'
		});
		expect(payload.attempts).toEqual([
			{ rpc_url: 'https://rpc-a/', status_or_error: 'HTTP 502' },
			{ rpc_url: 'https://rpc-b/', status_or_error: 'fetch timeout' }
		]);
		expect(msg).toBe('all RPCs failed for one call');
	});

	it('invokes notifyChainExhausted with the same payload + request_id', async () => {
		mockGetRequestContext.mockReturnValue({ request_id: 'req-77' });

		await reportChainExhausted({
			fn: 'verifyWalletSignature',
			attempts: [{ rpc_url: 'alchemy-base-mainnet', status_or_error: 'connection refused' }]
		});

		expect(mockNotifyChainExhausted).toHaveBeenCalledTimes(1);
		const [arg] = mockNotifyChainExhausted.mock.calls[0];
		expect(arg).toEqual({
			fn: 'verifyWalletSignature',
			attempts: [{ rpc_url: 'alchemy-base-mainnet', status_or_error: 'connection refused' }],
			request_id: 'req-77'
		});
	});

	it('falls back to `<no-request>` when no request context is active', async () => {
		mockGetRequestContext.mockReturnValue(undefined);

		await reportChainExhausted({ fn: 'callRpc:fn', attempts: [] });

		const [payload] = mockLogger.error.mock.calls[0];
		expect(payload.request_id).toBe('<no-request>');

		const [alertArg] = mockNotifyChainExhausted.mock.calls[0];
		expect(alertArg.request_id).toBe('<no-request>');
	});

	it('catches alert-delivery failures and logs at error level (caller never sees throw)', async () => {
		const deliveryErr = new Error('telegram offline');
		mockNotifyChainExhausted.mockRejectedValueOnce(deliveryErr);

		await expect(
			reportChainExhausted({
				fn: 'callRpc:eth_call',
				attempts: [{ rpc_url: 'rpc-a', status_or_error: 'X' }]
			})
		).resolves.toBeUndefined();

		// First error log: the chain-exhausted line
		// Second error log: the alert-delivery-failed line
		expect(mockLogger.error).toHaveBeenCalledTimes(2);
		const deliveryLogCall = mockLogger.error.mock.calls.find(
			([, msg]) =>
				typeof msg === 'string' && msg.includes('[rpcMetrics] alert delivery failed')
		);
		expect(deliveryLogCall).toBeDefined();
		const [deliveryPayload] = deliveryLogCall as [Record<string, unknown>, string];
		expect(deliveryPayload.err).toBe('telegram offline');
	});
});
