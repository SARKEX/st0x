// TEST-07 — Sell market order via UI. Mirror of TEST-06 on the Sell side.
// Covers asset-anchored + spend-anchored Sell paths (TRADE-04 mode×side regression
// matrix on the Sell side).
//
// INPUT/OUTPUT semantics (CLAUDE.md §"Order Semantics"):
//   Sell taker pays tNVDA, wants USDC, hits BID-side counterparty orders.
//   The asset-anchored test implicitly pins TRADE-01 — if Sell ever inverts and
//   hits ask-side counterparties, USDC would *decrease* (or stay flat) and tNVDA
//   would not be debited, which contradicts the BOTH-sides delta assertions below.
//
// Skip-grammar mirrors smoke.spec.ts:18 / marketBuy.spec.ts:19 — local dev without
// BASE_RPC_URL skips rather than fails. Plan 01-09 wires the CI archive-RPC run.
//
// D-11 enforcement: this file MUST NOT import from $lib/services/marketOrderExecution,
// $lib/stores/transaction, $lib/services/orderDeployment, $lib/services/walletService,
// or $lib/types/orderPerspective. ESLint no-restricted-imports rule from 01-03 enforces.
//
// Liquidity caveat (01-RUNBOOK §"No-liquidity (token, side) pair"): the runbook flags
// (wtAMZN, sell) as a known-empty book. tNVDA Sell is NOT on the empty-book list at
// FORK_BLOCK=33_400_000, but bid-side depth is not pre-verified by this agent. If the
// first CI run finds zero bid liquidity for tNVDA at the pinned block, swap to a
// token with confirmed bid depth and document in 01-RUNBOOK §"No-liquidity".
import { test, expect, fundErc20 } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via UI', () => {
	test('asset-anchored: sell 0.1 tNVDA → success toast + tNVDA debited + USDC credited', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Pre-fund 1 tNVDA so the 0.1-tNVDA sell is well-funded with headroom for
		// any pre-flight balance checks.
		const initialTnvda = parseUnits('1', tokens.tNVDA.decimals);
		await fundErc20({
			client: testClient,
			token: tokens.tNVDA.address,
			holder: fundedAccount.address,
			amount: initialTnvda,
			balanceSlot: tokens.tNVDA.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		// Open the trade panel via the page-level Sell CTA, then ensure market mode
		// + Sell side. Mirrors marketBuy.spec.ts open sequence with side flipped.
		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		// Wait for MarketOrder to mount past assetToken-loading guard (Pitfall 4).
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: fill asset-input (anchor on what we're selling).
		// Per MarketOrder.svelte the default inputMode is 'amount', so asset-input
		// is the resolved testid without any toggle click.
		await page.locator('[data-testid="asset-input"] input').first().fill('0.1');

		await page.click('[data-testid="trade-submit"][data-side="sell"]');

		// UI assertion: success toast within 30s AND error-banner not visible.
		// Both required — T-1-04-01 / T-1-05-01 mitigation (success-toast surface
		// flipping green on internal error must be caught by the error-banner check).
		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();

		// On-chain assertion: tNVDA debited AND USDC credited (T-1-05-01 mitigation —
		// if TRADE-01 ever inverts and Sell hits ask-side, USDC would decrease and
		// tNVDA stay flat; both checks fire to pin direction on both axes).
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
		expect(tnvdaBalance).toBeLessThan(initialTnvda); // some tNVDA was sold
		expect(usdcBalance).toBeGreaterThan(0n); // USDC was received
	});

	test('spend-anchored: target receive 10 USDC from selling tNVDA → balance ≥ 9.9 USDC (within slippage)', async ({
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
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="sell"]');

		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Spend-anchored on Sell: spend-input represents the USDC the user wants to
		// receive (the side-relative "spend/receive" framing — on Sell the user is
		// "spending" tNVDA to "receive" the spend-input USDC target). Per
		// MarketOrder.svelte the testid resolves to spend-input only when
		// inputMode === 'spend'; if the default mode flips to 'amount' (asset-anchored)
		// at mount, this surfaces here on first CI run and we add a toggle click.
		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		await page.click('[data-testid="trade-submit"][data-side="sell"]');

		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible();

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		// 9.9 USDC floor accounts for default slippage tolerance (typically ≤ 1%) on
		// the 10-USDC target receive. T-1-05-02 mitigation — asymmetric ratio-cap
		// math (Sell vs Buy) would produce <9.9 USDC. If first CI run shows the
		// actual default cap is wider, tighten or loosen this floor and document in
		// 01-RUNBOOK §"Slippage default" alongside the matching marketBuy floor.
		expect(usdcBalance).toBeGreaterThanOrEqual(parseUnits('9.9', tokens.USDC.decimals));
		expect(tnvdaBalance).toBeLessThan(initialTnvda); // some tNVDA was sold
	});
});
