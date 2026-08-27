import { describe, expect, it, vi } from 'vitest';
import { fetchJson, HttpError, isRateLimitError } from './http';

describe('fetchJson structured errors', () => {
	it('surfaces 429 metadata without creating a retry storm', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response('{}', {
				status: 429,
				headers: { 'retry-after': '2' }
			})
		);

		const result = fetchJson('/api/st0x/v1/orders/token/test', { fetchFn });

		await expect(result).rejects.toMatchObject({
			status: 429,
			code: 'HTTP_429',
			retryAfter: '2'
		});
		await expect(result).rejects.toSatisfy(isRateLimitError);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('preserves API code, request id, status, and retry metadata', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					request_id: 'request-123',
					error: {
						code: 'ORDERS_QUERY_FAILED',
						message: 'The order source could not serve this request'
					}
				}),
				{
					status: 502,
					headers: { 'retry-after': '5' }
				}
			)
		);

		const result = fetchJson('/api/st0x/v1/orders/token/test', {
			fetchFn,
			retries: 0
		});

		await expect(result).rejects.toBeInstanceOf(HttpError);
		await expect(result).rejects.toMatchObject({
			name: 'HttpError',
			status: 502,
			code: 'ORDERS_QUERY_FAILED',
			requestId: 'request-123',
			publicMessage: 'The order source could not serve this request',
			retryAfter: '5'
		});
	});

	it('does not retry a non-retryable client failure', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					request_id: 'request-400',
					error: { code: 'SWAP_UNSUPPORTED_TOKEN', message: 'Unsupported token' }
				}),
				{ status: 400 }
			)
		);

		await expect(fetchJson('/api/st0x/v1/tokens', { fetchFn })).rejects.toMatchObject({
			code: 'SWAP_UNSUPPORTED_TOKEN'
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('uses the correlation header when a noncanonical error has no body request id', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response('gateway failed', {
				status: 502,
				statusText: 'Bad Gateway',
				headers: { 'x-request-id': 'proxy-request-456' }
			})
		);

		await expect(
			fetchJson('/api/st0x/v1/orders/token/test', { fetchFn, retries: 0 })
		).rejects.toMatchObject({
			code: 'HTTP_502',
			requestId: 'proxy-request-456',
			publicMessage: 'Bad Gateway'
		});
	});

	it('does not retry an aborted request', async () => {
		const abort = new Error('aborted');
		abort.name = 'AbortError';
		const fetchFn = vi.fn().mockRejectedValue(abort);
		const controller = new AbortController();

		await expect(
			fetchJson('/api/st0x/v1/orders/query', {
				fetchFn,
				signal: controller.signal
			})
		).rejects.toBe(abort);
		expect(fetchFn).toHaveBeenCalledOnce();
	});

	it('cancels a retry delay before another request is sent', async () => {
		const controller = new AbortController();
		const fetchFn = vi.fn().mockImplementation(async () => {
			controller.abort();
			return new Response('{}', { status: 502 });
		});

		await expect(
			fetchJson('/api/st0x/v1/orders/query', {
				fetchFn,
				retryDelayMs: 10_000,
				signal: controller.signal
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetchFn).toHaveBeenCalledOnce();
	});
});
