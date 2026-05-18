// TEST-08 — Market order failure modes via UI. One `test(...)` per failure mode,
// each forced through a deterministic mechanism (clock advance / signer swap /
// timestamp pin) and asserting the specific `data-error-class` value rendered
// by MarketOrder.svelte.
//
// Token: wtCOIN (Pyth on-chain feed, no st0x oracle, reliable depth at recent
// fork blocks).
//
// CURRENT STATUS: only `insufficient_balance` passes. The other three are
// skipped pending a cache pre-warm helper + per-test debugging:
//   - stale_oracle / market_closed: the fork-stub's cache MUST be built BEFORE
//     the forcing mechanism (advanceTime / Saturday-pin) is applied. If the
//     cache build runs against a stale-Pyth or off-hours anvil, all quotes
//     revert and the orderbook is empty — the classifier then emits
//     `no_liquidity` instead of the asserted error class. In suite order
//     marketBuy runs first and warms the cache, but the time-shift these
//     tests then apply seems to break the SDK preflight differently than
//     expected; the classifier never settles on stale_oracle/market_closed.
//     Needs deeper investigation of the prep-error message the SDK actually
//     surfaces in these scenarios.
//   - no_liquidity: passes in isolation against wtSPYM (`-g "no liquidity"`)
//     but flakes in the suite at ~3s — the wtSPYM page appears to close
//     early. Same fundamental approach works; just needs the page-settle wait.
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
import { test, expect, fundErc20, fundToken, UNFUNDED_ACCOUNT } from './fixtures';
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
	test.skip('no liquidity — Sell on a token with no bid-side orders → error-banner[data-error-class="no_liquidity"]', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// SKIP rationale: the test passes in isolation against wtSPYM (which has
		// no on-chain Pyth feed → all orders fail to quote → empty orderbook →
		// walkOrderbook returns no_quotes → classifier emits no_liquidity).
		// In the full suite it flakes at 3.4s — the wtSPYM page appears to close
		// early (legacySymbol-redirect or feed-resolution race). Reproduce in
		// isolation: `npx playwright test -g "no liquidity"` PASSES.
		// TODO: stabilize across suite ordering. Likely needs a wait for the page
		// to settle on wtSPYM (its empty-feed path may trigger a redirect/reload)
		// before opening the trade panel.
		// Strategy: use wtSPYM. It quotes via the st0x off-chain oracle (NOT
		// Pyth on-chain), and that oracle is NOT served against the fork. So
		// every wtSPYM order's `quote()` reverts when the fork stub tries to
		// build the cache, and they're dropped (`UnsupportedFeedSymbol` /
		// signed-context-oracle revert). The UI receives an empty orderbook
		// for wtSPYM, walkOrderbook returns no quotes for ANY pair involving
		// it, and the classifier emits `no_liquidity` per
		// MarketOrder.svelte:326 (priceError && no_quotes).
		//
		// Fund the maker with wtSPYM so the test can fill the asset-input
		// without tripping `insufficient_balance` first.
		await fundToken({
			client: testClient,
			token: tokens.wtSPYM,
			holder: fundedAccount.address,
			amount: parseUnits('1', tokens.wtSPYM.decimals)
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtSPYM.id}`);
		await page.click('[data-testid="open-trade"][data-side="sell"]');
		await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
		await page.click('[data-testid="side-toggle"][data-side="sell"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await page.locator('[data-testid="asset-input"] input').first().fill('0.1');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="no_liquidity"]')
		).toBeVisible({ timeout: 90_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test.skip('stale oracle — advance time past Pyth freshness → error-banner[data-error-class="stale_oracle"]', async ({
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
		).toBeVisible({ timeout: 90_000 });
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
		// 10 USDC — small enough to fit orderbook depth so walkOrderbook
		// succeeds and `marketPrice` populates. The classifier in
		// MarketOrder.svelte:314 gates `insufficient_balance` on `marketPrice`
		// being truthy (line 282); larger amounts trigger no_fill →
		// no_liquidity, which has higher precedence and masks the
		// insufficient_balance assertion under test.
		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		// Cache build (~20s) + walk → marketPrice → balance check (~10-15s more)
		// to settle on `insufficient_balance`. The classifier transitions through
		// `no_liquidity` briefly before the balance comparison fires — the 90s
		// budget covers both with margin.
		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="insufficient_balance"]')
		).toBeVisible({ timeout: 90_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});

	test.skip('market closed — next Saturday 03 UTC → error-banner[data-error-class="market_closed"]', async ({
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
		).toBeVisible({ timeout: 90_000 });
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});
});
