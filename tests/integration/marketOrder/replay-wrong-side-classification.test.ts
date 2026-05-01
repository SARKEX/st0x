import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTranscript } from '../../helpers/loadTranscript';
import { buildHydratedQuote, STD_NETWORK, STD_TOKENS } from './_replay-helpers';

const { mockGetSignerAddress, mockGetLoadBalancedClient, mockClient } = vi.hoisted(() => ({
	mockGetSignerAddress: vi.fn(() => '0xb000000000000000000000000000000000000000'),
	mockGetLoadBalancedClient: vi.fn(),
	mockClient: { getOrders: vi.fn(), getOrderQuotesBatch: vi.fn() }
}));
vi.mock('$lib/services/walletService', () => ({ getSignerAddress: mockGetSignerAddress }));
vi.mock('$lib/clients/raindex', () => ({ getLoadBalancedClient: mockGetLoadBalancedClient }));
vi.mock('$lib/stores/marketTakeStore', () => ({
	preloadAggregatedTakeOrdersCalldata: vi.fn(),
	handleAggregatedTakeOrdersCalldata: vi.fn(async () => true),
	handleOracleOrders: vi.fn(async () => undefined)
}));
const { mockCaptureTakeOrderFailure } = vi.hoisted(() => ({
	mockCaptureTakeOrderFailure: vi.fn()
}));
vi.mock('$lib/services/observability/captureTakeOrderFailure', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return { ...actual, captureTakeOrderFailure: mockCaptureTakeOrderFailure };
});
vi.mock('$lib/stores/transactionShared', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	const { writable } = await import('svelte/store');
	return {
		...actual,
		transactionStoreInternal: writable({ status: 'Success! Transaction confirmed', error: '' })
	};
});
vi.mock('@rainlanguage/orderbook', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	class StubRaindexOrders {
		push() {}
	}
	return { ...actual, RaindexOrders: StubRaindexOrders };
});

import { executeMarketOrder } from '$lib/services/marketOrderExecution';

describe('replay: wrong-side-classification', () => {
	beforeEach(() => {
		mockGetSignerAddress.mockReturnValue('0xb000000000000000000000000000000000000000');
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
	});
	afterEach(() => { vi.clearAllMocks(); });

	it('classifies side-mismatched quote as no_walk_fills', async () => {
		const transcript = loadTranscript('wrong-side-classification');
		// Fixture: bid quote (counterparty buys asset) but takerAction is Buy
		// (the taker also wants to buy asset). Side cannot match — walkOrderbook
		// produces no fills, surfacing no_walk_fills.
		expect(transcript.takerAction).toBe('Buy');

		// Build a side-mismatched quote and zero its quotePerAsset so walkOrderbook's
		// `if (!price || price <= 0) continue` branch (orderbook.ts:323) skips it,
		// producing zero fills. Mirrors the production OBS-03 surface where a
		// misclassified quote presents as no_walk_fills (the maker side is the
		// non-canonical side AND price derivation collapses to 0).
		const wrongSideQuote = buildHydratedQuote('0xwrong1', 'bid');
		wrongSideQuote.quotePerAsset = 0;

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000n,
			inputMode: 'spend',
			slippageBps: transcript.slippageBps,
			...STD_TOKENS,
			network: STD_NETWORK as unknown as Parameters<typeof executeMarketOrder>[0]['network'],
			quotes: [wrongSideQuote]
		});

		expect(result.success).toBe(false);
		const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
		expect(reasons).toContain('no_walk_fills');
	});
});
