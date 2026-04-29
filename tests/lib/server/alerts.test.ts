/**
 * Behavioural unit tests for OBS-04 / D-17 (Plan 01-06) — alerts.ts.
 *
 * Covers:
 *  - Missing OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN in production → no-op + logs error
 *  - Missing OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID in production → no-op + logs error
 *  - Both env vars set → POSTs to https://api.telegram.org/bot<TOKEN>/sendMessage
 *  - Body contains {chat_id, text}; text includes 🚨 prefix, function name,
 *    attempted RPC URLs, request_id
 *  - status_or_error truncated at 512 chars (ERROR_TEXT_CAP)
 *  - 3s AbortSignal.timeout wired in fetch options
 *  - Caught fetch errors are rethrown to caller
 *  - Dev mode (missing env) silently no-ops without error log
 *
 * Per gap instruction: stub $lib/server/logger, $env/dynamic/private, $app/environment,
 * and globalThis.fetch via per-test vi.mock blocks. vitest-setup.ts is not modified.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger, mockGetLogger, mockEnv, mockDevFlag, mockFetch } = vi.hoisted(() => {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
	return {
		mockLogger: logger,
		mockGetLogger: vi.fn(() => logger),
		mockEnv: { OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN: '', OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID: '' } as Record<string, string>,
		mockDevFlag: { current: true },
		mockFetch: vi.fn()
	};
});

vi.mock('$lib/server/logger', () => ({
	getLogger: mockGetLogger,
	getRequestContext: vi.fn(() => undefined)
}));

vi.mock('$env/dynamic/private', () => ({
	get env() {
		return mockEnv;
	}
}));

vi.mock('$app/environment', () => ({
	get dev() {
		return mockDevFlag.current;
	}
}));

// Import AFTER mocks so the module reads the stubbed env + dev flag
import { notifyChainExhausted } from '$lib/server/alerts';

describe('notifyChainExhausted', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN = '';
		mockEnv.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID = '';
		mockDevFlag.current = true;
		globalThis.fetch = mockFetch as unknown as typeof fetch;
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('fail-closed env-var pattern (D-09 + D-17)', () => {
		it('no-ops + logs error when bot token missing in production', async () => {
			mockDevFlag.current = false;
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN = '';
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID = 'chat-123';

			await notifyChainExhausted({
				fn: 'callRpc:eth_blockNumber',
				attempts: [{ rpc_url: 'rpc-a', status_or_error: 'HTTP 500' }],
				request_id: 'req-1'
			});

			expect(mockFetch).not.toHaveBeenCalled();
			expect(mockLogger.error).toHaveBeenCalledTimes(1);
			const [arg] = mockLogger.error.mock.calls[0];
			expect(typeof arg).toBe('string');
			expect(arg).toContain('[alerts]');
			expect(arg).toContain('not configured in production');
			expect(arg).toContain('alerts disabled');
		});

		it('no-ops + logs error when chat id missing in production', async () => {
			mockDevFlag.current = false;
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN = 'bot-token-xyz';
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID = '';

			await notifyChainExhausted({
				fn: 'verifyWalletSignature',
				attempts: [{ rpc_url: 'alchemy-base-mainnet', status_or_error: 'timeout' }],
				request_id: 'req-2'
			});

			expect(mockFetch).not.toHaveBeenCalled();
			expect(mockLogger.error).toHaveBeenCalledTimes(1);
		});

		it('silently no-ops in dev (no error log) when env is missing — cold-start safe', async () => {
			mockDevFlag.current = true;
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN = '';
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID = '';

			await notifyChainExhausted({
				fn: 'fn',
				attempts: [],
				request_id: 'req-dev'
			});

			expect(mockFetch).not.toHaveBeenCalled();
			expect(mockLogger.error).not.toHaveBeenCalled();
		});
	});

	describe('Telegram POST (both env vars set)', () => {
		beforeEach(() => {
			mockDevFlag.current = false;
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN = 'BOTSECRETTOKEN';
			mockEnv.OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID = '-100123456789';
		});

		it('POSTs to https://api.telegram.org/bot<TOKEN>/sendMessage with {chat_id, text} body', async () => {
			await notifyChainExhausted({
				fn: 'callRpc:eth_blockNumber',
				attempts: [
					{ rpc_url: 'https://rpc-a.example/', status_or_error: 'HTTP 502' },
					{ rpc_url: 'https://rpc-b.example/', status_or_error: 'connection refused' }
				],
				request_id: 'req-uuid-42'
			});

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://api.telegram.org/botBOTSECRETTOKEN/sendMessage');
			expect(opts.method).toBe('POST');
			expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');

			expect(typeof opts.body).toBe('string');
			const body = JSON.parse(opts.body as string);
			expect(body).toHaveProperty('chat_id', '-100123456789');
			expect(body).toHaveProperty('text');
		});

		it('text body includes 🚨 prefix, function name, attempted RPC URLs, and request_id', async () => {
			await notifyChainExhausted({
				fn: 'callRpc:eth_call',
				attempts: [
					{ rpc_url: 'https://rpc-1.example/', status_or_error: 'HTTP 502' },
					{ rpc_url: 'https://rpc-2.example/', status_or_error: 'connection refused' }
				],
				request_id: 'req-uuid-77'
			});

			const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(opts.body as string);
			const text: string = body.text;

			expect(text).toContain('🚨');
			expect(text).toContain('callRpc:eth_call');
			expect(text).toContain('https://rpc-1.example/');
			expect(text).toContain('HTTP 502');
			expect(text).toContain('https://rpc-2.example/');
			expect(text).toContain('connection refused');
			expect(text).toContain('req-uuid-77');
			expect(text).toContain('request_id');
		});

		it('truncates per-error status_or_error at 512 chars (ERROR_TEXT_CAP)', async () => {
			const huge = 'X'.repeat(2000); // > 512 cap
			await notifyChainExhausted({
				fn: 'callRpc:eth_call',
				attempts: [{ rpc_url: 'rpc-a', status_or_error: huge }],
				request_id: 'req-cap'
			});

			const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(opts.body as string);
			const text: string = body.text;

			// Original 2000-char run must NOT appear verbatim
			expect(text).not.toContain('X'.repeat(2000));
			// 512-char run MUST appear (the cap kept exactly that many)
			expect(text).toContain('X'.repeat(512));
			// Truncation marker MUST appear
			expect(text).toContain('[truncated]');
			// And the marker must follow exactly 512 X's (no more)
			expect(text).not.toContain('X'.repeat(513));
		});

		it('wires AbortSignal with a 3s timeout in fetch options', async () => {
			// AbortSignal.timeout returns an AbortSignal — we can't directly read its
			// timeout, but we CAN assert the fetch options carry an AbortSignal-shaped
			// object. Spy on AbortSignal.timeout to confirm both presence + 3000ms.
			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

			await notifyChainExhausted({
				fn: 'fn',
				attempts: [{ rpc_url: 'rpc-a', status_or_error: 'X' }],
				request_id: 'req-timeout'
			});

			expect(timeoutSpy).toHaveBeenCalledWith(3000);

			const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(opts.signal).toBeDefined();
			// Cross-realm safety: the signal should at minimum expose the AbortSignal API
			expect(typeof (opts.signal as AbortSignal).aborted).toBe('boolean');

			timeoutSpy.mockRestore();
		});

		it('rethrows fetch errors to the caller (rpcMetrics.reportChainExhausted catches them)', async () => {
			const fetchErr = new Error('telegram unreachable');
			mockFetch.mockRejectedValueOnce(fetchErr);

			await expect(
				notifyChainExhausted({
					fn: 'fn',
					attempts: [{ rpc_url: 'rpc-a', status_or_error: 'X' }],
					request_id: 'req-fetch-err'
				})
			).rejects.toBe(fetchErr);
		});
	});
});
