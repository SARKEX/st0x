import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startAnvilFork, stopAnvilFork } from '../../helpers/anvil';

/**
 * FORK_BLOCK pinned per plan must-haves (RESEARCH Open Question Q4) at a
 * Base mainnet block ~3 months old at 2026-05-01 — old enough that
 * Pitfall 2 (provider history pruning) is resolved by archive-capable
 * BASE_RPC_URL, recent enough that mainnet liquidity at this block matches
 * current orderbook contract addresses. Refresh policy lives in
 * 04-RUNBOOK.md (Plan 04-10).
 */
const FORK_BLOCK = 33_400_000;

// Skip the whole suite when BASE_RPC_URL is absent (local dev without the
// secret) — the helper would throw immediately and the suite would fail.
// CI provisions BASE_RPC_URL via the test-integration job (Plan 04-07).
const hasRpc = Boolean(process.env.BASE_RPC_URL);
const describeAnvil = hasRpc ? describe : describe.skip;

describeAnvil('marketOrderExecution against forked Base mainnet', () => {
	let publicClient: Awaited<ReturnType<typeof startAnvilFork>>;

	beforeAll(async () => {
		publicClient = await startAnvilFork(FORK_BLOCK);
	}, 60_000);

	afterAll(async () => {
		await stopAnvilFork();
	});

	it('reads orderbook state at the forked block (smoke)', async () => {
		// Smoke test — confirm anvil is alive and serving forked state at
		// or beyond FORK_BLOCK.
		const blockNumber = await publicClient.getBlockNumber();
		expect(blockNumber).toBeGreaterThanOrEqual(BigInt(FORK_BLOCK));
	});

	// The three deeper assertions below are documented inline as TODO and
	// gated by `it.skip` until an operator picks a known-liquid asset/payment
	// pair at FORK_BLOCK and wires the executeMarketOrder call. Plan 04-08
	// acceptance criteria explicitly permit "deeper tests may be flagged as
	// TODO if FORK_BLOCK selection is non-trivial". The smoke test above
	// satisfies the "at least 1 it block that passes" floor.

	it.skip('executes aggregated path against on-chain orderbook (TODO)', async () => {
		// Drive marketOrderExecution against the fork. Requires:
		//   - importing executeMarketOrder from $lib/services/marketOrderExecution
		//   - configuring it to use the publicClient pointed at 127.0.0.1:8545
		//   - choosing a known-good asset/payment pair that had orders at FORK_BLOCK
		//   - asserting the result matches a known on-chain ratio
		// See §"TRADE-03 pre-flight multicall" pattern in 02-06-PLAN.md.
		expect(true).toBe(true);
	});

	it.skip('falls back to per-order path when aggregated returns no liquidity (TODO)', async () => {
		// Use an asset/payment pair OR an amount that exceeds aggregated capacity.
		// Assert result.path === 'per-order'.
		expect(true).toBe(true);
	});

	it.skip('detects partial fill against actual on-chain vault state (TODO)', async () => {
		// Drive against an order whose vault balance is known to be
		// partially-drained at FORK_BLOCK. Assert result.partialFill === true
		// OR result.transcript.failure_mode classifies correctly.
		expect(true).toBe(true);
	});
});
