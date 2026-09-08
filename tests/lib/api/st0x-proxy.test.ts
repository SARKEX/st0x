import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from '../../hooks/_helpers';
import { env } from '$env/dynamic/private';
import { GET, POST } from '../../../src/routes/api/st0x/[...path]/+server';
import { clearLocalSt0xProxyCache } from '$lib/server/st0xProxyCache';

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

type St0xProxyEvent = Parameters<typeof GET>[0];

function tokenDetailsBody() {
	return {
		chainId: 8453,
		address: '0xToken',
		name: 'Wrapped Token',
		symbol: 'wtTOK',
		decimals: 18,
		totalSupply: '100',
		holderCount: 1,
		transferCount: 2,
		bridgedSupply: '100',
		depositVolume: '10',
		withdrawVolume: '5',
		activityVolume: '15',
		sftVaultAddress: '0xVault',
		deployTimestamp: 1,
		deployer: '0xDeployer',
		admin: '0xAdmin',
		activity: { deposits: [], withdraws: [] }
	};
}

function proxyEvent(
	method: string,
	path: string,
	body?: BodyInit,
	headers?: Record<string, string>
): St0xProxyEvent {
	const event = createMockRequestEvent({
		method,
		url: `http://localhost/api/st0x/${path}?page=1`,
		body,
		headers
	});
	return {
		...event,
		params: { path }
	} as St0xProxyEvent;
}

describe('/api/st0x proxy', () => {
	beforeEach(() => {
		clearLocalSt0xProxyCache();
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'test-key';
		env.ST0X_API_SECRET = 'test-secret';
		vi.restoreAllMocks();
	});

	it('edge-caches the stable GET /v1/tokens metadata response', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify([{ address: '0xToken', symbol: 'TOK', decimals: 18 }]), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=300, stale-while-revalidate=3600'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens?page=1',
			expect.objectContaining({
				method: 'GET',
				headers: expect.any(Headers)
			})
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Headers).get('Authorization')).toBe(
			'Basic dGVzdC1rZXk6dGVzdC1zZWNyZXQ='
		);
	});

	it('does not edge-cache a malformed successful token list', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify([{ address: '0xToken', decimals: 18 }]), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});

	it('allows POST /v1/swap/quote and forwards the JSON body without caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ estimatedInput: '100' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = JSON.stringify({
			inputToken: '0xIn',
			outputToken: '0xOut',
			outputAmount: '1'
		});

		const response = await POST(proxyEvent('POST', 'v1/swap/quote', body));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/swap/quote?page=1',
			expect.objectContaining({ method: 'POST' })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(await new Response(init.body).text()).toBe(body);
	});

	it('allows POST /v1/orders/query without unsafe URI-only shared caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					orders: [],
					pagination: {
						page: 1,
						pageSize: 50,
						totalOrders: 0,
						totalPages: 0,
						hasMore: false
					}
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = JSON.stringify({
			chainId: 8453,
			tokenAddresses: ['0xToken'],
			page: 1,
			pageSize: 50
		});

		const response = await POST(proxyEvent('POST', 'v1/orders/query', body));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/orders/query?page=1',
			expect.objectContaining({ method: 'POST' })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(await new Response(init.body).text()).toBe(body);
	});

	it('allows POST /v1/trades/query without unsafe URI-only shared caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					trades: [],
					pagination: {
						page: 1,
						pageSize: 50,
						totalTrades: 0,
						totalPages: 0,
						hasMore: false
					}
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = JSON.stringify({
			chainId: 8453,
			tokenAddresses: ['0xToken'],
			startTime: 1_000,
			endTime: 2_000,
			page: 1,
			pageSize: 50
		});

		const response = await POST(proxyEvent('POST', 'v1/trades/query', body));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/trades/query?page=1',
			expect.objectContaining({ method: 'POST' })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(await new Response(init.body).text()).toBe(body);
	});

	it('allows POST /v1/swap/calldata without caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ to: '0xOrderbook', data: '0x', value: '0', approvals: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await POST(proxyEvent('POST', 'v1/swap/calldata', '{}'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/swap/calldata?page=1',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('allows POST /v2/swap/calldata and forwards slippage without caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					to: '0xOrderbook',
					data: '0x1234',
					value: '0x0',
					estimatedInput: '100',
					denomination: 'wrapped',
					resolvedPriceCap: '2.02',
					approvals: []
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = JSON.stringify({
			taker: '0xTaker',
			inputToken: '0xIn',
			outputToken: '0xOut',
			mode: 'spendUpTo',
			amount: '100',
			slippageBps: 100
		});

		const response = await POST(proxyEvent('POST', 'v2/swap/calldata', body));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v2/swap/calldata?page=1',
			expect.objectContaining({ method: 'POST' })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(await new Response(init.body).text()).toBe(body);
	});

	it('allows POST /v2/swap/quote and forwards slippage without caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					inputToken: '0xIn',
					outputToken: '0xOut',
					mode: 'spendUpTo',
					amount: '100',
					denomination: 'wrapped',
					estimatedInput: '100',
					estimatedOutput: '0.75',
					estimatedIoRatio: '133.33',
					fullyFilled: true,
					resolvedPriceCap: '134.66'
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = JSON.stringify({
			taker: '0xTaker',
			inputToken: '0xIn',
			outputToken: '0xOut',
			mode: 'spendUpTo',
			amount: '100',
			slippageBps: 100
		});

		const response = await POST(proxyEvent('POST', 'v2/swap/quote', body));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v2/swap/quote?page=1',
			expect.objectContaining({ method: 'POST' })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(await new Response(init.body).text()).toBe(body);
	});

	it('allows GET /v1/trades/tx/:hash without caching', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ txHash: '0x1234', trades: [], totals: {} }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/trades/tx/0x1234'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/trades/tx/0x1234?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('edge-caches token trade responses for a full activity window', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					trades: [],
					pagination: {
						page: 1,
						pageSize: 200,
						totalTrades: 0,
						totalPages: 0,
						hasMore: false
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/trades/token/0xToken'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=900, stale-while-revalidate=3600'
		);
	});

	it('allows cached wrap-ratio endpoints', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: [], errors: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/wrap-ratio'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=60, stale-while-revalidate=300'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens/wrap-ratio?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('allows cached wrap-ratio history endpoints', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					shareAddress: '0xShare',
					assetAddress: '0xAsset',
					events: [],
					pagination: {
						page: 1,
						pageSize: 20,
						totalEvents: 0,
						totalPages: 0,
						hasMore: false
					}
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/wrap-ratio/0xShare/history'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=60, stale-while-revalidate=300'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens/wrap-ratio/0xShare/history?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('allows cached token details list endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: [], errors: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/details'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=300, stale-while-revalidate=3600'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens/details?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('does not cache partial token details list responses', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [{ address: '0xGood' }],
					errors: [{ address: '0xMissing', message: 'subgraph returned error status' }]
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/details'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({
			data: [{ address: '0xGood' }],
			errors: [{ address: '0xMissing', message: 'subgraph returned error status' }]
		});
	});

	it('does not cache unreadable token details list responses', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockResolvedValue(
			new Response('not json', {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/details'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.text()).toBe('not json');
		expect(warn).toHaveBeenCalledWith(
			'[st0x-proxy] Skipping token metadata cache for unreadable response:',
			expect.any(String)
		);
	});

	it('does not cache malformed successful token details lists', async () => {
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = await GET(proxyEvent('GET', 'v1/tokens/details'));
		const second = await GET(proxyEvent('GET', 'v1/tokens/details'));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(first.headers.get('Cache-Control')).toBe('no-store');
		expect(second.headers.get('Cache-Control')).toBe('no-store');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('allows cached token details by address endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(tokenDetailsBody()), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/0xToken/details'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=300, stale-while-revalidate=3600'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens/0xToken/details?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('does not cache malformed successful token details responses', async () => {
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = await GET(proxyEvent('GET', 'v1/tokens/0xToken/details'));
		const second = await GET(proxyEvent('GET', 'v1/tokens/0xToken/details'));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(first.headers.get('Cache-Control')).toBe('no-store');
		expect(second.headers.get('Cache-Control')).toBe('no-store');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('coalesces concurrent cacheable requests and reuses the origin response', async () => {
		let resolveFetch: ((response: Response) => void) | undefined;
		const fetchMock = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = GET(proxyEvent('GET', 'v1/orders/token/0xShared'));
		const second = GET(proxyEvent('GET', 'v1/orders/token/0xShared'));
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		resolveFetch?.(
			new Response(JSON.stringify({ orders: [], pagination: { hasMore: false } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const [firstResponse, secondResponse] = await Promise.all([first, second]);
		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const thirdResponse = await GET(proxyEvent('GET', 'v1/orders/token/0xShared'));
		expect(thirdResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps omitted and explicit upstream parameters in separate cache entries', async () => {
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response(JSON.stringify({ orders: [], pagination: { hasMore: false } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = await GET(proxyEvent('GET', 'v1/orders/token/0xAbC'));
		const secondEvent = proxyEvent('GET', 'v1/orders/token/0xabc');
		secondEvent.url = new URL(
			'http://localhost/api/st0x/v1/orders/token/0xabc?noise=unique&pageSize=50&page=1'
		);
		const second = await GET(secondEvent);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).not.toBe(fetchMock.mock.calls[1][0]);
	});

	it('still normalizes address casing and ignores irrelevant cache-busting params', async () => {
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response(JSON.stringify({ orders: [], pagination: { hasMore: false } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const firstEvent = proxyEvent('GET', 'v1/orders/token/0xAbC');
		firstEvent.url = new URL('http://localhost/api/st0x/v1/orders/token/0xAbC?pageSize=50&page=1');
		const first = await GET(firstEvent);
		const secondEvent = proxyEvent('GET', 'v1/orders/token/0xabc');
		secondEvent.url = new URL(
			'http://localhost/api/st0x/v1/orders/token/0xabc?noise=unique&pageSize=50&page=1'
		);
		const second = await GET(secondEvent);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('forwards the website request id and preserves upstream correlation metadata', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					request_id: 'web-request-123',
					error: { code: 'ORDERS_QUERY_FAILED', message: 'Order source unavailable' }
				}),
				{
					status: 502,
					headers: {
						'Content-Type': 'application/json',
						'X-Request-Id': 'web-request-123',
						'Retry-After': '5'
					}
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(
			proxyEvent('GET', 'v1/orders/token/0xToken', undefined, {
				'X-Request-Id': 'web-request-123'
			})
		);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Headers).get('X-Request-Id')).toBe('web-request-123');
		expect(response.status).toBe(502);
		expect(response.headers.get('X-Request-Id')).toBe('web-request-123');
		expect(response.headers.get('Retry-After')).toBe('5');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toMatchObject({
			request_id: 'web-request-123',
			error: { code: 'ORDERS_QUERY_FAILED' }
		});
	});

	it('replaces an invalid request id before forwarding it upstream', async () => {
		const incomingId = 'x'.repeat(129);
		const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
			const requestId = (init.headers as Headers).get('X-Request-Id');
			return new Response(
				JSON.stringify({
					request_id: requestId,
					error: { code: 'ORDERS_QUERY_FAILED', message: 'Order source unavailable' }
				}),
				{
					status: 502,
					headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId ?? '' }
				}
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(
			proxyEvent('GET', 'v1/orders/token/0xToken', undefined, {
				'X-Request-Id': incomingId
			})
		);
		const body = await response.json();
		const forwardedId = (fetchMock.mock.calls[0][1].headers as Headers).get('X-Request-Id');

		expect(forwardedId).toMatch(/^[0-9a-f-]{36}$/);
		expect(forwardedId).not.toBe(incomingId);
		expect(response.headers.get('X-Request-Id')).toBe(forwardedId);
		expect(body.request_id).toBe(forwardedId);
	});

	it('returns a correlated static envelope when the upstream cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private DNS detail')));

		const response = await GET(
			proxyEvent('GET', 'v1/orders/token/0xToken', undefined, {
				'X-Request-Id': 'web-request-503'
			})
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(response.headers.get('X-Request-Id')).toBe('web-request-503');
		expect(body).toEqual({
			request_id: 'web-request-503',
			error: {
				code: 'UPSTREAM_UNAVAILABLE',
				message: 'The trading API is unavailable'
			}
		});
		expect(JSON.stringify(body)).not.toContain('private DNS detail');
	});
});
