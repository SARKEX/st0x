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
	getKv: vi.fn(async () => null)
}));

vi.mock('$lib/server/applicationCatalog', () => ({
	ensureServerApplicationCatalog: vi.fn(async () => undefined)
}));

import { env } from '$env/dynamic/private';
import { PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS } from '$lib/server/publicTradeActivity';
import { clearPublicTradeActivityMemoryCache } from '$lib/server/publicTradeActivityCache';
import { GET } from './+server';

type TradeActivityEvent = Parameters<typeof GET>[0];

describe('/api/public/trade-activity', () => {
	beforeEach(() => {
		clearPublicTradeActivityMemoryCache();
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'general-key';
		env.ST0X_API_SECRET = 'general-secret';
		env.ST0X_ACTIVITY_API_KEY = 'activity-key';
		env.ST0X_ACTIVITY_API_SECRET = 'activity-secret';
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses the dedicated credential and the bounded 500-trade page', async () => {
		const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(
			async () =>
				new Response(
					JSON.stringify({
						trades: [],
						pagination: {
							page: 1,
							pageSize: 500,
							totalTrades: 0,
							totalPages: 0,
							hasMore: false
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET({
			request: new Request('http://localhost/api/public/trade-activity')
		} as TradeActivityEvent);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalled();
		for (const [url, init] of fetchMock.mock.calls) {
			expect(url).toBe('https://api.example.test/v2/trades/query');
			if (!init) throw new Error('Expected batch request options');
			const headers = init.headers as Record<string, string>;
			expect(headers.Authorization).toBe('Basic YWN0aXZpdHkta2V5OmFjdGl2aXR5LXNlY3JldA==');
			expect(headers.Authorization).not.toBe('Basic Z2VuZXJhbC1rZXk6Z2VuZXJhbC1zZWNyZXQ=');
			expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ pageSize: 500 }));
		}
	});

	it('preserves a cold 429 and suppresses retries until Retry-After', async () => {
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
			request: new Request('http://localhost/api/public/trade-activity')
		} as TradeActivityEvent;

		const first = await GET(event);
		const requestsAfterFirst = fetchMock.mock.calls.length;
		const second = await GET(event);

		expect(first.status).toBe(429);
		expect(first.headers.get('Retry-After')).toBe('60');
		expect(first.headers.get('Cache-Control')).toBe('no-store');
		expect(second.status).toBe(429);
		expect(fetchMock).toHaveBeenCalledTimes(requestsAfterFirst);
	});

	it('rejects the complete refresh deadline when a dependency does not settle', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => undefined))
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const responsePromise = GET({
			request: new Request('http://localhost/api/public/trade-activity')
		} as TradeActivityEvent);
		await vi.advanceTimersByTimeAsync(PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS);

		await expect(responsePromise).resolves.toMatchObject({ status: 500 });
	});
});
