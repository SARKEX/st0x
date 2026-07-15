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

		await expect(fetchJson('/api/st0x/v1/swap/quote', { fetchFn })).rejects.toMatchObject({
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
});
