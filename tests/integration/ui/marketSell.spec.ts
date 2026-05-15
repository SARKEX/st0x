// TEST-07 — Sell market order via UI. Asset-anchored path only.
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Sell taker pays tNVDA, wants USDC, hits bid-side counterparty orders.
//   Bid-side liquidity for tNVDA verified at FORK_BLOCK=45_990_727 (order
//   0x0430bef... has wtNVDA input + USDC output with non-zero balance).
//
// SCOPE: spend-anchored Sell is intentionally NOT covered. MarketOrder.svelte:1031-1059
// renders `input-mode-toggle` ONLY for the Buy side; Sell shows a static "Sell"
// label and the input is always asset-anchored. The mode×side matrix loses
// (spend, sell) as a result — coverage gap tracked in HANDOVER-REMAINING-SPECS.md
// "Blocker 2".
//
// Test compromises mirror marketBuy.spec.ts:
//   1. `force: true` on mode-tab (sr-only test hook occluded by visible label).
//   2. Slippage bumped to 5% for fork/live-head price drift.
//   3. On-chain balance assertion instead of success-toast (subgraph polling
//      can't see anvil's tx).
//   4. tNVDA funded via impersonate-and-transfer from the Rain Orderbook
//      (setStorageAt unreliable for ST0x wrapper proxies — see fixtures.ts).
import { test, expect, fundToken } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via UI', () => {
	test('asset-anchored: sell 0.02 tNVDA → tNVDA debited + USDC credited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		const initialTnvda = parseUnits('1', tokens.tNVDA.decimals);
		await fundToken({
			client: testClient,
			token: tokens.tNVDA,
			holder: fundedAccount.address,
			amount: initialTnvda
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: default inputMode is 'amount', no toggle needed.
		// 0.02 tNVDA — sized to fit on-chain bid-vault depth at FORK_BLOCK (see
		// marketBuy.spec.ts for the same rationale on the buy side).
		await page.locator('[data-testid="asset-input"] input').first().fill('0.02');

		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="sell"]');
		await expect(submit).toBeEnabled({ timeout: 30_000 });
		await submit.click();

		// On-chain: tNVDA debited AND USDC credited.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.tNVDA.address,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [fundedAccount.address]
					}),
				{ timeout: 60_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeLessThan(initialTnvda);

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(usdcBalance).toBeGreaterThan(0n); // USDC was received

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});

	// NOTE: spend-anchored Sell is structurally not possible in the current UI
	// (MarketOrder.svelte renders input-mode-toggle only for Buy side). When the
	// frontend grows a Sell-side anchoring toggle, add the spend-anchored Sell
	// test here mirroring the asset-anchored layout.
});
