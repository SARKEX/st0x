import { describe, expect, it, vi } from 'vitest';
import type { ApiTradeByAddress } from '$lib/api/st0xApi';
import { networks } from '$lib/config/network';
import { getAllTokensByNetwork } from '$lib/config/tokens';
import {
	computePublicTradeActivity,
	fetchNetworkTrades,
	tradeActivityWindow
} from '$lib/server/publicTradeActivity';

function fixtureContext() {
	const network = networks.find((candidate) => candidate.defaultPaymentToken?.address);
	if (!network?.defaultPaymentToken) throw new Error('Expected a configured payment-token network');
	const asset = getAllTokensByNetwork(network.chainId)[0];
	if (!asset) throw new Error('Expected a configured stock token');
	return { network, asset, quote: network.defaultPaymentToken };
}

function trade(
	txHash: string,
	inputAddress: string,
	outputAddress: string,
	inputAmount: string,
	outputAmount: string
): ApiTradeByAddress {
	return {
		chainId: 8453,
		txHash,
		inputAmount,
		outputAmount,
		inputToken: { address: inputAddress, symbol: 'IN', decimals: 18 },
		outputToken: { address: outputAddress, symbol: 'OUT', decimals: 6 },
		orderHash: null,
		timestamp: 1_000,
		blockNumber: 1
	};
}

describe('public trade activity', () => {
	it('uses deterministic five-minute time windows', () => {
		expect(tradeActivityWindow(1_000_500)).toEqual(tradeActivityWindow(1_000_799));
		expect(tradeActivityWindow(1_000_800)).not.toEqual(tradeActivityWindow(1_000_799));
	});

	it('collects one sequential token-set pagination stream per network', async () => {
		const { network } = fixtureContext();
		const firstTrade = trade('0x1', '0x1', '0x2', '1', '2');
		const secondTrade = trade('0x2', '0x2', '0x3', '2', '3');
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({
				trades: [firstTrade],
				pagination: {
					page: 1,
					pageSize: 500,
					totalTrades: 2,
					totalPages: 2,
					hasMore: true
				}
			})
			.mockResolvedValueOnce({
				trades: [secondTrade],
				pagination: {
					page: 2,
					pageSize: 500,
					totalTrades: 2,
					totalPages: 2,
					hasMore: false
				}
			});
		const range = { from: 1_000, to: 2_000 };

		await expect(fetchNetworkTrades(network, range, fetchPage)).resolves.toEqual([
			firstTrade,
			secondTrade
		]);
		expect(fetchPage).toHaveBeenCalledTimes(2);
		const firstRequest = fetchPage.mock.calls[0][0];
		const secondRequest = fetchPage.mock.calls[1][0];
		expect(firstRequest).toEqual(
			expect.objectContaining({
				chainId: network.chainId,
				startTime: range.from,
				endTime: range.to,
				page: 1,
				pageSize: 500,
				denomination: 'wrapped'
			})
		);
		expect(secondRequest).toEqual(expect.objectContaining({ page: 2 }));
		expect(firstRequest.tokenAddresses.length).toBeGreaterThan(0);
		expect(firstRequest.tokenAddresses).toEqual([...new Set(firstRequest.tokenAddresses)].sort());
		expect(firstRequest.tokenAddresses).not.toContain(
			network.defaultPaymentToken?.address.toLowerCase()
		);
		expect(secondRequest.tokenAddresses).toEqual(firstRequest.tokenAddresses);
	});

	it('returns an empty complete page without further requests', async () => {
		const { network } = fixtureContext();
		const fetchPage = vi.fn().mockResolvedValue({
			trades: [],
			pagination: {
				page: 1,
				pageSize: 500,
				totalTrades: 0,
				totalPages: 0,
				hasMore: false
			}
		});

		await expect(
			fetchNetworkTrades(network, { from: 1_000, to: 2_000 }, fetchPage)
		).resolves.toEqual([]);
		expect(fetchPage).toHaveBeenCalledOnce();
	});

	it('rejects the whole snapshot when a later page fails', async () => {
		const { network } = fixtureContext();
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({
				trades: [trade('0x1', '0x1', '0x2', '1', '2')],
				pagination: {
					page: 1,
					pageSize: 500,
					totalTrades: 51,
					totalPages: 2,
					hasMore: true
				}
			})
			.mockRejectedValueOnce(new Error('upstream failed'));

		await expect(
			fetchNetworkTrades(network, { from: 1_000, to: 2_000 }, fetchPage)
		).rejects.toThrow('upstream failed');
	});

	it('preserves the public aggregate contract for batch trades', async () => {
		const { network, asset, quote } = fixtureContext();
		const response = {
			trades: [trade('0x1', asset.address, quote.address, '2', '100')],
			pagination: {
				page: 1,
				pageSize: 500,
				totalTrades: 1,
				totalPages: 1,
				hasMore: false
			}
		};
		const fetchPage = vi.fn().mockResolvedValue(response);

		const result = await computePublicTradeActivity(fetchPage, 1_000_500, [network]);

		expect(result.success).toBe(true);
		expect(result.range).toEqual(tradeActivityWindow(1_000_500));
		expect(result.totals).toEqual({ tradingVolume: 100, totalTrades: 1 });
		expect(result.networks).toHaveLength(1);
		expect(result.networks[0]).toEqual(
			expect.objectContaining({
				chainId: network.chainId,
				networkId: network.id,
				tradingVolume: 100,
				totalTrades: 1
			})
		);
		expect(
			result.networks[0].tokens.find((row) => row.address === asset.address.toLowerCase())
		).toEqual(
			expect.objectContaining({
				inVolume: 2,
				outVolume: 0,
				totalVolume: 2,
				quoteVolume: 100,
				trades: 1
			})
		);
	});
});
