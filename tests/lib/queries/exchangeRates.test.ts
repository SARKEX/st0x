import { describe, expect, it } from 'vitest';
import {
	buildLookup,
	mapApiWrapRatio,
	mapApiWrapRatioHistory,
	resolveRatio
} from '$lib/queries/exchangeRates';
import type { CategorizedToken } from '$lib/config/tokens';

const tokens: CategorizedToken[] = [
	{
		chainId: 8453,
		address: '0xShare',
		symbol: 'wtSGOV',
		decimals: 18,
		name: 'Wrapped Test SGOV',
		category: 'ST0x',
		unwrappedAddress: '0xAsset',
		limitOrders: []
	}
];

describe('exchangeRates REST adapters', () => {
	it('composes token refs from token metadata and resolves by share or asset address', () => {
		const rate = mapApiWrapRatio(
			{
				shareAddress: '0xShare',
				assetAddress: '0xAsset',
				assetsPerShare: '1.0027',
				blockNumber: 123,
				blockTimestamp: 456,
				capturedAt: '456'
			},
			tokens
		);
		const lookup = buildLookup([rate]);

		expect(rate.share).toEqual({ address: '0xShare', symbol: 'wtSGOV', decimals: 18 });
		expect(rate.asset).toEqual({ address: '0xAsset', symbol: 'tSGOV', decimals: 18 });
		expect(resolveRatio(lookup, '0xShare')).toBe(1.0027);
		expect(resolveRatio(lookup, '0xAsset')).toBe(1.0027);
		expect(resolveRatio(lookup, '0xMissing')).toBe(1);
	});

	it('maps snapshot history events', () => {
		const history = mapApiWrapRatioHistory(
			{
				shareAddress: '0xShare',
				assetAddress: '0xAsset',
				events: [
					{
						type: 'snapshot',
						blockNumber: 123,
						blockTimestamp: 456,
						assetsPerShare: '1.0027',
						capturedAt: '456'
					}
				],
				pagination: {
					page: 1,
					pageSize: 20,
					totalEvents: 1,
					totalPages: 1,
					hasMore: false
				}
			},
			tokens
		);

		expect(history.events).toEqual([
			{
				type: 'snapshot',
				blockNumber: 123,
				blockTimestamp: 456,
				assetsPerShare: '1.0027',
				capturedAt: '456'
			}
		]);
		expect(history.asset.symbol).toBe('tSGOV');
	});
});
