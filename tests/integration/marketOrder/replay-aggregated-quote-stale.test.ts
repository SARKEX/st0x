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
vi.mock('@rainlanguage/raindex', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	class StubRaindexOrders {
		push() {}
	}
	return { ...actual, RaindexOrders: StubRaindexOrders };
});

import { executeMarketOrder } from '$lib/services/marketOrderExecution';

describe('replay: aggregated-quote-stale', () => {
	beforeEach(() => {
		mockGetSignerAddress.mockReturnValue('0xb000000000000000000000000000000000000000');
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
		mockClient.getOrderQuotesBatch.mockReset();
	});
	afterEach(() => { vi.clearAllMocks(); });

	it('classifies stale aggregated quote as preflight_order_vanished', async () => {
		const transcript = loadTranscript('aggregated-quote-stale');
		// Sanity: fixture loaded shape consistent with TakeOrderTranscript
		expect(transcript.side).toBe('ask');
		expect(transcript.takerAction).toBe('Buy');

		// Stale subgraph quote → on-chain pre-flight reports the order vanished.
		mockClient.getOrderQuotesBatch.mockResolvedValueOnce({
			error: undefined,
			value: [
				[{ success: false, data: { formattedMaxOutput: '0', formattedRatio: '1.0' } }],
				[{ success: false, data: { formattedMaxOutput: '0', formattedRatio: '1.0' } }]
			]
		});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000n,
			inputMode: 'spend',
			slippageBps: transcript.slippageBps,
			...STD_TOKENS,
			network: STD_NETWORK as unknown as Parameters<typeof executeMarketOrder>[0]['network'],
			quotes: [buildHydratedQuote('0xstale1'), buildHydratedQuote('0xstale2')]
		});

		expect(result.success).toBe(false);
		const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
		expect(reasons).toContain('preflight_order_vanished');
	});
});
