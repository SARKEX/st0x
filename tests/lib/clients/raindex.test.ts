import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { createRaindexClient } from '$lib/clients/raindex';
import { getRaindexRpcUrls, prepareBrowserRaindexSettings } from '$lib/clients/raindexSettings';

const SETTINGS_URL = 'https://registry.example/settings.yaml';
const SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/raindex-base/0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D-8e9477b/gn';
const SETTINGS_YAML = `version: 6
networks:
  base:
    rpcs:
      - https://mainnet.base.org
      - https://base.drpc.org
      - https://base-rpc.publicnode.com
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: ${SUBGRAPH_URL}
metaboards:
  base: https://metaboard.example/graphql
raindexes:
  base:
    address: 0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D
    network: base
    subgraph: base
    deployment-block: 41747644
    local-db-remote: raindex
rainlangs:
  base:
    address: 0x22508460712C350e914b49155982d3A92D923b10
    network: base
local-db-remotes:
  raindex: https://local-db.example/manifest.yaml
local-db-sync:
  base:
    batch-size: 50
    max-concurrent-batches: 1
    retry-attempts: 3
    retry-delay-ms: 1000
    rate-limit-delay-ms: 5000
    finality-depth: 4
    bootstrap-block-threshold: 300
    sync-interval-ms: 5000
`;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('Raindex client configuration', () => {
	it('removes local DB settings without corrupting canonical values', () => {
		const preparedYaml = prepareBrowserRaindexSettings(SETTINGS_YAML);
		const prepared = parseDocument(preparedYaml);

		expect(prepared.get('local-db-sync')).toBeUndefined();
		expect(prepared.get('local-db-remotes')).toBeUndefined();
		expect(prepared.getIn(['raindexes', 'base', 'local-db-remote'])).toBeUndefined();
		expect(prepared.getIn(['raindexes', 'base', 'deployment-block'])).toBe(41747644);
		expect(preparedYaml).toContain('address: 0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D');
		expect(preparedYaml).toContain('address: 0x22508460712C350e914b49155982d3A92D923b10');
		expect(prepared.getIn(['subgraphs', 'base'])).toBe(SUBGRAPH_URL);
	});

	it('reads the ordered RPC list for a chain', () => {
		expect(getRaindexRpcUrls(SETTINGS_YAML, 8453)).toEqual([
			'https://mainnet.base.org',
			'https://base.drpc.org',
			'https://base-rpc.publicnode.com'
		]);
	});

	it('rejects missing and invalid RPC lists', () => {
		expect(() => getRaindexRpcUrls(SETTINGS_YAML, 1)).toThrow(
			'Registry settings do not contain chain 1'
		);
		expect(() =>
			getRaindexRpcUrls(
				SETTINGS_YAML.replace('https://mainnet.base.org', 'ws://mainnet.base.org'),
				8453
			)
		).toThrow('Registry settings contain an unsupported RPC URL for chain 8453');
	});

	it('aborts a stalled registry request so wallet initialization can fall back', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
					once: true
				});
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const clientPromise = createRaindexClient();
		const rejection = expect(clientPromise).rejects.toThrow('Timed out loading registry manifest');
		await vi.advanceTimersByTimeAsync(5000);

		await rejection;
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
	});

	it('initializes from the canonical registry settings', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(SETTINGS_URL, { status: 200 }))
			.mockResolvedValueOnce(new Response(SETTINGS_YAML, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const client = await createRaindexClient();
		const snapshot = await client.getLocalDbSyncSnapshot();

		expect(client).toBeDefined();
		expect(snapshot.error).toBeUndefined();
		expect(snapshot.value?.configured).toBe(false);
		expect(fetchMock).toHaveBeenNthCalledWith(1, `${window.location.origin}/registry/manifest`, {
			cache: 'no-store',
			signal: expect.any(AbortSignal)
		});
		expect(fetchMock).toHaveBeenNthCalledWith(2, SETTINGS_URL, {
			signal: expect.any(AbortSignal)
		});
		client.free();
	});
});
