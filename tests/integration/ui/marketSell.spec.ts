// TEST-07 — Sell market order via UI. Covers asset-anchored + spend-anchored
// paths (TRADE-04 mode×side regression matrix on the Sell side).
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Sell taker pays tNVDA, wants USDC, hits bid-side counterparty orders.
//
// Note: bid-side liquidity for tNVDA must exist at FORK_BLOCK for these tests
// to actually fill. If first CI run shows no bid liquidity, swap to a token
// with confirmed bid depth and document in 01-RUNBOOK §"No-liquidity".
//
// Test compromises mirror smoke.spec.ts / marketBuy.spec.ts:
//   1. `force: true` on mode-tab.
//   2. Spend-anchored test toggles input-mode to 'spend'.
//   3. Slippage bumped to 5% for fork/live-head price drift.
//   4. On-chain balance assertion instead of success-toast (subgraph polling
//      can't see anvil's tx).
import { test, expect, fundErc20 } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via UI', () => {
	test('asset-anchored: sell 0.1 tNVDA → tNVDA debited + USDC credited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		const initialTnvda = parseUnits('1', tokens.tNVDA.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.tNVDA.address,
			holder: fundedAccount.address,
			amount: initialTnvda,
			balanceSlot: tokens.tNVDA.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: default inputMode is 'amount', no toggle needed.
		await page.locator('[data-testid="asset-input"] input').first().fill('0.1');

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

	test('spend-anchored: target receive 10 USDC from selling tNVDA → balance ≥ 9.5 USDC (within slippage)', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		const initialTnvda = parseUnits('1', tokens.tNVDA.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.tNVDA.address,
			holder: fundedAccount.address,
			amount: initialTnvda,
			balanceSlot: tokens.tNVDA.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Spend-anchored on Sell: spend-input represents the USDC target receive.
		// Toggle to spend mode (default is 'amount').
		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}

		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="sell"]');
		await expect(submit).toBeEnabled({ timeout: 30_000 });
		await submit.click();

		// 9.5 USDC floor = 10 target × (1 - 5% slippage). Looser than the 9.9
		// floor in the original spec because we now allow 5% slippage to
		// absorb the subgraph/fork price drift.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.USDC.address,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [fundedAccount.address]
					}),
				{ timeout: 60_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeGreaterThanOrEqual(parseUnits('9.5', tokens.USDC.decimals));

		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(tnvdaBalance).toBeLessThan(initialTnvda); // some tNVDA was sold

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});
});
