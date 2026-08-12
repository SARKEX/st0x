import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	kvGet: vi.fn(),
	list: vi.fn(),
	getServerApplicationCatalog: vi.fn(),
	getTokensByNetwork: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: { BLOB_READ_WRITE_TOKEN: 'blob-token' } }));
vi.mock('$lib/server/rateLimit', () => ({
	getClientIp: () => '127.0.0.1',
	rateLimiters: {
		publicApi: vi.fn(async () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }))
	}
}));
vi.mock('$lib/server/cache', () => ({
	withConditionalCache: vi.fn(async (_key, load) => load()),
	CACHE_KEYS: { publicTvl: () => 'public-tvl' },
	CACHE_TTL: { LONG: 3600 }
}));
vi.mock('$lib/server/kv', () => ({
	kvGet: mocks.kvGet,
	KV_KEYS: { snapshotBlocks: () => 'snapshot-blocks' }
}));
vi.mock('@vercel/blob', () => ({ list: mocks.list }));
vi.mock('$lib/server/applicationCatalog', () => ({
	getServerApplicationCatalog: mocks.getServerApplicationCatalog
}));
vi.mock('$lib/config/tokens', () => ({
	getTokensByNetwork: mocks.getTokensByNetwork
}));

import { GET } from './+server';

type TvlEvent = Parameters<typeof GET>[0];
const network = { id: 8453, chainId: 8453 };
const token = {
	chainId: 8453,
	address: '0x1111111111111111111111111111111111111111',
	symbol: 'wtTEST',
	decimals: 18,
	category: 'ST0x'
};

describe('/api/public/tvl compatibility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getServerApplicationCatalog.mockResolvedValue({
			tokenCatalog: [token],
			networkCatalog: [network]
		});
		mocks.getTokensByNetwork.mockReturnValue([token]);
		mocks.kvGet.mockResolvedValue([
			{ chainId: 8453, blockNumber: 123, timestamp: 1_700_000_000, date: '2026-08-11' }
		]);
		mocks.list.mockResolvedValue({ blobs: [{ url: 'https://blob.example/snapshot.json' }] });
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							balances: { '0xholder': '2000000000000000000' },
							price: { price: 5 }
						}),
						{ status: 200 }
					)
			)
		);
	});

	it('returns canonical chain-qualified fields and legacy fields for one network', async () => {
		const response = await GET({
			request: new Request('http://localhost/api/public/tvl')
		} as TvlEvent);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.latest).toMatchObject({
			totalTvl: 10,
			blockNumber: 123,
			tokenTvl: { '8453:wtTEST': 10, wtTEST: 10 },
			networks: [{ chainId: 8453, blockNumber: 123, totalTvl: 10 }]
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://blob.example/snapshot.json',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('omits legacy fields when multiple networks are configured but only one has a snapshot', async () => {
		mocks.getServerApplicationCatalog.mockResolvedValue({
			tokenCatalog: [token],
			networkCatalog: [network, { id: 10, chainId: 10 }]
		});

		const response = await GET({
			request: new Request('http://localhost/api/public/tvl')
		} as TvlEvent);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.latest.tokenTvl).toEqual({ '8453:wtTEST': 10 });
		expect(body.latest).not.toHaveProperty('blockNumber');
	});
});
