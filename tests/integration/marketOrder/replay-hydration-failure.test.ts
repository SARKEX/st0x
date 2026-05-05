import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTranscript } from '../../helpers/loadTranscript';
import { buildUnhydratedQuote, STD_NETWORK, STD_TOKENS } from './_replay-helpers';

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

describe('replay: hydration-failure', () => {
	beforeEach(() => {
		mockGetSignerAddress.mockReturnValue('0xb000000000000000000000000000000000000000');
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
		mockClient.getOrderQuotesBatch.mockReset();
		mockClient.getOrders.mockReset();
	});
	afterEach(() => { vi.clearAllMocks(); });

	it('classifies post-hydration missing orderData as unhydrated_fills', async () => {
		const transcript = loadTranscript('hydration-failure');
		// Fixture's onChainStateRead is null — the local quote was never hydrated against the
		// authoritative on-chain state. TanStack Query hydration mismatch on stale-session reload.
		expect(transcript.onChainStateRead.orderHash).toBeNull();

		// getOrders returns no rows → orderData stays null even after hydration attempt.
		mockClient.getOrders.mockResolvedValue({
			error: undefined,
			value: { orders: [] }
		});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000n,
			inputMode: 'spend',
			slippageBps: transcript.slippageBps,
			...STD_TOKENS,
			network: STD_NETWORK as unknown as Parameters<typeof executeMarketOrder>[0]['network'],
			quotes: [buildUnhydratedQuote('0xhydrate1')]
		});

		expect(result.success).toBe(false);
		const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
		expect(reasons).toContain('unhydrated_fills');
	});
});
