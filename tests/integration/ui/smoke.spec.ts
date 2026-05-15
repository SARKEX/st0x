// TEST-05 — UI-driven Anvil-fork harness smoke spec. CI gate per CONTEXT D-14.
//
// Skip-grammar mirrors tests/integration/marketOrder/anvil-fork.test.ts:17 — local
// dev without the BASE_RPC_URL secret skips the spec rather than failing the
// suite. CI provisions BASE_RPC_URL via the test-e2e job (Plan 01-09).
//
// What this spec proves:
// 1. Playwright + globalSetup spin anvil + vite preview + smoke probe successfully
// 2. EIP-1193 stub injection precedes svelte-wagmi initialization
// 3. CSP gate (E2E=1) lets the in-browser stub reach http://127.0.0.1:8545
// 4. Funding via setStorageAt → on-chain balance reads observe it
// 5. Mode-tab + side-toggle + trade-submit testids resolve and drive UI through
//    to a successful market order fill
// 6. Snapshot/revert lifecycle on the testClient fixture leaves no state leakage
import { test, expect, fundErc20, TOKENS, FUNDED_ACCOUNT } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-05 smoke — Buy market order via UI', () => {
	test('happy path: 100 USDC → tNVDA fills on-chain and surfaces success toast', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// 1. Fund USDC via setStorageAt (slot from 01-RUNBOOK.md table). Snapshot is
		//    already taken by the testClient fixture before this body runs.
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: parseUnits('1000', tokens.USDC.decimals),
			balanceSlot: tokens.USDC.balanceSlot
		});

		// 2. Navigate to the tNVDA trade page (preview URL set by globalSetup).
		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);

		// 3. Open the trade panel via the page-level Buy CTA.
		await page.click('[data-testid="open-trade"][data-side="buy"]');

		// 4. Click the market-mode tab and ensure the Buy side is selected. The
		//    panel opens with side=Buy by default; this click is idempotent and
		//    documents intent.
		// `force: true` on mode-tab — it's an sr-only test-only button (see
		// trade/[id]/+page.svelte:1819); the visible "Order Type" label
		// intercepts pointer events at the same absolute coordinates.
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');

		// 5. Wait for MarketOrder to mount past the assetToken-loading guard
		//    (Pitfall 4 — TanStack lazy-loaded components / data hydration).
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// 6. Toggle input mode to 'spend' so the testid resolves to spend-input.
		//    MarketOrder.svelte default is inputMode='amount' (commit 5b3c81d
		//    "market order by affordability" — landed after this spec was
		//    authored). The toggle button is rendered only for Buy side and
		//    carries data-mode reflecting current state; click only when needed.
		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}

		// 7. Fill the spend amount. The TradeAmountInput is wrapped by the
		//    spend-input testid; use a CSS descendant selector to land on its
		//    actual <input> element.
		await page.locator('[data-testid="spend-input"] input').first().fill('100');

		// 7. Submit.
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		// 8. UI assertion: success toast within 30s.
		await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });

		// 9. On-chain assertion: tNVDA balance > 0 (stub forwarded
		//    eth_sendTransaction; anvil mined; the take-order filled).
		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(tnvdaBalance).toBeGreaterThan(0n);
	});
});
