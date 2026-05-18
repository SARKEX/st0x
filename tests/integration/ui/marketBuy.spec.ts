// TEST-06 — Buy market order via UI. Covers spend-anchored + asset-anchored
// paths.
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Buy taker pays USDC, wants wtCOIN, hits ask-side counterparty orders.
//
// Token choice — wtCOIN: Coinbase, Pyth on-chain price feed, no st0x
// off-chain oracle dependency. Reliable depth at active fork blocks.
//
// Fork-block rationale: globalSetup picks a NYSE-market-hours block within
// minutes of "now" so LIVE Hermes / ST0x REST / Goldsky subgraph are
// effectively at the same chain head the fork is at — no stubs needed to
// reconcile LIVE-vs-FORK drift.
//
// Test compromises:
//   1. `force: true` on mode-tab — the sr-only test-only button is occluded
//      by the visible "Order Type" label at the same coords.
//   2. Spend-anchored test toggles input-mode to 'spend' (default is 'amount'
//      since commit 5b3c81d).
//   3. Slippage bumped to 5% to absorb the residual subgraph/fork drift the
//      few-minute fork still has (and remains well below the production 50%
//      cap; sane regression coverage).
//   4. Assertion is on-chain balance, NOT success-toast. The toast is fired
//      by pollAndFinalizeTakeOrders after the take's trade event indexes in
//      Goldsky — anvil's tx hash never reaches Goldsky, so the toast can't
//      fire within any reasonable timeout. On-chain balance is the
//      load-bearing signal.
//
// D-11 enforcement: this file MUST NOT import from $lib/services/marketOrderExecution,
// $lib/stores/transaction, $lib/services/orderDeployment, $lib/services/walletService,
// or $lib/types/orderPerspective. ESLint no-restricted-imports rule from 01-03 enforces.
import { test, expect, fundErc20 } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-06 — Buy market order via UI', () => {
	test('spend-anchored: 10 USDC → wtCOIN fills on-chain + USDC debited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Surface browser console errors + relevant marketTake/approval logs to
		// stdout so a balance-stays-0 failure has an explanation in the log.
		page.on('console', (msg) => {
			const t = msg.type();
			const text = msg.text();
			if (
				t === 'error' ||
				text.includes('marketTake') ||
				text.includes('approval') ||
				text.includes('takeOrder') ||
				text.includes('Error')
			) {
				console.log(`[browser ${t}] ${text.slice(0, 400)}`);
			}
		});
		page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

		const initialUsdc = parseUnits('1000', tokens.USDC.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: initialUsdc,
			balanceSlot: tokens.USDC.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Toggle to spend mode (UI default is 'amount' since 5b3c81d).
		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}

		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		// 5% slippage absorbs the residual drift between live API quotes and
		// fork-block ratios (the fork is only minutes behind, but on-chain
		// ratios still tick with Pyth updates).
		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
		// Cache for the fork-orders stub builds on first /orders/token/* hit and
		// runs parallel getQuotes across the orderbook — ~30-60s on a cold cache.
		// After the first build the cache is reused for every subsequent test.
		await expect(submit).toBeEnabled({ timeout: 90_000 });
		await submit.click();

		// On-chain assertion: wtCOIN delta — polled against anvil, independent of
		// subgraph indexing.
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
			.toBeGreaterThan(0n);

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(usdcBalance).toBeLessThan(initialUsdc); // some USDC was spent

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});

	test('asset-anchored: receive 0.02 wtCOIN → balance ≥ target (within slippage)', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		const initialUsdc = parseUnits('1000', tokens.USDC.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: initialUsdc,
			balanceSlot: tokens.USDC.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: default inputMode is 'amount', no toggle needed.
		await page.locator('[data-testid="asset-input"] input').first().fill('0.02');

		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
		// Cache for the fork-orders stub builds on first /orders/token/* hit and
		// runs parallel getQuotes across the orderbook — ~30-60s on a cold cache.
		// After the first build the cache is reused for every subsequent test.
		await expect(submit).toBeEnabled({ timeout: 90_000 });
		await submit.click();

		// 0.019 wtCOIN floor = 0.02 target × (1 - 5% slippage).
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
			.toBeGreaterThanOrEqual(parseUnits('0.019', tokens.wtCOIN.decimals));

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});
});
