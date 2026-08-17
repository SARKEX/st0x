import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaindexClient } from '$lib/clients/raindex';
import { fetchUserVaultsPage } from '$lib/queries/vaults';

vi.mock('$lib/clients/raindex', () => ({
	createRaindexClient: vi.fn()
}));

function mockVault(id: string, balance = '1000') {
	return {
		id,
		owner: '0xd2843d9e7738d46d90cb6dff8d6c83db58b9c165',
		vaultId: 1n,
		balance: {
			toFixedDecimalLossy: () => ({ error: undefined, value: { value: balance } })
		},
		token: {
			id: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
			address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
			name: 'USD Coin',
			symbol: 'USDC',
			decimals: 6n
		},
		raindex: '0xe522cb4a5fcb2eb31a52ff41a4653d85a4fd7c9d',
		ordersAsOutput: [],
		ordersAsInput: []
	};
}

describe('fetchUserVaultsPage', () => {
	const getVaults = vi.fn();

	beforeEach(() => {
		getVaults.mockReset();
		vi.mocked(createRaindexClient).mockResolvedValue({ getVaults } as never);
	});

	it('walks every Raindex page instead of stopping after the first 100 vaults', async () => {
		const pageOne = Array.from({ length: 100 }, (_, i) => mockVault(`0x${i.toString(16)}`, '0'));
		const pageTwo = [mockVault('0xfunded', '919100')];

		getVaults.mockImplementation(async (_chainIds, _filters, page: number) => {
			if (page === 1) {
				return { value: { items: pageOne, hasMore: true, totalItems: 101 } };
			}
			if (page === 2) {
				return { value: { items: pageTwo, hasMore: false, totalItems: 101 } };
			}
			throw new Error(`unexpected page ${page}`);
		});

		const result = await fetchUserVaultsPage(
			8453,
			'0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165',
			0,
			'base'
		);

		expect(getVaults).toHaveBeenCalledTimes(2);
		expect(getVaults).toHaveBeenNthCalledWith(
			1,
			[8453],
			{
				owners: ['0xd2843d9e7738d46d90cb6dff8d6c83db58b9c165'],
				hideZeroBalance: false
			},
			1,
			100
		);
		expect(result.vaults).toHaveLength(101);
		expect(result.vaults.at(-1)?.vault.balance).toBe('919100');
		expect(result.hasMore).toBe(false);
	});

	it('stops after a short first page', async () => {
		getVaults.mockResolvedValue({
			value: { items: [mockVault('0x1', '1000')], hasMore: false, totalItems: 1 }
		});

		const result = await fetchUserVaultsPage(
			8453,
			'0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165',
			0,
			'base'
		);

		expect(getVaults).toHaveBeenCalledTimes(1);
		expect(result.vaults).toHaveLength(1);
	});
});
