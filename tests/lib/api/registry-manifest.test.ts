import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { createMockRequestEvent } from '../../hooks/_helpers';
import { GET } from '../../../src/routes/registry/manifest/+server';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const SOURCE_COMMIT = '6d9aa935642b44d32b184449ed549f510810437f';
const PUBLIC_REGISTRY_URL = `https://raw.githubusercontent.com/ST0x-Technology/st0x.registry/${SOURCE_COMMIT}/registry`;
type RegistryManifestEvent = Parameters<typeof GET>[0];

function registryManifestEvent(): RegistryManifestEvent {
	return createMockRequestEvent({ pathname: '/registry/manifest' }) as RegistryManifestEvent;
}

describe('/registry/manifest', () => {
	beforeEach(() => {
		env.ST0X_API_URL = 'https://api.example.test/';
		env.ST0X_API_KEY = 'test-key';
		env.ST0X_API_SECRET = 'test-secret';
		vi.restoreAllMocks();
	});

	it('serves the public manifest matching the REST API active source commit', async () => {
		const manifest = [
			`${PUBLIC_REGISTRY_URL.replace(/\/registry$/, '')}/settings.yaml`,
			`fixed-limit ${PUBLIC_REGISTRY_URL.replace(/\/registry$/, '')}/src/fixed-limit.rain`
		].join('\n');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ registry_type: 'private_artifact', source_commit: SOURCE_COMMIT }),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(new Response(manifest, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(registryManifestEvent());

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(manifest);
		expect(response.headers.get('x-registry-source-commit')).toBe(SOURCE_COMMIT);
		expect(response.headers.get('cache-control')).toBe('public, max-age=300');
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'https://api.example.test/registry',
			expect.objectContaining({ cache: 'no-store' })
		);
		const metadataHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
		expect(metadataHeaders.authorization).toBe('Basic dGVzdC1rZXk6dGVzdC1zZWNyZXQ=');
		expect(fetchMock).toHaveBeenNthCalledWith(2, PUBLIC_REGISTRY_URL, {
			cache: 'no-store'
		});
	});

	it('rejects an invalid source commit without fetching public content', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ registry_type: 'private_artifact', source_commit: '../main' }),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(registryManifestEvent());

		expect(response.status).toBe(502);
		expect(await response.text()).toBe('Registry metadata is invalid');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalled();
	});

	it('does not expose registry content when metadata is unavailable', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET(registryManifestEvent());

		expect(response.status).toBe(502);
		expect(await response.text()).toBe('Registry metadata is unavailable');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalled();
	});
});
