// TEST-06 — Buy market order via UI. Covers spend-anchored + asset-anchored
// paths (TRADE-04 mode×side regression matrix on the Buy side).
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Buy taker pays USDC, wants tNVDA, hits ask-side counterparty orders.
//   The asset-anchored test implicitly pins TRADE-01 — if Buy ever inverts and
//   hits bid-side counterparties, USDC would *increase* and tNVDA stay flat,
//   which contradicts the `tNVDA balance ≥ floor` assertion below.
//
// Skip-grammar mirrors smoke.spec.ts:18 — local dev without BASE_RPC_URL skips
// rather than fails. Plan 01-09 wires the CI archive-RPC run that exercises this.
//
// Test compromises documented in smoke.spec.ts also apply here:
//   1. `force: true` on mode-tab — the sr-only test-only button is occluded by
//      the visible "Order Type" label at the same coords.
//   2. Spend-anchored test toggles input-mode to 'spend' (default is 'amount'
//      since commit 5b3c81d).
//   3. Slippage bumped to 5% to absorb the subgraph(live-head)/anvil(fork-block)
//      Pyth-price drift on tNVDA.
//   4. Assertion is on-chain balance, NOT success-toast. The toast is fired by
//      pollAndFinalizeTakeOrders after the take's trade event indexes in
//      Goldsky — anvil's tx hash never reaches Goldsky, so the toast can't
//      fire within any reasonable timeout. On-chain balance is the
//      load-bearing signal.
//
// D-11 enforcement: this file MUST NOT import from $lib/services/marketOrderExecution,
// $lib/stores/transaction, $lib/services/orderDeployment, $lib/services/walletService,
// or $lib/types/orderPerspective. ESLint no-restricted-imports rule from 01-03 enforces.
import { test, expect, fundErc20, prefundWtNvdaAskOrders } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-06 — Buy market order via UI', () => {
	test('spend-anchored: 10 USDC → tNVDA fills on-chain + USDC debited', async ({
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
		// Pre-fund the ask-side wtNVDA orders' output vaults so the SDK preflight
		// finds real on-chain fillable depth. Subgraph reports the orders as
		// active with sentinel max-output Float values, but their on-chain vault
		// balances are 0 at FORK_BLOCK — without this, SDK returns no_liquidity.
		await prefundWtNvdaAskOrders(testClient);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Toggle to spend mode (UI default is 'amount' since 5b3c81d).
		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}

		// Spend 10 USDC, not 100 — at FORK_BLOCK 45_990_727 the orderbook's USDC
		// input vaults for the ask-side wtNVDA orders are thin (subgraph reports
		// sentinel max-output values, but actual on-chain vault USDC ≪ that). A
		// 100 USDC buy triggered SDK preflight "No liquidity available right
		// now for this size" because aggregate fillable USDC within the slippage
		// cap was <100 (verified via diagnostic dump in commit 7d99622).
		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		// 5% slippage absorbs typical 24-48h tNVDA price drift between
		// subgraph head and FORK_BLOCK; default 1% is insufficient.
		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
		// DIAGNOSTIC: poll the form state every 5s for 30s, regardless of
		// whether submit ever enables. Reveals what's gating the button.
		for (let i = 0; i < 6; i++) {
			await page.waitForTimeout(5_000);
			console.log(
				`[mb-debug] t+${(i + 1) * 5}s state:`,
				JSON.stringify(
					await page.evaluate(() => {
						const btn = document.querySelector(
							'[data-testid="trade-submit"][data-side="buy"]'
						) as HTMLButtonElement | null;
						const errorBanner = document.querySelector('[data-testid="error-banner"]');
						const panel = document.querySelector('[data-testid="market-form-loaded"]');
						return {
							submitDisabled: btn?.disabled,
							submitText: btn?.textContent?.trim().slice(0, 100),
							errorClass: errorBanner?.getAttribute('data-error-class'),
							errorText: errorBanner?.textContent?.replace(/\s+/g, ' ').slice(0, 200),
							panelSnippet: panel?.textContent?.replace(/\s+/g, ' ').slice(0, 400)
						};
					})
				)
			);
		}
		await expect(submit).toBeEnabled({ timeout: 5_000 });
		await submit.click();

		// On-chain assertions: tNVDA delta + USDC debited.
		// Polling against anvil — independent of subgraph indexing.
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
			.toBeGreaterThan(0n);

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(usdcBalance).toBeLessThan(initialUsdc); // some USDC was spent

		// Negative check: no error banner.
		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});

	test('asset-anchored: receive 0.02 tNVDA → balance ≥ target (within slippage)', async ({
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
		// Pre-fund the ask-side wtNVDA orders' output vaults so the SDK preflight
		// finds real on-chain fillable depth. Subgraph reports the orders as
		// active with sentinel max-output Float values, but their on-chain vault
		// balances are 0 at FORK_BLOCK — without this, SDK returns no_liquidity.
		await prefundWtNvdaAskOrders(testClient);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: default inputMode is 'amount', no toggle needed.
		// 0.02 tNVDA target — sized so the SDK preflight can find sufficient
		// on-chain USDC vault depth within the 5% slippage cap (see spec-level
		// comment in spend-anchored test for the liquidity rationale).
		await page.locator('[data-testid="asset-input"] input').first().fill('0.02');

		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
		await expect(submit).toBeEnabled({ timeout: 30_000 });
		await submit.click();

		// 0.019 tNVDA floor = 0.02 target × (1 - 5% slippage), polled against anvil.
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
			.toBeGreaterThanOrEqual(parseUnits('0.019', tokens.tNVDA.decimals));

		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();
	});
});
