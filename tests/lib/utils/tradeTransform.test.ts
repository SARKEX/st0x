import { describe, expect, it } from 'vitest';
import { transformApiMarketOrdersToDisplay } from '$lib/utils/tradeTransform';
import type { ApiMarketOrder } from '$lib/api/st0xApi';

const BASE_CHAIN_ID = 8453;

describe('transformApiMarketOrdersToDisplay', () => {
	it('returns empty array for undefined or empty input', () => {
		expect(transformApiMarketOrdersToDisplay(undefined, BASE_CHAIN_ID)).toEqual([]);
		expect(transformApiMarketOrdersToDisplay([], BASE_CHAIN_ID)).toEqual([]);
	});

	it('skips null market orders and entries missing trades', () => {
		const valid: ApiMarketOrder = {
			txHash: '0xabc',
			blockNumber: 1,
			timestamp: 1_700_000_000,
			sender: '0xsender',
			trades: [],
			totals: { totalInputAmount: '0', totalOutputAmount: '0', averageIoRatio: '0' }
		};

		expect(
			transformApiMarketOrdersToDisplay(
				[undefined as unknown as ApiMarketOrder, valid, { ...valid, trades: undefined } as ApiMarketOrder],
				BASE_CHAIN_ID
			)
		).toEqual([]);
	});
});
