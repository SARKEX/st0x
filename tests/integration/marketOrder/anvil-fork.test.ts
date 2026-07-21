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

describeAnvil('Base mainnet fork infrastructure', () => {
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
});
