/**
 * TEST-04 edge-case tests for src/lib/server/snapshots/scraper.ts.
 *
 * Phase 1 D-01 retained the snapshot pipeline (DEPR-02 outcome), so TEST-04
 * is in scope per the conditional REQ-ID gating. Three categories under test
 * (per RESEARCH §"TEST-04 Resolution" enumeration):
 *
 *  1. Pagination boundary (scraper.ts:240-241) — `transfersHasMore` /
 *     `wrappedHasMore` toggle off when batch length < BATCH_SIZE; exact-multiple
 *     boundary (BATCH_SIZE then 0) terminates correctly without an extra fetch.
 *  2. Legacy `wrappedTokenTransfers` fallback (scraper.ts:189-205) — GraphQL
 *     "Cannot query field \"wrappedTokenTransfers\"" error from a legacy
 *     subgraph triggers `wrappedHasMore = false`, sharesTransfers loop continues,
 *     no throw escapes.
 *  3. Transient subgraph failure (scraper.ts:269-281) — one subgraph fails (503
 *     or network reject); outer per-subgraph catch logs `console.warn`, returns
 *     [] for that subgraph, other subgraphs still merge into the result.
 *
 * MEMORY.md invariant honored: tests do NOT mock or assert
 * depositWithReceipts/withdrawWithReceipts — those are NOT fetched (would
 * cause double-counting of mints/burns).
 *
 * Mocks: global.fetch per test; networks + tokens via vi.mock so the module-load
 * `networks[0].subgraph_url` reads resolve to deterministic test URLs.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Provide a 2-subgraph network config (primary + 1 legacy) so the transient-failure
// test can assert that a partial subgraph failure does not poison merged results.
vi.mock('$lib/config/networks', () => ({
	networks: [
		{
			subgraph_url: 'https://subgraph.example/primary',
			subgraph_urls_legacy: ['https://subgraph.example/legacy-1']
		}
	]
}));

vi.mock('$lib/config/tokens', () => ({
	TOKENS: [{ address: '0xVAULT' }],
	getAllTokenAddressesFlat: () => ['0xvault']
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return { ok, status, json: async () => body } as unknown as Response;
}

/** Minimal valid sharesTransfers entry shape (matches SubgraphTransfer in types.ts). */
function makeSharesTransfer(id: string, blockNumber = 1) {
	return {
		id,
		timestamp: '1700000000',
		transaction: {
			id: `0xtx-${id}`,
			blockNumber: String(blockNumber),
			timestamp: '1700000000'
		},
		from: { address: '0xfrom' },
		to: { address: '0xto' },
		value: '1',
		valueExact: '1000000000000000000',
		offchainAssetReceiptVault: { id: '0xvault' }
	};
}

/** Minimal valid wrappedTokenTransfers entry shape (matches SubgraphWrappedTokenTransfer). */
function makeWrappedTransfer(id: string, blockNumber = 1) {
	return {
		id,
		from: '0xfrom',
		to: '0xto',
		value: '1000000000000000000',
		transaction: {
			id: `0xtx-${id}`,
			blockNumber: String(blockNumber),
			timestamp: '1700000000'
		},
		offchainAssetReceiptVault: {
			id: '0xvault',
			wrappedTokenContractAddress: '0xwrapped'
		}
	};
}

const BATCH_SIZE = 1000; // mirrors scraper.ts:8

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	global.fetch = vi.fn() as unknown as typeof global.fetch;
});

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * Helper: classify a fetch call by the GraphQL operation name in its body.
 * `getTransfers` = sharesTransfers query; `getWrappedTokenTransfers` = wrapped query.
 */
function operationName(init: RequestInit | undefined): 'shares' | 'wrapped' | 'unknown' {
	const body = init?.body;
	if (typeof body !== 'string') return 'unknown';
	if (body.includes('sharesTransfers')) return 'shares';
	if (body.includes('wrappedTokenTransfers')) return 'wrapped';
	return 'unknown';
}

describe('scraper pagination boundary', () => {
	it('terminates the sharesTransfers loop when batch shorter than BATCH_SIZE', async () => {
		// Drive only the PRIMARY subgraph's pagination — the legacy subgraph's shares
		// loop terminates immediately with an empty list, isolating the assertion to
		// the boundary behavior on the primary.
		const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
			makeSharesTransfer(String(i))
		);
		const shortBatch = [makeSharesTransfer('short-1')]; // length 1 < BATCH_SIZE → terminates

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const op = operationName(init);
			const isLegacy = url.includes('legacy');
			if (isLegacy) {
				// Legacy subgraph: invoked with fetchWrapped=false; only shares fetches happen.
				return jsonResponse({ data: { sharesTransfers: [] } });
			}
			// Primary subgraph
			if (op === 'shares') {
				const primarySharesIdx = fetchMock.mock.calls.filter(
					(c: unknown[]) =>
						typeof c[0] === 'string' &&
						!(c[0] as string).includes('legacy') &&
						operationName(c[1] as RequestInit) === 'shares'
				).length;
				return jsonResponse({
					data: { sharesTransfers: primarySharesIdx === 1 ? firstBatch : shortBatch }
				});
			}
			// wrapped: short batch terminates immediately
			return jsonResponse({
				data: { wrappedTokenTransfers: [makeWrappedTransfer('w-short')] }
			});
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		// Primary subgraph: 2 shares fetches (full + short); 1 wrapped fetch (short terminates).
		const primarySharesCalls = fetchMock.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				!(c[0] as string).includes('legacy') &&
				operationName(c[1] as RequestInit) === 'shares'
		);
		const primaryWrappedCalls = fetchMock.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				!(c[0] as string).includes('legacy') &&
				operationName(c[1] as RequestInit) === 'wrapped'
		);
		expect(primarySharesCalls.length).toBe(2);
		expect(primaryWrappedCalls.length).toBe(1);
		// Result: BATCH_SIZE + 1 shares + 1 wrapped from primary; legacy contributes 0.
		expect(result.length).toBe(BATCH_SIZE + 2);
	});

	it('terminates on the exact-multiple-of-BATCH_SIZE boundary (BATCH_SIZE then 0)', async () => {
		// Critical regression guard: scraper.ts:240 uses `=== BATCH_SIZE`. If a future
		// refactor changed it to `>= BATCH_SIZE`, the empty second fetch would still
		// loop. Asserting exactly 2 PRIMARY shares fetches pins the boundary. The legacy
		// subgraph's loop terminates immediately on its empty first batch.
		const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
			makeSharesTransfer(String(i))
		);

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const op = operationName(init);
			const isLegacy = url.includes('legacy');
			if (isLegacy) {
				return jsonResponse({ data: { sharesTransfers: [] } });
			}
			if (op === 'shares') {
				const primarySharesIdx = fetchMock.mock.calls.filter(
					(c: unknown[]) =>
						typeof c[0] === 'string' &&
						!(c[0] as string).includes('legacy') &&
						operationName(c[1] as RequestInit) === 'shares'
				).length;
				return jsonResponse({
					data: { sharesTransfers: primarySharesIdx === 1 ? firstBatch : [] }
				});
			}
			return jsonResponse({ data: { wrappedTokenTransfers: [] } });
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		const primarySharesCalls = fetchMock.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				!(c[0] as string).includes('legacy') &&
				operationName(c[1] as RequestInit) === 'shares'
		);
		expect(primarySharesCalls.length).toBe(2); // first full batch + confirming-empty fetch
		expect(result.length).toBe(BATCH_SIZE);
	});

	it('terminates wrappedTokenTransfers pagination on the exact-multiple boundary', async () => {
		// Mirror of the above for the wrappedHasMore loop (scraper.ts:241). Wrapped
		// fetches only happen on the primary (legacy invoked with fetchWrapped=false).
		const firstWrapped = Array.from({ length: BATCH_SIZE }, (_, i) =>
			makeWrappedTransfer(String(i))
		);

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const op = operationName(init);
			const isLegacy = url.includes('legacy');
			if (isLegacy) {
				return jsonResponse({ data: { sharesTransfers: [] } });
			}
			if (op === 'wrapped') {
				const callIdx = fetchMock.mock.calls.filter(
					(c: unknown[]) =>
						typeof c[0] === 'string' &&
						!(c[0] as string).includes('legacy') &&
						operationName(c[1] as RequestInit) === 'wrapped'
				).length;
				return jsonResponse({
					data: { wrappedTokenTransfers: callIdx === 1 ? firstWrapped : [] }
				});
			}
			return jsonResponse({ data: { sharesTransfers: [] } });
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		const wrappedCalls = fetchMock.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				!(c[0] as string).includes('legacy') &&
				operationName(c[1] as RequestInit) === 'wrapped'
		);
		expect(wrappedCalls.length).toBe(2); // first full batch + confirming-empty fetch
		expect(result.length).toBe(BATCH_SIZE);
	});
});

describe('scraper legacy wrappedTokenTransfers fallback', () => {
	it('terminates wrappedHasMore + continues sharesTransfers when subgraph reports unknown field', async () => {
		// The catch block at scraper.ts:189-205 only fires for the legacy subgraph
		// (the primary is invoked with fetchWrapped=true; legacy with fetchWrapped=false
		// at scraper.ts:271). HOWEVER the per-subgraph fetchFromSubgraph still issues
		// wrapped fetches when fetchWrapped=true — and the catch handles the GraphQL
		// "Cannot query field" error gracefully. To exercise the catch, we drive the
		// PRIMARY subgraph (fetchWrapped=true) to return that GraphQL error on its
		// wrapped query, simulating a subgraph that has not yet been migrated.
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const op = operationName(init);
			if (url.includes('legacy')) {
				// legacy is invoked with fetchWrapped=false — only shares calls happen
				return jsonResponse({ data: { sharesTransfers: [] } });
			}
			if (op === 'wrapped') {
				return jsonResponse({
					errors: [{ message: 'Cannot query field "wrappedTokenTransfers" on type "Subscription"' }]
				});
			}
			// shares: return one entry then terminate
			const callIdx = fetchMock.mock.calls.filter(
				(c: unknown[]) =>
					typeof c[0] === 'string' &&
					!(c[0] as string).includes('legacy') &&
					operationName(c[1] as RequestInit) === 'shares'
			).length;
			return jsonResponse({
				data: { sharesTransfers: callIdx === 1 ? [makeSharesTransfer('s1')] : [] }
			});
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		// No throw escaped. sharesTransfers data is preserved.
		expect(result.length).toBe(1);
		// Console.warn fired with the legacy-fallback message.
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('wrappedTokenTransfers not available')
		);
		// Wrapped was attempted exactly once on the primary (then wrappedHasMore=false).
		const primaryWrappedCalls = fetchMock.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				!(c[0] as string).includes('legacy') &&
				operationName(c[1] as RequestInit) === 'wrapped'
		);
		expect(primaryWrappedCalls.length).toBe(1);

		warnSpy.mockRestore();
	});
});

describe('scraper transient subgraph failure', () => {
	it('logs warn + returns [] for the failing subgraph + merges results from working subgraphs', async () => {
		// Primary subgraph fails entirely (HTTP 503 on the first shares fetch);
		// legacy subgraph succeeds. fetchAllTransfers must merge legacy data into
		// the result and surface a console.warn for the failure.
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.includes('legacy')) {
				const op = operationName(init);
				// Legacy subgraph is invoked with fetchWrapped=false, so only `shares` ops.
				if (op === 'shares') {
					const legacySharesIdx = fetchMock.mock.calls.filter(
						(c: unknown[]) =>
							typeof c[0] === 'string' &&
							(c[0] as string).includes('legacy') &&
							operationName(c[1] as RequestInit) === 'shares'
					).length;
					return jsonResponse({
						data: { sharesTransfers: legacySharesIdx === 1 ? [makeSharesTransfer('legacy-1')] : [] }
					});
				}
			}
			// Primary subgraph: 503 on every call
			return jsonResponse({ error: 'service unavailable' }, false, 503);
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		// Only the legacy subgraph's transfer survives.
		expect(result.length).toBe(1);
		expect(result[0].from).toBe('0xfrom');
		// Outer per-subgraph catch fired (scraper.ts:277-279).
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('failed'),
			expect.anything()
		);

		warnSpy.mockRestore();
	});

	it('survives fetch network rejection (e.g., DNS failure) on one subgraph', async () => {
		// fetch rejects with TypeError (simulates DNS / network failure, not an HTTP
		// status error). This exercises a different rejection path than the !response.ok
		// throw in fetchTransfers, but the same outer per-subgraph catch should swallow it.
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const fetchMock = global.fetch as Mock;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.includes('legacy')) {
				const op = operationName(init);
				if (op === 'shares') {
					const legacySharesIdx = fetchMock.mock.calls.filter(
						(c: unknown[]) =>
							typeof c[0] === 'string' &&
							(c[0] as string).includes('legacy') &&
							operationName(c[1] as RequestInit) === 'shares'
					).length;
					return jsonResponse({
						data: { sharesTransfers: legacySharesIdx === 1 ? [makeSharesTransfer('legacy-1')] : [] }
					});
				}
			}
			throw new TypeError('Failed to fetch');
		});

		const { fetchAllTransfers } = await import('./scraper');
		const result = await fetchAllTransfers(99_999_999);

		expect(result.length).toBe(1);
		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
	});
});
