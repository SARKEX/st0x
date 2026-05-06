// TEST-08 — Market order failure modes via UI. Five `test(...)` blocks, one per
// failure mode, each forced through a deterministic mechanism per D-06 / D-07 / D-08
// and asserting the specific `data-error-class` value rendered by MarketOrder.svelte
// (D-09 taxonomy).
//
// Inverts the assertion shape of marketBuy.spec.ts / marketSell.spec.ts: each spec
// here asserts `[data-testid="error-banner"][data-error-class="<class>"]` is visible
// AND the success-toast is NOT visible. No on-chain delta assertion — the point is
// that nothing should change on chain when a failure mode fires.
//
// FORCING MECHANISMS (per CONTEXT D-06 / D-07 / D-08):
//   - slippage:             UI input (0.001%) → real ratio-cap math reject
//   - no_liquidity:         (wtAMZN, sell) pair with naturally empty book at FORK_BLOCK
//   - stale_oracle:         advanceTime(freshnessWindow + 60) + Date.now() offset patch
//   - insufficient_balance: re-inject EIP-1193 stub with UNFUNDED_ACCOUNT before goto
//   - market_closed:        setNextBlockTimestamp(Saturday 03 UTC) + Date.now() pin
//
// NO MOCKING of marketHours.ts or Pyth fetcher (D-06 — every forcing path drives the
// real codepath). Pinned constants come from 01-RUNBOOK.md.
//
// D-11 enforcement: this file MUST NOT import from $lib/services/marketOrderExecution,
// $lib/stores/transaction, $lib/services/orderDeployment, $lib/services/walletService,
// or $lib/types/orderPerspective. ESLint no-restricted-imports rule from 01-03 enforces.
import { test, expect, fundErc20, UNFUNDED_ACCOUNT } from './fixtures';
import { eip1193StubSource } from '../../helpers/eip1193Stub';
import { advanceTime } from '../../helpers/anvilControl';
import { parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

// Pinned values from 01-RUNBOOK.md. If any constant moves in the runbook, update here.
const PYTH_FRESHNESS_WINDOW_SEC = 300; // 01-RUNBOOK §"Pyth freshness window" (ASSUMED 300s default)
const NO_LIQUIDITY_TOKEN_ID = '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53'; // wtAMZN — 01-RUNBOOK §"No-liquidity (token, side) pair" primary
const NO_LIQUIDITY_SIDE = 'sell' as const; // (wtAMZN, sell) — naturally one-sided book at FORK_BLOCK=33_400_000
const SATURDAY_03_UTC = 1745550000; // Sat 2026-04-25 03:00:00 UTC — 01-RUNBOOK §"Saturday market-hours timestamp"

test.describe('TEST-08 — Market order failure modes via UI', () => {
	test('slippage exceeded — 0.001% slippage on Buy → error-banner[data-error-class="slippage"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: parseUnits('1000', tokens.USDC.decimals),
			balanceSlot: tokens.USDC.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// 0.001% — well below any feasible spread; ratio-cap math rejects naturally
		// inside marketOrderExecution.ts. slippage-input is directly an <input>
		// element (MarketOrder.svelte:1124-1133), not a wrapper, so fill targets
		// the testid directly (unlike spend-input/asset-input).
		await page.fill('[data-testid="slippage-input"]', '0.001');
		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="slippage"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('no liquidity — empty book (wtAMZN, sell) at FORK_BLOCK → error-banner[data-error-class="no_liquidity"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Fund wtAMZN so the failure mode can ONLY be "no liquidity" (not "insufficient
		// balance"). T-1-06-02 mitigation: pre-fund the asset being sold so a balance
		// failure can't masquerade as no-liquidity.
		await fundErc20({
			client: testClient,
			token: tokens.tAMZN.address,
			holder: fundedAccount.address,
			amount: parseUnits('10', tokens.tAMZN.decimals),
			balanceSlot: tokens.tAMZN.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${NO_LIQUIDITY_TOKEN_ID}`);
		await page.click(`[data-testid="open-trade"][data-side="${NO_LIQUIDITY_SIDE}"]`);
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click(`[data-testid="side-toggle"][data-side="${NO_LIQUIDITY_SIDE}"]`);
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored amount on Sell — fill what we want to sell.
		await page.locator('[data-testid="asset-input"] input').first().fill('1');
		await page.click(`[data-testid="trade-submit"][data-side="${NO_LIQUIDITY_SIDE}"]`);

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="no_liquidity"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('stale oracle — advance time past Pyth freshness → error-banner[data-error-class="stale_oracle"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: parseUnits('1000', tokens.USDC.decimals),
			balanceSlot: tokens.USDC.balanceSlot
		});

		// Advance fork time past Pyth freshness window (Pitfall 6 — advanceTime helper
		// does setNextBlockTimestamp + mine so eth_call reads observe the new timestamp).
		// Browser-side: monotonic Date.now() offset patch per 01-RUNBOOK §"evm_setNextBlockTimestamp
		// + Date.now() patch sync" — adds the same offset we advanced anvil by.
		const advanceSec = PYTH_FRESHNESS_WINDOW_SEC + 60;
		await advanceTime(testClient, advanceSec);
		await page.addInitScript(`(() => {
			const realNow = Date.now;
			Date.now = () => realNow() + ${advanceSec * 1000};
		})();`);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="stale_oracle"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('insufficient balance — switch signer to UNFUNDED_ACCOUNT → error-banner[data-error-class="insufficient_balance"]', async ({
		page,
		tokens
	}) => {
		// Re-inject EIP-1193 stub with UNFUNDED_ACCOUNT — overrides the FUNDED_ACCOUNT
		// stub installed by the page fixture. Re-injection MUST happen before goto()
		// so svelte-wagmi's `injected` connector reads the new account on first eval
		// (Pitfall 1 / T-1-06-02 mitigation: addInitScript runs at next navigation).
		// UNFUNDED_ACCOUNT has ETH for gas but zero ERC20 balance of any asset/payment
		// token — submitting a Buy will trip the wallet/approval balance check.
		await page.addInitScript(eip1193StubSource({ address: UNFUNDED_ACCOUNT.address }));

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="insufficient_balance"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('market closed — Saturday 03 UTC → error-banner[data-error-class="market_closed"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: parseUnits('1000', tokens.USDC.decimals),
			balanceSlot: tokens.USDC.balanceSlot
		});

		// Pin block timestamp to Sat 2026-04-25 03:00:00 UTC + mine so on-chain reads
		// observe the new timestamp (Pitfall 6). Browser-side: pin Date.now() to the
		// same epoch — marketHours.ts isOutsideMarketHours() reads `new Date()` and
		// the patched epoch lands on dayOfWeek === 6 in ET (Saturday, market closed).
		await testClient.setNextBlockTimestamp({ timestamp: BigInt(SATURDAY_03_UTC) });
		await testClient.mine({ blocks: 1 });
		await page.addInitScript(`Date.now = () => ${SATURDAY_03_UTC * 1000};`);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="market_closed"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});
});
