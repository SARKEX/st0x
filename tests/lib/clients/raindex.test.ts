import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { createRaindexClient } from '$lib/clients/raindex';
import { prepareBrowserRaindexSettings } from '$lib/clients/raindexSettings';

const SETTINGS_URL = 'https://registry.example/settings.yaml';
const SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/raindex-base/0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D-8e9477b/gn';
const SETTINGS_YAML = `version: 6
networks:
  base:
    rpcs:
      - https://mainnet.base.org
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
		expect(fetchMock).toHaveBeenNthCalledWith(1, `${window.location.origin}/registry/manifest`);
		expect(fetchMock).toHaveBeenNthCalledWith(2, SETTINGS_URL);
		client.free();
	});
});
