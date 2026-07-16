import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTranscript } from '../../helpers/loadTranscript';
import { buildHydratedQuote, STD_NETWORK, STD_TOKENS } from './_replay-helpers';

const { mockGetSignerAddress, mockGetLoadBalancedClient, mockClient } = vi.hoisted(() => ({
	// Default: NO signer — simulates session-id KV record absent / re-auth required
	mockGetSignerAddress: vi.fn(() => null),
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

describe('replay: stale-session-recovery', () => {
	beforeEach(() => {
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
	});
	afterEach(() => { vi.clearAllMocks(); });

	it('surfaces wallet-not-connected error when session-id KV record is absent', async () => {
		const transcript = loadTranscript('stale-session-recovery');
		// Fixture fingerprint: walletAddress is null because the session re-auth check
		// failed before the trade UI could populate it.
		expect(transcript.walletAddress).toBeNull();

		// getSignerAddress returns null (default mock above) — simulates the KV-miss
		// branch in walletService.ts.
		mockGetSignerAddress.mockReturnValue(null);

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000n,
			inputMode: 'spend',
			slippageBps: transcript.slippageBps,
			...STD_TOKENS,
			network: STD_NETWORK as unknown as Parameters<typeof executeMarketOrder>[0]['network'],
			quotes: [buildHydratedQuote('0xsession1')]
		});

		// Per marketOrderExecution.ts:208 — this path returns success:false with the
		// wallet-not-connected message and intentionally does NOT call captureTakeOrderFailure
		// (it's a re-auth UX gate, not a take-order failure). RESEARCH explicitly notes this
		// as a SKIP — see comment "not a no-liquidity scenario".
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Wallet not connected|reconnect/i);
		// Confirm we did NOT misclassify this as a take-order failure.
		expect(mockCaptureTakeOrderFailure).not.toHaveBeenCalled();
	});
});
