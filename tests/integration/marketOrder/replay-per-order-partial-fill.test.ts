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

// Aggregated dispatch returns FALSE → fallback path is exercised. handleOracleOrders
// no-ops. The post-dispatch transaction-store reads ERROR (simulated stuck/partial-fill).
vi.mock('$lib/stores/marketTakeStore', () => ({
	preloadAggregatedTakeOrdersCalldata: vi.fn(),
	handleAggregatedTakeOrdersCalldata: vi.fn(async () => false),
	handleOracleOrders: vi.fn(async () => undefined)
}));
const { mockCaptureTakeOrderFailure } = vi.hoisted(() => ({
	mockCaptureTakeOrderFailure: vi.fn()
}));
vi.mock('$lib/services/observability/captureTakeOrderFailure', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return { ...actual, captureTakeOrderFailure: mockCaptureTakeOrderFailure };
});
// Transaction store reports ERROR — simulates partial fill / dispatch failure
// from the per-order fallback path.
vi.mock('$lib/stores/transactionShared', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	const { writable } = await import('svelte/store');
	return {
		...actual,
		transactionStoreInternal: writable({
			status: 'error',
			error: 'Order partially filled; remainder not executable'
		})
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

describe('replay: per-order-partial-fill', () => {
	beforeEach(() => {
		mockGetSignerAddress.mockReturnValue('0xb000000000000000000000000000000000000000');
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
		mockClient.getOrderQuotesBatch.mockReset();
	});
	afterEach(() => { vi.clearAllMocks(); });

	it('classifies aggregated-failed-then-fallback as aggregated_failed', async () => {
		const transcript = loadTranscript('per-order-partial-fill');
		expect(transcript.side).toBe('ask');

		// Pre-flight passes (so we reach dispatch).
		mockClient.getOrderQuotesBatch.mockResolvedValueOnce({
			error: undefined,
			value: [
				[{ success: true, data: { formattedMaxOutput: '10', formattedRatio: '1.0' } }]
			]
		});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000n,
			inputMode: 'spend',
			slippageBps: transcript.slippageBps,
			...STD_TOKENS,
			network: STD_NETWORK as unknown as Parameters<typeof executeMarketOrder>[0]['network'],
			quotes: [buildHydratedQuote('0xpartial1')]
		});

		expect(result.success).toBe(false);
		const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
		expect(reasons).toContain('aggregated_failed');
	});
});
