import { beforeEach, describe, expect, it, vi } from 'vitest';

const fallbackTokens = new Map([
	[
		'0xspym',
		{
			address: '0xspym',
			symbol: 'wtSPYM',
			priceFeedId: '',
			fallbackPrice: 82.5
		}
	],
	[
		'0xdram',
		{
			address: '0xdram',
			symbol: 'wtDRAM',
			priceFeedId: '',
			fallbackPrice: 50
		}
	]
]);

vi.mock('$lib/config/tokens', () => ({
	getTokenByAnyAddress: (address: string) => fallbackTokens.get(address.toLowerCase()) ?? null
}));

vi.mock('$lib/server/snapshots/marketHours', () => ({
	getPriceTimestamp: (timestamp: number) => timestamp
}));

vi.mock('$env/dynamic/private', () => ({
	env: { LIQUIDITY_MONITOR_URL: 'https://liquidity-monitor.example' }
}));

describe('fetchPythPricesAtTimestamp fallback pricing', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ price: 99 }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
			)
		);
	});

	it('uses the SPYM monitor only for SPYM and preserves other token fallbacks', async () => {
		const { fetchPythPricesAtTimestamp } = await import(
			'../../../../src/lib/server/snapshots/pyth'
		);
		const result = await fetchPythPricesAtTimestamp(1_700_000_000, ['0xspym', '0xdram']);

		expect(result.prices.get('0xspym')?.price).toBe(99);
		expect(result.prices.get('0xdram')?.price).toBe(50);
	});
});
