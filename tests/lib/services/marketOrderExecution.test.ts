import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Float } from '@rainlanguage/float';
import type { ProcessedQuote } from '$lib/utils/orderbook';

// === Hoisted mocks for $lib/services/walletService and $lib/clients/raindex ===
// These mocks are shared across all tests in this file. Per-test overrides set
// the SDK return shape.
const { mockGetSignerAddress, mockGetLoadBalancedClient, mockClient } = vi.hoisted(() => {
	return {
		mockGetSignerAddress: vi.fn(() => '0xb000000000000000000000000000000000000000'),
		mockGetLoadBalancedClient: vi.fn(),
		mockClient: {
			getOrders: vi.fn(),
			getOrderQuotesBatch: vi.fn()
		}
	};
});

vi.mock('$lib/services/walletService', () => ({
	getSignerAddress: mockGetSignerAddress
}));

vi.mock('$lib/clients/raindex', () => ({
	getLoadBalancedClient: mockGetLoadBalancedClient
}));

// Mock the marketTakeStore handlers — the pre-flight tests don't exercise
// dispatch, but we need the `executeMarketOrder` import chain to resolve.
vi.mock('$lib/stores/marketTakeStore', () => ({
	preloadAggregatedTakeOrdersCalldata: vi.fn(),
	handleAggregatedTakeOrdersCalldata: vi.fn(async () => true),
	handleOracleOrders: vi.fn(async () => undefined)
}));

// Spy on captureTakeOrderFailure so tests can assert which failure reason fired.
const { mockCaptureTakeOrderFailure } = vi.hoisted(() => ({
	mockCaptureTakeOrderFailure: vi.fn()
}));
vi.mock('$lib/services/observability/captureTakeOrderFailure', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		captureTakeOrderFailure: mockCaptureTakeOrderFailure
	};
});

// Mock transactionStoreInternal — the SUCCESS branch of executeMarketOrder reads
// status from this store post-dispatch. Default to SUCCESS so the silent-retry
// test reaches { success: true }.
vi.mock('$lib/stores/transactionShared', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	const { writable } = await import('svelte/store');
	const stubStore = writable({ status: 'Success! Transaction confirmed', error: '' });
	return {
		...actual,
		transactionStoreInternal: stubStore
	};
});

// Stub `RaindexOrders` from the WASM SDK — the real class needs the Wasm bindings
// initialized which is heavy in tests. We only need `push()` to be callable.
vi.mock('@rainlanguage/orderbook', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	class StubRaindexOrders {
		push() {}
	}
	return {
		...actual,
		RaindexOrders: StubRaindexOrders
	};
});

import { executeMarketOrder, excludeTakerOwnedQuotes } from '$lib/services/marketOrderExecution';

const ASSET_ADDR = '0x2222222222222222222222222222222222222222';
const PAYMENT_ADDR = '0x1111111111111111111111111111111111111111';

const mockNetwork = {
	id: 8453,
	name: 'base',
	rpcUrls: { default: { http: ['https://example.com'] } }
} as unknown as Parameters<typeof executeMarketOrder>[0]['network'];

/**
 * Build a fully-hydrated ProcessedQuote that walkOrderbook + the pre-flight code
 * accept without a hydration round-trip. Ratio set to ~1.0 so price math succeeds.
 *
 * Float hex layout: 64 hex chars (32 bytes) representing a packed Float; the
 * exact value doesn't matter for the pre-flight code path because we mock the
 * SDK's return — but `Float.fromHex` must not throw on it. Use the canonical
 * "1.0" representation that survives round-trip in the codebase.
 */
// Canonical Float hex for various values — produced by the SDK so parseFloatHex
// round-trips to a non-zero bigint (walkOrderbook depends on this).
const ONE_FLOAT_HEX = Float.parse('1').value!.asHex();
// 0.4 asset units per quote: at price 1 USDC/asset, each quote can absorb ~0.4 USDC.
// With 1 USDC spend across 2 quotes, walkOrderbook produces 2 fills (not 1).
const POINT_FOUR_FLOAT_HEX = Float.parse('0.4').value!.asHex();

function buildHydratedQuote(orderHash: string, side: 'ask' | 'bid' = 'ask'): ProcessedQuote {
	return {
		orderHash,
		// maxOutput=0.4 (asset units): forces multi-fill walks for 1-USDC orders.
		// ratio=1: walkOrderbook reads quotePerAsset for price.
		maxOutput: POINT_FOUR_FLOAT_HEX,
		ratio: ONE_FLOAT_HEX,
		inputTokenSymbol: side === 'ask' ? 'USDC' : 'tNVDA',
		outputTokenSymbol: side === 'ask' ? 'tNVDA' : 'USDC',
		inputTokenAddress: side === 'ask' ? PAYMENT_ADDR : ASSET_ADDR,
		outputTokenAddress: side === 'ask' ? ASSET_ADDR : PAYMENT_ADDR,
		inputIOIndex: 0,
		outputIOIndex: 0,
		inputTokenDecimals: side === 'ask' ? 6 : 18,
		outputTokenDecimals: side === 'ask' ? 18 : 6,
		side,
		quotePerAsset: 1,
		orderData: {
			owner: '0xc000000000000000000000000000000000000000',
			evaluable: {
				interpreter: '0xd000000000000000000000000000000000000000',
				store: '0xe000000000000000000000000000000000000000',
				bytecode: '0x'
			},
			validInputs: [{ token: PAYMENT_ADDR, vaultId: '0x0' }],
			validOutputs: [{ token: ASSET_ADDR, vaultId: '0x0' }],
			nonce: '0x0'
		} as unknown as ProcessedQuote['orderData'],
		sgOrder: {
			orderHash,
			orderBytes: '0xdeadbeef',
			owner: '0xc000000000000000000000000000000000000000'
		} as unknown as ProcessedQuote['sgOrder'],
		raindexOrder: { mockOrderHash: orderHash } as unknown as ProcessedQuote['raindexOrder']
	};
}

const STD_INPUT = {
	orderSide: 'Buy' as const,
	amount: 1_000_000n, // 1 USDC (6-decimal payment)
	inputMode: 'spend' as const,
	slippageBps: 100,
	assetToken: { address: ASSET_ADDR, decimals: 18, symbol: 'tNVDA' },
	paymentToken: { address: PAYMENT_ADDR, decimals: 6, symbol: 'USDC' },
	network: mockNetwork
};

function quoteWithOwner(orderHash: string, owner?: string): ProcessedQuote {
	return {
		orderHash,
		maxOutput: '0x0',
		ratio: '0x0',
		inputTokenSymbol: 'USDC',
		outputTokenSymbol: 'wtSTOX',
		inputTokenAddress: '0x1111111111111111111111111111111111111111',
		outputTokenAddress: '0x2222222222222222222222222222222222222222',
		inputIOIndex: 0,
		outputIOIndex: 0,
		orderData: owner
			? ({
					owner,
					evaluable: {
						interpreter: '0x3333333333333333333333333333333333333333',
						store: '0x4444444444444444444444444444444444444444',
						bytecode: '0x'
					},
					validInputs: [],
					validOutputs: [],
					nonce: '0x0'
				} as unknown as ProcessedQuote['orderData'])
			: undefined
	};
}

describe('excludeTakerOwnedQuotes', () => {
	it('removes quotes owned by the taker address', () => {
		const taker = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
		const quotes: ProcessedQuote[] = [
			quoteWithOwner('0x-self', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
			quoteWithOwner('0x-external', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
		];

		const filtered = excludeTakerOwnedQuotes(quotes, taker);

		expect(filtered.map((q) => q.orderHash)).toEqual(['0x-external']);
	});
});

describe('TRADE-03 pre-flight (Plan 02-06)', () => {
	beforeEach(() => {
		mockGetSignerAddress.mockReturnValue('0xb000000000000000000000000000000000000000');
		mockGetLoadBalancedClient.mockResolvedValue(mockClient);
		mockCaptureTakeOrderFailure.mockClear();
		mockClient.getOrderQuotesBatch.mockReset();
		mockClient.getOrders.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('preflight RPC failure → failWith(preflight_chain_unreachable)', async () => {
		// Arrange: SDK returns a WasmEncodedResult-shaped error.
		mockClient.getOrderQuotesBatch.mockResolvedValue({
			error: { readableMsg: 'RPC connection refused' },
			value: undefined
		});

		const result = await executeMarketOrder({
			...STD_INPUT,
			quotes: [buildHydratedQuote('0xorder1')]
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('Unable to verify orderbook state');

		// Assert captureTakeOrderFailure was invoked with reason preflight_chain_unreachable.
		expect(mockCaptureTakeOrderFailure).toHaveBeenCalled();
		const calls = mockCaptureTakeOrderFailure.mock.calls;
		const reasons = calls.map((c) => c[2]);
		expect(reasons).toContain('preflight_chain_unreachable');
	});

	it('all candidates fail pre-flight at both walks → failWith(auto_retry_exhausted)', async () => {
		// Arrange: SDK returns success=false for every order on every call. With a
		// single candidate, the cascade hits "all dropped at level 0" → because
		// preflightWalkCount(0) + 1 < PREFLIGHT_MAX_WALKS(2) is true, fires
		// preflight_order_vanished (NOT auto_retry_exhausted). To force the
		// auto_retry_exhausted path with a single candidate we need partial-survivor
		// behavior on level 0 then total-drop on level 1.
		// Simpler: 2 candidates that both fail at level 0 → triggers preflight_order_vanished.
		// True auto_retry_exhausted requires the survivor loop to exit naturally without
		// preflightCompleted. Use 2 candidates where level-0 drops one, level-1 drops the other.
		mockClient.getOrderQuotesBatch
			.mockResolvedValueOnce({
				error: undefined,
				value: [
					[{ success: true, data: { formattedMaxOutput: '10', formattedRatio: '1.0' } }],
					[{ success: false, data: undefined, error: 'order vanished' }]
				]
			})
			.mockResolvedValueOnce({
				error: undefined,
				value: [[{ success: false, data: undefined, error: 'now this one is gone too' }]]
			});

		const result = await executeMarketOrder({
			...STD_INPUT,
			quotes: [buildHydratedQuote('0xorder1'), buildHydratedQuote('0xorder2')]
		});

		expect(result.success).toBe(false);
		// Level-1 total drop with preflightWalkCount=1: condition (1 + 1 < 2) is false,
		// so the auto_retry_exhausted branch fires.
		expect(result.error).toBe(
			'No liquidity available right now for this size. Try a smaller amount or check back in a minute.'
		);

		const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
		expect(reasons).toContain('auto_retry_exhausted');
	});

	it('one candidate drains; survivors pass pre-flight → silent retry succeeds', async () => {
		// Arrange: level 0 drops one candidate, level 1 has all survivors passing.
		mockClient.getOrderQuotesBatch
			.mockResolvedValueOnce({
				error: undefined,
				value: [
					[{ success: false, data: undefined }],
					[{ success: true, data: { formattedMaxOutput: '10', formattedRatio: '1.0' } }]
				]
			})
			.mockResolvedValueOnce({
				error: undefined,
				value: [[{ success: true, data: { formattedMaxOutput: '10', formattedRatio: '1.0' } }]]
			});

		const result = await executeMarketOrder({
			...STD_INPUT,
			quotes: [buildHydratedQuote('0xorder1'), buildHydratedQuote('0xorder2')]
		});

		// Expect success: the silent retry transparently advances to the surviving
		// candidate. captureTakeOrderFailure was NOT called for any pre-flight reason.
		expect(result.success).toBe(true);

		const preflightFailures = mockCaptureTakeOrderFailure.mock.calls.filter((c) =>
			String(c[2]).startsWith('preflight_') || c[2] === 'auto_retry_exhausted'
		);
		expect(preflightFailures).toHaveLength(0);
	});

	it('transcript.vaultBalance populated from pre-flight result on failure path', async () => {
		// Arrange: level 0 drops all candidates with formattedMaxOutput='0' on first
		// element so the populate-then-filter ordering writes vaultBalance='0' before
		// the failure-return fires.
		mockClient.getOrderQuotesBatch.mockResolvedValueOnce({
			error: undefined,
			value: [
				[{ success: false, data: { formattedMaxOutput: '0', formattedRatio: '1.0' } }],
				[{ success: false, data: { formattedMaxOutput: '0', formattedRatio: '1.0' } }]
			]
		});

		const result = await executeMarketOrder({
			...STD_INPUT,
			quotes: [buildHydratedQuote('0xorder1'), buildHydratedQuote('0xorder2')]
		});

		// Expect terminal failure (preflight_order_vanished — level 0 with all dropped,
		// level 1 still allowed by the bounds, fires the order_vanished branch).
		expect(result.success).toBe(false);

		// The captured transcript MUST have vaultBalance populated from the SDK.
		expect(mockCaptureTakeOrderFailure).toHaveBeenCalled();
		const lastCall = mockCaptureTakeOrderFailure.mock.calls.at(-1);
		expect(lastCall).toBeDefined();
		const capturedTranscript = lastCall![1] as { onChainStateRead: { vaultBalance: string | null } };
		// vaultBalance should match the SDK return (formattedMaxOutput from index [0][0]).
		expect(capturedTranscript.onChainStateRead.vaultBalance).toBe('0');
	});
});
