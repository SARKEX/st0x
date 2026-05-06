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
// D-11 enforcement: this file MUST NOT import from $lib/services/marketOrderExecution,
// $lib/stores/transaction, $lib/services/orderDeployment, $lib/services/walletService,
// or $lib/types/orderPerspective. ESLint no-restricted-imports rule from 01-03 enforces.
import { test, expect, fundErc20 } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-06 — Buy market order via UI', () => {
	test('spend-anchored: 100 USDC → tNVDA fills + success toast + USDC debited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Fund 1000 USDC so the 100-USDC spend is well-funded with headroom for
		// any pre-flight balance checks plus slippage.
		const initialUsdc = parseUnits('1000', tokens.USDC.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: initialUsdc,
			balanceSlot: tokens.USDC.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		// Open the trade panel via the page-level Buy CTA, then ensure market mode
		// + Buy side. Mirrors smoke.spec.ts open sequence.
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		// Wait for MarketOrder to mount past assetToken-loading guard (Pitfall 4).
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Spend-anchored: fill the spend-input. Per MarketOrder.svelte the testid
		// resolves to spend-input only when inputMode === 'spend'. Smoke spec used
		// the same pattern; if the default mode flips to 'amount' (asset-anchored)
		// at mount, this will surface here on first CI run and we add a toggle click.
		await page.locator('[data-testid="spend-input"] input').first().fill('100');

		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		// UI assertion: success toast within 30s AND error-banner not visible.
		// Both required — T-1-04-01 mitigation (success-toast surface flipping
		// green on internal error must be caught by the error-banner check).
		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();

		// On-chain assertion: tNVDA delta + USDC debited.
		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(tnvdaBalance).toBeGreaterThan(0n);
		expect(usdcBalance).toBeLessThan(initialUsdc); // some USDC was spent
	});

	test('asset-anchored: receive 0.1 tNVDA → success toast + balance ≥ target (within slippage)', async ({
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

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: fill asset-input (anchor on what we want to receive).
		// Per MarketOrder.svelte the default inputMode is 'amount', so asset-input
		// is the resolved testid without any toggle click.
		await page.locator('[data-testid="asset-input"] input').first().fill('0.1');

		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();

		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		// 0.099 tNVDA floor accounts for default slippage tolerance (typically ≤ 1%).
		// 01-RUNBOOK pins Pyth freshness at 300s default but does not pin a slippage
		// cap — if first CI run shows the actual default cap is wider, tighten or
		// loosen this floor and document in 01-RUNBOOK §"Slippage default".
		expect(tnvdaBalance).toBeGreaterThanOrEqual(parseUnits('0.099', tokens.tNVDA.decimals));
	});

});
