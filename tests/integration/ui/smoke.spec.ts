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
	// NOTE on the assertion shape: in production the trade flow ends with a
	// success toast fired by `pollAndFinalizeTakeOrders` after the take's
	// subgraph trade event indexes. In E2E that polling never resolves
	// (anvil's tx hash never appears in the live Goldsky subgraph), so the
	// toast can't fire within any reasonable spec timeout. We assert the
	// load-bearing signal — the taker's on-chain asset balance — instead.
	// Mocking the subgraph trade-activity endpoint to fire the toast in E2E
	// is tracked as a follow-up.
	test('happy path: 100 USDC → tNVDA fills on-chain (balance > 0 on anvil)', async ({
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

		// 7b. Bump slippage tolerance to absorb price drift between the SUBGRAPH
		//    (which indexes live chain head) and ANVIL (which is at FORK_BLOCK).
		//    The order's Rainlang expression reads Pyth's on-chain NVDA price;
		//    Pyth's price at the fork block differs from its price at live head
		//    by however much the asset moved since the fork. The taker's
		//    priceCap is computed from walkOrderbook's fills (subgraph quotes
		//    = live-head ratio) + slippage; if the on-chain (fork-block) ratio
		//    drifted above (priceCap + slippage), the SDK reports
		//    "No liquidity available for the requested token pair" and the
		//    take fails. Verified: at fork 45_990_727 the order's ratio is
		//    ~234.43, but the subgraph reports ~228.49 — a 2.6% drift on a
		//    one-day-old fork. Default UI slippage is 1%, which is not enough.
		//    5% absorbs typical 24-48h drift on tNVDA without masking real
		//    bugs (slippage cap is 50%).
		//
		//    Long-term fix: make FORK_BLOCK dynamic at globalSetup so the
		//    fork is within minutes of live head; then default slippage works.
		//    Tracked as a follow-up.
		//    Enter triggers the field's blur handler which commits the value
		//    via handleSlippageCommit() (MarketOrder.svelte:1187-1190).
		await page.locator('[data-testid="slippage-input"]').fill('5');
		await page.locator('[data-testid="slippage-input"]').press('Enter');

		// 7c. Submit.
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		// 8. On-chain assertion: tNVDA balance > 0 (stub forwarded
		//    eth_sendTransaction; anvil mined; the take-order filled). Polled
		//    against anvil — independent of the app's post-tx subgraph polling.
		//
		//    DESIGN NOTE: in production, after the on-chain take tx confirms,
		//    `pollAndFinalizeTakeOrders` polls the live Goldsky subgraph for
		//    the matching trade event before firing the success toast. In E2E
		//    that never resolves: anvil's tx hash will never appear in the
		//    live subgraph, so the toast never fires within the spec's
		//    timeout. The on-chain balance check captures whether the trade
		//    actually executed, which is the load-bearing assertion. Surfacing
		//    a success toast in E2E would require stubbing the subgraph trade
		//    activity endpoint — tracked as a follow-up.
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

		// 9. Final read for the variable used by step 10 (kept for parity
		//    with the original assertion shape; the poll above already
		//    asserted balance > 0).
		const tnvdaBalance = await testClient.readContract({
			address: tokens.tNVDA.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(tnvdaBalance).toBeGreaterThan(0n);
	});
});
