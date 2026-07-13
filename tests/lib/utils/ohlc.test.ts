import { describe, it, expect } from 'vitest';
import {
	apiTradesToHistoryPoints,
	tradesToOHLCBuckets,
	tradesToVolumeBuckets,
	type ApiTradeLike
} from '$lib/utils/ohlc';
import type { TradeHistoryPoint } from '$lib/components/charts/token-chart-types';

const ASSET = '0xasset';
const QUOTE = '0xusdc';
const assetSet = new Set([ASSET]);

function trade(partial: Partial<ApiTradeLike> & Pick<ApiTradeLike, 'timestamp'>): ApiTradeLike {
	return {
		inputToken: { address: ASSET },
		outputToken: { address: QUOTE },
		inputAmount: '1',
		outputAmount: '100',
		...partial
	};
}

describe('apiTradesToHistoryPoints', () => {
	it('reads a bid: order receives asset (input), gives quote (output)', () => {
		const [p] = apiTradesToHistoryPoints(
			[trade({ timestamp: 1, inputAmount: '2', outputAmount: '210' })],
			assetSet,
			QUOTE
		);
		expect(p.side).toBe('bid');
		expect(p.tokens).toBe(2);
		expect(p.quote).toBe(210);
		expect(p.price).toBe(105); // 210 / 2
		expect(p.timestamp).toBe(1000); // seconds → ms
	});

	it('reads an ask: order gives asset (output), receives quote (input)', () => {
		const [p] = apiTradesToHistoryPoints(
			[
				trade({
					timestamp: 2,
					inputToken: { address: QUOTE },
					outputToken: { address: ASSET },
					inputAmount: '300',
					outputAmount: '3'
				})
			],
			assetSet,
			QUOTE
		);
		expect(p.side).toBe('ask');
		expect(p.tokens).toBe(3);
		expect(p.quote).toBe(300);
		expect(p.price).toBe(100); // 300 / 3
	});

	it('skips trades that do not pair the asset with the quote token', () => {
		const points = apiTradesToHistoryPoints(
			[trade({ timestamp: 1, inputToken: { address: '0xother' }, outputToken: { address: QUOTE } })],
			assetSet,
			QUOTE
		);
		expect(points).toHaveLength(0);
	});

	it('skips zero-token / non-finite-price trades', () => {
		const points = apiTradesToHistoryPoints(
			[trade({ timestamp: 1, inputAmount: '0', outputAmount: '100' })],
			assetSet,
			QUOTE
		);
		expect(points).toHaveLength(0);
	});

	it('dedupes identical (timestamp, price, tokens) trades and sorts chronologically', () => {
		const dupe = trade({ timestamp: 5, inputAmount: '1', outputAmount: '100' });
		const earlier = trade({ timestamp: 2, inputAmount: '1', outputAmount: '90' });
		const points = apiTradesToHistoryPoints([dupe, { ...dupe }, earlier], assetSet, QUOTE);
		expect(points).toHaveLength(2);
		expect(points.map((p) => p.timestamp)).toEqual([2000, 5000]);
	});

	it('matches the quote token case-insensitively', () => {
		const points = apiTradesToHistoryPoints(
			[trade({ timestamp: 1 })],
			new Set([ASSET]),
			QUOTE.toUpperCase()
		);
		expect(points).toHaveLength(1);
	});
});

describe('tradesToOHLCBuckets', () => {
	it('returns open/high/low/close per time bucket', () => {
		const points: TradeHistoryPoint[] = [
			{ timestamp: 1_000, price: 100, tokens: 1, quote: 100, side: 'ask' },
			{ timestamp: 30_000, price: 110, tokens: 1, quote: 110, side: 'ask' },
			{ timestamp: 45_000, price: 90, tokens: 1, quote: 90, side: 'ask' }
		];
		const [bucket] = tradesToOHLCBuckets(points, 60); // 60s bucket → all three together
		expect(bucket.o).toBe(100);
		expect(bucket.h).toBe(110);
		expect(bucket.l).toBe(90);
		expect(bucket.c).toBe(90);
	});

	it('splits points into separate buckets by bucket size', () => {
		const points: TradeHistoryPoint[] = [
			{ timestamp: 0, price: 100, tokens: 1, quote: 100, side: 'ask' },
			{ timestamp: 120_000, price: 105, tokens: 1, quote: 105, side: 'ask' }
		];
		expect(tradesToOHLCBuckets(points, 60)).toHaveLength(2);
	});

	it('returns [] for no trades', () => {
		expect(tradesToOHLCBuckets([], 60)).toEqual([]);
	});
});

describe('tradesToVolumeBuckets', () => {
	it('sums traded token volume per bucket', () => {
		const points: TradeHistoryPoint[] = [
			{ timestamp: 1_000, price: 100, tokens: 2, quote: 200, side: 'ask' },
			{ timestamp: 5_000, price: 100, tokens: 3, quote: 300, side: 'ask' }
		];
		const [bucket] = tradesToVolumeBuckets(points, 60);
		expect(bucket.tokens).toBe(5);
	});
});
