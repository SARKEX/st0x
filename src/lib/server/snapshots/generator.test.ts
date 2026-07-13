/**
 * REL-01 unit tests for src/lib/server/snapshots/generator.ts.
 *
 * Pins the Phase 3 / Plan 03-06 behavior:
 *  - callRpc wraps each per-RPC fetch in withRetry(fn, 2, 200) — retries within RPC #N
 *    before falling through to RPC #N+1.
 *  - callRpc throws (does NOT return null) when every RPC × every retry fails;
 *    reportChainExhausted fires once per exhaustion (Telegram alert preserved).
 *  - Empty `result` is treated as failure inside fetchOnce so withRetry can fire.
 *  - getBlockNumberForTimestamp throws when smallestDiff stayed at Infinity instead
 *    of silently returning a latestBlock-derived block.
 *  - OBS-04 instrumentation preserved: every retry attempt records via
 *    recordRpcAttempt; chain exhaustion fires reportChainExhausted.
 *
 * Mocks: global.fetch per test; rpcMetrics + networks + tokens + kv via vi.mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRecordRpcAttempt, mockReportChainExhausted } = vi.hoisted(() => ({
	mockRecordRpcAttempt: vi.fn(),
	mockReportChainExhausted: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/rpcMetrics', () => ({
	recordRpcAttempt: mockRecordRpcAttempt,
	reportChainExhausted: mockReportChainExhausted
}));

// Stub heavy module-level deps so importing generator.ts is cheap + side-effect-free.
vi.mock('$lib/config/networks', () => ({
	networks: [
		{
			rpcUrl: 'https://rpc-primary.example/key',
			fallbackRpcUrls: ['https://rpc-fallback-1.example', 'https://rpc-fallback-2.example']
		}
	]
}));

vi.mock('$lib/config/tokens', () => ({
	TOKENS: [],
	getTokenAddressVariants: vi.fn(() => []),
	getTokenByAnyAddress: vi.fn(() => undefined)
}));

vi.mock('$lib/server/kv', () => ({
	getRewardsExcludedWalletsSet: vi.fn(async () => new Set<string>())
}));

vi.mock('$lib/server/tokenCatalog', () => ({
	ensureServerTokenCatalog: vi.fn(async () => undefined)
}));

vi.mock('./scraper', () => ({
	fetchAllTransfers: vi.fn(async () => []),
	ALL_TOKEN_ADDRESSES: []
}));

vi.mock('./processor', () => ({
	generateSnapshot: vi.fn()
}));

vi.mock('./pyth', () => ({
	fetchPythPricesAtTimestamp: vi.fn(async () => ({ prices: new Map(), priceTimestamp: 0 }))
}));

vi.mock('./vaults', () => ({
	fetchAllVaultHoldings: vi.fn(async () => new Map())
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => body
	} as unknown as Response;
}

describe('REL-01 callRpc + getBlockNumberForTimestamp', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		global.fetch = vi.fn() as unknown as typeof global.fetch;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('Test 1: returns result on first-attempt RPC success', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			jsonResponse({ result: '0xdeadbeef' })
		);
		const { callRpc } = await import('./generator');
		const result = await callRpc('eth_blockNumber', []);
		expect(result).toBe('0xdeadbeef');
		expect(mockRecordRpcAttempt).toHaveBeenCalledTimes(1);
		expect(mockRecordRpcAttempt).toHaveBeenCalledWith(
			expect.objectContaining({ ok: true, status_or_error: 'ok' })
		);
		expect(mockReportChainExhausted).not.toHaveBeenCalled();
	});

	it('Test 2: retries within RPC #1 on "header not found" then succeeds', async () => {
		const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
		fetchMock
			.mockRejectedValueOnce(new Error('header not found'))
			.mockResolvedValueOnce(jsonResponse({ result: '0xabc' }));
		const { callRpc } = await import('./generator');
		const result = await callRpc('eth_blockNumber', []);
		expect(result).toBe('0xabc');
		// fetch called twice = 1 retry inside RPC #1, no fall-through to RPC #2
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// Single recordRpcAttempt: only the outer per-RPC outcome is recorded (success).
		// withRetry's inner retries are wall-time work; the per-RPC summary line is what
		// OBS-04 dashboards key on — preserves the existing log volume.
		expect(mockRecordRpcAttempt).toHaveBeenCalledTimes(1);
		expect(mockRecordRpcAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				rpc_url: 'https://rpc-primary.example/key',
				ok: true,
				status_or_error: 'ok'
			})
		);
		expect(mockReportChainExhausted).not.toHaveBeenCalled();
	});

	it('Test 3: throws when all RPCs × all retries fail; reportChainExhausted fires once', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('header not found'));
		const { callRpc } = await import('./generator');
		await expect(callRpc('eth_blockNumber', [])).rejects.toThrow(/all .* RPCs exhausted/);
		// 3 RPCs × 1 outer record per RPC = 3 recordRpcAttempt calls (all failures)
		expect(mockRecordRpcAttempt).toHaveBeenCalledTimes(3);
		expect(
			mockRecordRpcAttempt.mock.calls.every(
				(call: unknown[]) => (call[0] as { ok: boolean }).ok === false
			)
		).toBe(true);
		// Chain exhaustion fires exactly once
		expect(mockReportChainExhausted).toHaveBeenCalledTimes(1);
		expect(mockReportChainExhausted).toHaveBeenCalledWith(
			expect.objectContaining({ fn: 'callRpc:eth_blockNumber' })
		);
	});

	it('Test 4: empty result throws inside fetchOnce → retry → fall-through → exhaustion throws', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ result: null }));
		const { callRpc } = await import('./generator');
		await expect(callRpc('eth_blockNumber', [])).rejects.toThrow(/all .* RPCs exhausted/);
		expect(mockReportChainExhausted).toHaveBeenCalledTimes(1);
		// Every per-RPC outcome was a failure
		expect(mockRecordRpcAttempt).toHaveBeenCalledTimes(3);
		expect(
			mockRecordRpcAttempt.mock.calls.every(
				(call: unknown[]) => (call[0] as { ok: boolean }).ok === false
			)
		).toBe(true);
	});

	it('Test 5: getBlockNumberForTimestamp throws when smallestDiff stays Infinity', async () => {
		// First call (getCurrentBlockNumber → eth_blockNumber) succeeds so we reach the
		// binary search; every subsequent eth_getBlockByNumber probe throws across all
		// RPCs × retries → smallestDiff stays Infinity → function-boundary throw fires.
		// Stub setTimeout so withRetry's exponential backoff doesn't bloat wall time
		// (binary search × 30 iters × 3 RPCs × 1 retry = many setTimeouts).
		vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
			cb();
			return 0;
		}) as unknown as typeof setTimeout);
		const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
		// Successful blockNumber response, then ALL block-by-number probes fail.
		fetchMock.mockImplementation(async (_url, init) => {
			const body = JSON.parse((init as { body: string }).body);
			if (body.method === 'eth_blockNumber') {
				return jsonResponse({ result: '0x1000' });
			}
			throw new Error('header not found');
		});
		const { getBlockNumberForTimestamp } = await import('./generator');
		await expect(getBlockNumberForTimestamp(1_700_000_000)).rejects.toThrow(
			/no block lookup succeeded/
		);
	});

	it('Test 6: structural — silent latestBlock fallback path is gone', async () => {
		// Code-level invariant: post-fix code MUST NOT silently return latestBlock when
		// smallestDiff is Infinity. Read the source and verify the throw exists and the
		// `return closestBlock` is gated behind a successful probe (smallestDiff !== Infinity).
		const { readFileSync } = await import('node:fs');
		const path = await import('node:path');
		// process.cwd() is the project root when vitest runs.
		const generatorPath = path.resolve(process.cwd(), 'src/lib/server/snapshots/generator.ts');
		const src = readFileSync(generatorPath, 'utf8');
		expect(src).toMatch(/no block lookup succeeded/);
		expect(src).toMatch(/smallestDiff === Infinity/);
		// Ensure withRetry import is present
		expect(src).toMatch(/from '\$lib\/utils\/retry'/);
	});

	it('Test 7: getBlockNumberForTimestamp propagates the throw end-to-end (no null swallow)', async () => {
		// End-to-end caller throw-propagation: when the binary search cannot resolve
		// any block (every callRpc throws inside the loop), the public-API
		// getBlockNumberForTimestamp must propagate the throw — NOT swallow + return
		// null/0/latestBlock. A future regression that re-introduces a null-swallow
		// fails this test.
		vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
			cb();
			return 0;
		}) as unknown as typeof setTimeout);
		const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockImplementation(async (_url, init) => {
			const body = JSON.parse((init as { body: string }).body);
			if (body.method === 'eth_blockNumber') {
				return jsonResponse({ result: '0x1000' });
			}
			// Every probe fails (across all RPCs × retries)
			throw new Error('header not found');
		});
		const { getBlockNumberForTimestamp } = await import('./generator');
		// Must reject — not resolve to a number (which would indicate a swallow regression).
		const promise = getBlockNumberForTimestamp(1_700_000_000);
		await expect(promise).rejects.toBeInstanceOf(Error);
		await expect(promise).rejects.toThrow(/no block lookup succeeded/);
	});
});
