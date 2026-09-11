import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaindexClient } from '$lib/clients/raindex';
import { fetchUserVaultsPage, filterTokenDetailsSummariesForChain } from '$lib/queries/vaults';
import type { ApiTokenDetailsSummary } from '$lib/api/st0xApi';

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

function summary(
	overrides: Partial<ApiTokenDetailsSummary> & Pick<ApiTokenDetailsSummary, 'chainId' | 'address'>
): ApiTokenDetailsSummary {
	return {
		name: 'Wrapped Test',
		symbol: 'wtTEST',
		decimals: 18,
		totalSupply: '0',
		holderCount: 0,
		transferCount: 0,
		bridgedSupply: '0',
		depositVolume: '0',
		withdrawVolume: '0',
		activityVolume: '0',
		...overrides
	};
}

describe('filterTokenDetailsSummariesForChain', () => {
	it('keeps only the requested chain and dedupes by address', () => {
		const shared = '0x1d6f0763e58fa6d472d470eaaef0a4c08080d208';
		const filtered = filterTokenDetailsSummariesForChain(
			[
				summary({ chainId: 999, address: shared, symbol: 'wtTTWO' }),
				summary({ chainId: 1, address: shared, symbol: 'wtTTWO' }),
				summary({
					chainId: 8453,
					address: '0x045fb493d970f94a54feaf931033622fc82192e6',
					symbol: 'wtTTWO'
				}),
				summary({
					chainId: 8453,
					address: '0x045FB493d970f94A54FeAf931033622fc82192E6',
					symbol: 'wtTTWO-DUP'
				}),
				summary({
					chainId: 8453,
					address: '0x78c31580c97101694C70022c83D570150c11e935',
					symbol: 'wtSGOV'
				})
			],
			8453
		);

		expect(
			filtered.map((row) => ({ chainId: row.chainId, symbol: row.symbol, address: row.address }))
		).toEqual([
			{
				chainId: 8453,
				symbol: 'wtTTWO',
				address: '0x045fb493d970f94a54feaf931033622fc82192e6'
			},
			{
				chainId: 8453,
				symbol: 'wtSGOV',
				address: '0x78c31580c97101694C70022c83D570150c11e935'
			}
		]);
	});

	it('selects the requested chain and rejects summaries without a valid chainId', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const base = { chainId: 8453, address: '0xBase' };
		const ethereum = { chainId: 1, address: '0xEthereum' };
		const missingChain = { address: '0xMissing' };
		const invalidChain = { chainId: '8453', address: '0xInvalid' };

		expect(
			filterTokenDetailsSummariesForChain([base, ethereum, missingChain, invalidChain], 8453)
		).toEqual([base]);
		expect(warn).toHaveBeenCalledTimes(2);
	});
});

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
