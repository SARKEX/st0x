import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './fetchJson';

describe('fetchJson', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('returns parsed payload for successful JSON responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ ok: true, value: 42 }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		const result = await fetchJson<{ ok: boolean; value: number }>('/api/test');

		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.data).toEqual({ ok: true, value: 42 });
		expect(result.error).toBeUndefined();
	});

	it('extracts API error payloads for non-2xx responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: 'Bad request' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		const result = await fetchJson<{ error: string }>('/api/test');

		expect(result.ok).toBe(false);
		expect(result.status).toBe(400);
		expect(result.error).toBe('Bad request');
		expect(result.data).toEqual({ error: 'Bad request' });
	});

	it('returns null data when response body is not JSON', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));

		const result = await fetchJson('/api/test');

		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.data).toBeNull();
		expect(result.error).toBeUndefined();
	});

	it('returns timeout error when request aborts', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
				return new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				});
			})
		);

		const result = await fetchJson('/api/slow', undefined, 5);

		expect(result.ok).toBe(false);
		expect(result.status).toBe(0);
		expect(result.data).toBeNull();
		expect(result.error).toBe('Request timed out');
	});
});
