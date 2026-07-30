import { describe, expect, it } from 'vitest';
import { TOKENS } from '$lib/config/tokens';
import type { ApiMarketPrice } from '$lib/api/st0xApi';
import { generateSnapshot } from './processor';

const token = TOKENS[0];
const marketPrice: ApiMarketPrice = {
	chainId: token.chainId,
	assetAddress: token.address.toLowerCase(),
	symbol: token.symbol,
	quoteAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
	bestBid: '99',
	bestAsk: '101',
	midpoint: '100',
	source: 'historical',
	observedAt: 1_784_799_940,
	change24hPercent: null
};

describe('snapshot REST market prices', () => {
	it('writes the midpoint and observation time in the backward-compatible blob shape', () => {
		const snapshot = generateSnapshot(
			[],
			123,
			1_784_800_000,
			token.address.toLowerCase(),
			marketPrice
		);

		expect(snapshot.price).toEqual({
			price: 100,
			confidence: null,
			pricePublishTime: 1_784_799_940
		});
		expect(snapshot.priceTimestamp).toBe(1_784_799_940);
	});

	it('records no price when the retained history has no observation', () => {
		const snapshot = generateSnapshot([], 123, 1_784_800_000, token.address.toLowerCase());

		expect(snapshot.price).toBeNull();
		expect(snapshot.priceTimestamp).toBeNull();
	});
});
