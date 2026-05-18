// TEST-09 — Limit deploy via UI.
//
// Scope:
//   Limit-order deployment from the UI deposits into the correct (OUTPUT) vault
//   per CLAUDE.md maker INPUT/OUTPUT semantics. For a Sell maker:
//       orderOutput = Asset (wtCOIN), orderInput = Payment (USDC)
//   The order GIVES AWAY wtCOIN when filled, RECEIVES USDC.
//
//   `orderDeployment.ts` calls `gui.setDeposit('output', amount)` so the deposit
//   wires to the asset (wtCOIN) vault on Sell. The UI flow MUST drain the
//   maker's wtCOIN balance — if the deposit landed in INPUT (TRADE-01 side
//   inversion), the maker's USDC balance would drop instead.
//
// Out of scope: counterparty fill. The previous incarnation of this spec
// rolled its own takeOrders3 calldata via a minimal ABI; the deployed
// orderbook at 0xe522cB... is a custom Rain build with non-canonical
// selectors (verified via the deposit-selector reverse-engineering in
// tests/helpers/anvilControl.ts), so hand-rolled ABI was fragile. The
// OUTPUT-vault drain alone is the load-bearing TRADE-01 mitigation —
// fill mechanics are covered by marketBuy/marketSell which exercise the
// SDK-generated takeOrders calldata path.
//
// Pitfall 4 (LimitOrder lazy-load): LimitOrder.svelte is dynamically imported
// via `{#await import()}` (PERF-01). Wait on the `limit-form-loaded` anchor
// before any LimitOrder testid resolves; clicking `deploy-submit` before
// the chunk lands silently no-ops.
import { test, expect, fundToken } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-09 — Limit deploy', () => {
	test('Sell limit deploys, deposit lands in OUTPUT (wtCOIN) vault', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Pre-fund maker with wtCOIN — this is the OUTPUT vault token for a Sell
		// maker (gives away wtCOIN, receives USDC). Per CLAUDE.md §"Order Semantics":
		// Sell maker → orderOutput = Asset; deposit into OUTPUT.
		const depositAmount = parseUnits('1', tokens.wtCOIN.decimals); // 1 wtCOIN
		await fundToken({
			client: testClient,
			token: tokens.wtCOIN,
			holder: fundedAccount.address,
			amount: depositAmount
		});

		// Snapshot maker pre-deploy balances. TRADE-01 mitigation pivots on this:
		// post-deploy, wtCOIN must drop (deposited to OUTPUT vault).
		const makerAssetPre = await testClient.readContract({
			address: tokens.wtCOIN.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		// Open the trade panel via page-level Sell CTA (we want a Sell limit).
		await page.click('[data-testid="open-trade"][data-side="sell"]');
		// `force: true` mirrors the buy-spec pattern: the sr-only mode-tab is
		// occluded by the visible "Order Type" label at the same coordinates.
		await page.click('[data-testid="mode-tab"][data-mode="limit"]', { force: true });

		// Wait for LimitOrder to mount past the {#await import()} chunk.
		await page.waitForSelector('[data-testid="limit-form-loaded"]');

		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		// deposit-input wraps a TradeAmountInput; fill the inner <input>.
		await page.locator('[data-testid="deposit-input"] input').first().fill('1');

		// 999 USDC/wtCOIN — well above market so the order is "above-market sell".
		// Pure price-leg test; we are not testing fill mechanics here.
		await page.fill('[data-testid="price-input"]', '999');

		// Wait for deploy-submit to enable — under CI's cold RPC cache the wagmi
		// balance read + Rain GUI initialization can take >5s, so the default
		// click auto-retry window would expire against a disabled button.
		const deploySubmit = page.locator(
			'[data-testid="deploy-submit"][data-side="sell"][data-mode="limit"]'
		);
		await expect(deploySubmit).toBeEnabled({ timeout: 30_000 });
		await deploySubmit.click();

		// Deploy-success surface: success-toast AND maker wtCOIN balance drop.
		// LimitOrder.svelte:311 flips `tradeSubmittedSuccessfully = true`
		// SYNCHRONOUSLY before transactionStore.handleLimitDeploy() — so the
		// toast represents "submitted", not "confirmed". Assert BOTH the UI
		// surface AND on-chain state so a stale toast can't false-pass.
		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({
			timeout: 30_000
		});

		// On-chain assertion: maker wtCOIN balance dropped (deposited to OUTPUT
		// vault). TRADE-01 maker-side-inversion mitigation — if Sell maker
		// deposit landed in INPUT (USDC) vault by mistake, this assertion
		// fails. Polled because the toast fires on click but the
		// approve+deposit txns need to land before the balance settles.
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
			.toBeLessThan(makerAssetPre);
	});
});
