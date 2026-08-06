import { describe, expect, it } from 'vitest';
import { getClientRpcUrls } from '$lib/config/clientRpc';

describe('getClientRpcUrls', () => {
	it('preserves registry RPC priority', () => {
		const urls = getClientRpcUrls(['https://primary.example/rpc', 'https://fallback.example/rpc']);
		expect(urls).toEqual(['https://primary.example/rpc', 'https://fallback.example/rpc']);
	});

	it('dedupes equivalent registry RPCs by normalized scheme and host', () => {
		expect(
			getClientRpcUrls([
				'HTTPS://PRIMARY.EXAMPLE/rpc',
				'https://fallback-a.example',
				'https://primary.example/rpc',
				'https://fallback-b.example',
				'https://FALLBACK-A.example'
			])
		).toEqual([
			'HTTPS://PRIMARY.EXAMPLE/rpc',
			'https://fallback-a.example',
			'https://fallback-b.example'
		]);
	});

	it('preserves RPC URLs that differ by path or query casing', () => {
		expect(
			getClientRpcUrls([
				'https://rpc.example/ApiKey?token=AbC',
				'https://rpc.example/apikey?token=AbC',
				'https://rpc.example/ApiKey?token=abc'
			])
		).toEqual([
			'https://rpc.example/ApiKey?token=AbC',
			'https://rpc.example/apikey?token=AbC',
			'https://rpc.example/ApiKey?token=abc'
		]);
	});

	it('rejects an empty registry RPC list', () => {
		expect(() => getClientRpcUrls([])).toThrow('At least one client RPC URL is required');
	});
});
