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

describe('/api/st0x informational proxy', () => {
	beforeEach(() => {
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'test-key';
		env.ST0X_API_SECRET = 'test-secret';
		vi.restoreAllMocks();
	});

	it('proxies and edge-caches the supported token list', async () => {
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
			expect.objectContaining({ method: 'GET', headers: expect.any(Headers) })
		);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Headers).get('Authorization')).toBe(
			'Basic dGVzdC1rZXk6dGVzdC1zZWNyZXQ='
		);
	});

	it('does not cache a malformed successful token list', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify([{ address: '0xToken', decimals: 18 }]), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		const response = await GET(proxyEvent('GET', 'v1/tokens'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBeNull();
	});

	it.each([
		'v1/tokens/details',
		'v1/tokens/0xToken/details',
		'v1/tokens/wrap-ratio',
		'v1/tokens/wrap-ratio/0xToken',
		'v1/tokens/wrap-ratio/0xToken/history',
		'v1/tokens/0xToken/proofs'
	])('keeps informational issuance endpoint /%s available', async (path) => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: [], errors: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(proxyEvent('GET', path));

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it.each([
		['GET', 'v1/orders/token/0xToken'],
		['GET', 'v1/orders/owner/0xOwner'],
		['POST', 'v1/orders/query'],
		['GET', 'v1/trades/token/0xToken'],
		['GET', 'v1/trades/tx/0xHash'],
		['GET', 'v1/trades/taker/0xTaker'],
		['POST', 'v1/trades/query'],
		['POST', 'v1/swap/quote'],
		['POST', 'v1/swap/calldata'],
		['POST', 'v2/swap/quote'],
		['POST', 'v2/swap/calldata']
	])('rejects retired %s /%s without contacting the upstream', async (method, path) => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const response =
			method === 'GET'
				? await GET(proxyEvent(method, path))
				: await POST(proxyEvent(method, path, '{}'));

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			error: { code: 'NOT_FOUND', message: 'Proxy route not found' }
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a static error without leaking an upstream failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private DNS detail')));

		const response = await GET(proxyEvent('GET', 'v1/tokens'));
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body).toMatchObject({
			error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The ST0x API is unavailable' }
		});
		expect(JSON.stringify(body)).not.toContain('private DNS detail');
	});
});
