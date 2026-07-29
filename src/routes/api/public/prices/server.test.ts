import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

vi.mock('$lib/server/rateLimit', () => ({
	getClientIp: () => '127.0.0.1',
	rateLimiters: {
		publicApi: vi.fn(async () => ({
			allowed: true,
			remaining: 99,
			resetAt: Date.now() + 60_000
		}))
	}
}));

vi.mock('$lib/server/kv', () => ({
	getKv: vi.fn(async () => null),
	kvGet: vi.fn(async () => null),
	kvSet: vi.fn(async () => undefined),
	KV_KEYS: {
		midpointLastKnown: (networkId: number) => `midpoint:${networkId}`
	}
}));

import { env } from '$env/dynamic/private';
import { networks } from '$lib/config/network';
import { clearPublicPricesMemoryCache } from '$lib/server/publicPricesCache';
import { GET } from './+server';

type PricesEvent = Parameters<typeof GET>[0];

describe('/api/public/prices', () => {
	beforeEach(() => {
		clearPublicPricesMemoryCache();
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'general-key';
		env.ST0X_API_SECRET = 'general-secret';
		env.ST0X_PRICES_API_KEY = 'prices-key';
		env.ST0X_PRICES_API_SECRET = 'prices-secret';
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses the dedicated credential for one batch stream per network', async () => {
		const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(
			async () =>
				new Response(
					JSON.stringify({
						data: []
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET({
			request: new Request('http://localhost/api/public/prices')
		} as PricesEvent);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(networks.length);
		for (const [url, init] of fetchMock.mock.calls) {
			expect(String(url)).toMatch(/^https:\/\/api\.example\.test\/v1\/prices\?chainId=\d+$/);
			if (!init) throw new Error('Expected batch request options');
			const headers = init.headers as Record<string, string>;
			expect(headers.Authorization).toBe('Basic cHJpY2VzLWtleTpwcmljZXMtc2VjcmV0');
			expect(headers.Authorization).not.toBe('Basic Z2VuZXJhbC1rZXk6Z2VuZXJhbC1zZWNyZXQ=');
		}
	});

	it('preserves a cold 429 and suppresses upstream retries until Retry-After', async () => {
		const fetchMock = vi
			.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>()
			.mockResolvedValue(
				new Response(null, {
					status: 429,
					headers: { 'Retry-After': '60' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);
		const event = {
			request: new Request('http://localhost/api/public/prices')
		} as PricesEvent;

		const first = await GET(event);
		const second = await GET(event);

		expect(first.status).toBe(429);
		expect(first.headers.get('Retry-After')).toBe('60');
		expect(first.headers.get('Cache-Control')).toBe('no-store');
		expect(second.status).toBe(429);
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
