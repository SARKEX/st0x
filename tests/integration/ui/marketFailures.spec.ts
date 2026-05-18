// TEST-08 — Market order failure modes via UI. One `test(...)` per failure mode,
// each forced through a deterministic mechanism (clock advance / signer swap /
// timestamp pin) and asserting the specific `data-error-class` value rendered
// by MarketOrder.svelte.
//
// Token: wtCOIN (Pyth on-chain feed, no st0x oracle, reliable depth at recent
// fork blocks).
//
// FORCING MECHANISMS:
//   - stale_oracle:         advanceTime(freshnessWindow + 60) + Date.now() offset patch
//   - insufficient_balance: re-inject EIP-1193 stub with UNFUNDED_ACCOUNT before goto
//   - market_closed:        setNextBlockTimestamp(next Saturday 03 UTC) + Date.now() pin
//   - no_liquidity:         request a size that exceeds any plausible orderbook depth
//
// No mocking of marketHours.ts or Pyth fetcher (D-06 — every forcing path drives
// the real codepath).
//
// Buy-spec pattern applied throughout:
//   - `force: true` on the mode-tab click (sr-only test hook is occluded by
//     the visible "Order Type" label at the same coordinates).
//   - For Buy-side spend-anchored entry: toggle input-mode to 'spend' before
//     filling spend-input (UI default flipped to 'amount' in 5b3c81d).
//   - `force: true` on the submit click — failure-mode tests expect the
//     submit button to be DISABLED by the error itself (insufficient_balance,
//     market_closed) or to surface the error class on click. Letting
//     Playwright wait-for-enabled would time out.
import { test, expect, fundErc20, UNFUNDED_ACCOUNT } from './fixtures';
import { eip1193StubSource } from '../../helpers/eip1193Stub';
import { advanceTime } from '../../helpers/anvilControl';
import { parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

const PYTH_FRESHNESS_WINDOW_SEC = 300; // 01-RUNBOOK §"Pyth freshness window"

/**
 * Compute the next Saturday-at-03:00-UTC timestamp strictly after `fromSec`.
 * anvil's setNextBlockTimestamp rejects timestamps ≤ the current block.
 */
function nextSaturday03Utc(fromSec: number): number {
	const d = new Date(fromSec * 1000);
	const day = d.getUTCDay(); // 0=Sun, 6=Sat
	const daysAhead = (6 - day + 7) % 7 || 7; // strict-after: never 0
	const target = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysAhead, 3, 0, 0)
	);
	return Math.floor(target.getTime() / 1000);
}

// Toggle input-mode to 'spend' (default flipped to 'amount' in 5b3c81d). Only Buy
// side renders the toggle; do not call on Sell-side tests.
async function ensureSpendMode(page: import('@playwright/test').Page): Promise<void> {
	const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
	if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
		await modeToggle.click();
	}
}

test.describe('TEST-08 — Market order failure modes via UI', () => {
	test('no liquidity — Buy huge wtCOIN amount exceeds orderbook depth → error-banner[data-error-class="no_liquidity"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Request 10000 wtCOIN — orderbook ask depth at any plausible fork
		// block is orders of magnitude smaller (typical aggregate ~10 wtCOIN
		// across active asks). Walk returns partial fills and the SDK preflight
		// rejects, surfacing `no_liquidity` per the error classifier.
		await fundErc20({
			client: testClient,
			token: tokens.USDC.address,
			holder: fundedAccount.address,
			amount: parseUnits('1000000', tokens.USDC.decimals),
			balanceSlot: tokens.USDC.balanceSlot
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Asset-anchored: ask for 10,000 wtCOIN.
		await page.locator('[data-testid="asset-input"] input').first().fill('10000');
		await page.click('[data-testid="trade-submit"][data-side="buy"]', { force: true });

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

		// Advance fork time past Pyth freshness window. Browser-side: monotonic
		// Date.now() offset patch — adds the same offset we advanced anvil by
		// so marketHours.ts and other clock-reading code stay in sync with the
		// fork.
		const advanceSec = PYTH_FRESHNESS_WINDOW_SEC + 60;
		await advanceTime(testClient, advanceSec);
		await page.addInitScript(`(() => {
			const realNow = Date.now;
			Date.now = () => realNow() + ${advanceSec * 1000};
		})();`);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await ensureSpendMode(page);
		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]', { force: true });

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="stale_oracle"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('insufficient balance — switch signer to UNFUNDED_ACCOUNT → error-banner[data-error-class="insufficient_balance"]', async ({
		page,
		tokens
	}) => {
		// Re-inject EIP-1193 stub with UNFUNDED_ACCOUNT — overrides the
		// FUNDED_ACCOUNT stub installed by the page fixture. UNFUNDED_ACCOUNT
		// has ETH for gas but zero ERC20 balance of any asset/payment token.
		await page.addInitScript(eip1193StubSource({ address: UNFUNDED_ACCOUNT.address }));

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await ensureSpendMode(page);
		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]', { force: true });

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="insufficient_balance"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test('market closed — next Saturday 03 UTC → error-banner[data-error-class="market_closed"]', async ({
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

		// Pin block timestamp to the next Saturday 03 UTC AFTER current chain
		// head + mine so on-chain reads observe the new timestamp.
		// Browser-side: pin Date.now() to the same epoch.
		const block = await testClient.getBlock();
		const saturdayTs = nextSaturday03Utc(Number(block.timestamp));
		await testClient.setNextBlockTimestamp({ timestamp: BigInt(saturdayTs) });
		await testClient.mine({ blocks: 1 });
		await page.addInitScript(`Date.now = () => ${saturdayTs * 1000};`);

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await ensureSpendMode(page);
		await page.locator('[data-testid="spend-input"] input').first().fill('100');
		await page.click('[data-testid="trade-submit"][data-side="buy"]', { force: true });

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="market_closed"]')
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});
});
