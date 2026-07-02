import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequestEvent } from '../../hooks/_helpers';
import { env } from '$env/dynamic/private';
import { GET, POST } from '../../../src/routes/api/st0x/[...path]/+server';

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

type St0xProxyEvent = Parameters<typeof GET>[0];

function proxyEvent(method: string, path: string, body?: BodyInit): St0xProxyEvent {
	const event = createMockRequestEvent({
		method,
		url: `http://localhost/api/st0x/${path}?page=1`,
		body
	});
	return {
		...event,
		params: { path }
	} as St0xProxyEvent;
}

describe('/api/st0x proxy', () => {
	beforeEach(() => {
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'test-key';
		env.ST0X_API_SECRET = 'test-secret';
		vi.restoreAllMocks();
	});

	it('allows GET /v1/tokens without adding a proxy cache header', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify([{ address: '0xToken', symbol: 'TOK', decimals: 18 }]), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
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
			'public, s-maxage=60, stale-while-revalidate=300'
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
		expect(response.headers.get('Cache-Control')).toBeNull();
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
		expect(response.headers.get('Cache-Control')).toBeNull();
		expect(await response.text()).toBe('not json');
		expect(warn).toHaveBeenCalledWith(
			'[st0x-proxy] Skipping token details cache for unreadable response:',
			expect.any(String)
		);
	});

	it('allows cached token details by address endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({ address: '0xToken', activity: { deposits: [], withdraws: [] } }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', 'v1/tokens/0xToken/details'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe(
			'public, s-maxage=60, stale-while-revalidate=300'
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/tokens/0xToken/details?page=1',
			expect.objectContaining({ method: 'GET' })
		);
	});
});
