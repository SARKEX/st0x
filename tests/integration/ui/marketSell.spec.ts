// TEST-07 — Sell market order via UI. Asset-anchored path only.
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Sell taker pays wtCOIN, wants USDC, hits bid-side counterparty orders.
//
// SCOPE: spend-anchored Sell is intentionally NOT covered. MarketOrder.svelte
// renders `input-mode-toggle` ONLY for the Buy side; Sell shows a static
// "Sell" label and the input is always asset-anchored.
//
// Test compromises mirror marketBuy.spec.ts:
//   1. `force: true` on mode-tab (sr-only test hook occluded by visible label).
//   2. Slippage bumped to 5% for residual live/fork drift.
//   3. On-chain balance assertion instead of success-toast (subgraph polling
//      can't see anvil's tx).
//   4. wtCOIN funded via impersonate-and-transfer from the Rain Orderbook
//      (setStorageAt unreliable for ST0x wrapper proxies — see fixtures.ts).
import { test, expect, fundToken } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via UI', () => {
	test('asset-anchored: sell 0.02 wtCOIN → wtCOIN debited + USDC credited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		const initialAsset = parseUnits('1', tokens.wtCOIN.decimals);
		await fundToken({
			client: testClient,
			token: tokens.wtCOIN,
			holder: fundedAccount.address,
			amount: initialAsset
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: default inputMode is 'amount', no toggle needed.
		await page.locator('[data-testid="asset-input"] input').first().fill('0.02');

		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="sell"]');
		// Cache build can take 30-60s on first /orders/token/* — see marketBuy.
		await expect(submit).toBeEnabled({ timeout: 90_000 });
		await submit.click();

		// On-chain: wtCOIN debited AND USDC credited.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.wtCOIN.address,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [fundedAccount.address]
					}),
				{ timeout: 60_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeLessThan(initialAsset);

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(usdcBalance).toBeGreaterThan(0n); // USDC was received

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});
});
