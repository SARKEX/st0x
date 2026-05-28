// Wrap-ratio UX E2E — verifies the surfaces that light up when a wrapped
// token has a non-1:1 wrap ratio (chip, explainer modal, denom toggle,
// Ratio History tab).
//
// Target token: **wtSGOV** (iShares 0-3 Month T-Bill ETF). SGOV's wrap
// ratio is 1.002700626096609112 today (verified on Base via
// `cast call wtSGOV.convertToAssets(1e18)` at block 46604184). The value
// plus a single historical dividend distribution event are pinned in
// `src/lib/config/wrapRatioFixture.json`; the UI reads from that file
// directly (no API call), so this spec doesn't need to mock the rates
// endpoint anymore.
//
// Why SGOV: SGOV isn't in the SFT subgraph yet, so `getSftById` returns
// null quickly — `singleTokenQuery` resolves fast, the page falls back to
// tokens.ts metadata for header/symbols/wrap-ratio plumbing, and the chip
// renders without waiting on subgraph hydration of trades/orders/etc.
//
// This spec deliberately does NOT use the `testClient` (anvil) fixture —
// every assertion is UI-only.
import { test, expect } from './fixtures';

const WT_SGOV_ADDRESS = '0x78c31580c97101694C70022c83D570150c11e935';
const T_SGOV_ADDRESS = '0xc941C1506B7555Ba8C506Fb6c9b9CC259902d612';

// Mirrors the value pinned in `src/lib/config/wrapRatioFixture.json`. The
// UI renders ratios with `toLocaleString('en-US', { maximumFractionDigits: 4 })`,
// so 1.002700626096609112 displays as "1.0027".
const RATIO_DISPLAY = '1.0027';

test.describe('Wrap ratio UX — non-1:1 wtSGOV (hardcoded fixture)', () => {
	test('chip, explainer, ratio history, denom toggle render with the SGOV fixture', async ({
		page
	}) => {
		// Stub the SFT subgraph for the SGOV singleTokenQuery so it resolves fast
		// and deterministically. SGOV's Goldsky entry is sparse / cold so the
		// upstream request can rate-limit or hit the fixtures.ts retry loop
		// (~25s of backoff), pushing `$singleTokenQuery.isPending` past the chip
		// timeout. We return a minimal `OffchainAssetReceiptVault` matching what
		// `getSftById` shapes the response into — the page then renders the chip
		// from this stub + tokens.ts metadata.
		await page.route(/api\.goldsky\.com\/.*\/sft-base\//, async (route) => {
			const body = route.request().postData() ?? '';
			if (body.toLowerCase().includes(WT_SGOV_ADDRESS.toLowerCase().slice(2))) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					headers: { 'access-control-allow-origin': '*' },
					body: JSON.stringify({
						data: {
							offchainAssetReceiptVaults: [
								{
									id: T_SGOV_ADDRESS.toLowerCase(),
									totalShares: '0',
									address: T_SGOV_ADDRESS.toLowerCase(),
									deployer: '0x0000000000000000000000000000000000000000',
									admin: '0x0000000000000000000000000000000000000000',
									name: 'Wrapped iShares 0-3 Month Treasury Bond ETF ST0x',
									symbol: 'wtSGOV',
									deployTimestamp: '0',
									receiptContractAddress: '0x0000000000000000000000000000000000000000',
									wrappedTokenContractAddress: WT_SGOV_ADDRESS.toLowerCase(),
									tokenHolders: [],
									receiptVaultInformations: [],
									withdraws: [],
									deposits: [],
									shareTransfers: []
								}
							]
						}
					})
				});
				return;
			}
			await route.fallback();
		});

		page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

		await page.goto(`http://127.0.0.1:4173/trade/${WT_SGOV_ADDRESS}`);

		// ───────── 1. Ratio chip in the token header ─────────
		const chip = page.locator('[data-testid="wrap-ratio-chip"]');
		await expect(chip).toBeVisible({ timeout: 30_000 });
		await expect(chip).toContainText('1 wtSGOV');
		await expect(chip).toContainText(`${RATIO_DISPLAY} tSGOV`);

		// ───────── 2. Explainer modal opens from the chip ─────────
		// Dismiss the "No USDC found" announcement banner so its dismiss-X button
		// doesn't accidentally absorb the click flow if Playwright targets the
		// wrong stacking layer.
		await page.locator('button[aria-label="Dismiss"]').first().click({ trial: true }).catch(() => {});

		const trigger = page.locator('[data-testid="wrap-explainer-trigger"]').first();
		await expect(trigger).toBeVisible();
		const modal = page.locator('[data-testid="wrap-explainer-modal"]');
		// Retry the trigger click — under suite-level page load the first click
		// occasionally drops on the floor (the wrap-explainer store flips true
		// but the Svelte reactive cycle hasn't yet propagated to the modal
		// mount). In isolation a single click always works; the retry covers
		// the race when the page is hydrating multiple TanStack queries in
		// parallel.
		await expect(async () => {
			await trigger.click();
			await expect(modal).toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });
		await expect(modal).toContainText("What's a Wrapped tStock?");
		// Close — dispatch the click via the DOM element directly. Playwright's
		// regular .click() can race the modal's fly-in transition: the
		// element looks "stable" mid-transition but the dispatch lands on a
		// stale reactive frame and onClose never fires. page.evaluate calls
		// the bound click handler directly on the bound element.
		const closeBtn = modal.getByRole('button', { name: 'Got it' });
		await expect(async () => {
			await closeBtn.evaluate((el: HTMLButtonElement) => el.click());
			await expect(modal).not.toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });

		// ───────── 3. Token Details → Contract → Wrap Ratio card ─────────
		// The contract tab is the default tab in Token Details. The yellow card
		// at the top has the ratio + "Unwrap in Dashboard" CTA.
		await expect(page.getByText('Wrap Ratio').first()).toBeVisible();
		await expect(
			page.getByRole('link', { name: /Unwrap in Dashboard/i }).first()
		).toBeVisible();

		// ───────── 4. Ratio History tab — timeline + events ─────────
		// Tab click sometimes drops on the floor if hasRatio briefly flips while
		// the page is still hydrating (it's reactive over the same currentRatio
		// that drives the tab strip). Retry until the panel content appears.
		const ratioTab = page.getByRole('tab', { name: /Ratio History/i }).first();
		await ratioTab.scrollIntoViewIfNeeded();
		await expect(async () => {
			await ratioTab.click();
			await expect(page.getByText('Wrap Ratio History')).toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });
		// The fixture has one dividend distribution + bracketing snapshots — the
		// "Donation / rebase" label and "current" pill should both appear.
		await expect(page.getByText(/Donation \/ rebase/i).first()).toBeVisible();
		await expect(page.getByText('current').first()).toBeVisible();

		// ───────── 5. DenomToggle in the On-chain Market header ─────────
		const sharesBtn = page.getByRole('tab', { name: 'Shares (tSGOV)' });
		const tokensBtn = page.getByRole('tab', { name: 'Tokens (wtSGOV)' });
		await expect(sharesBtn).toBeVisible();
		await expect(tokensBtn).toBeVisible();
		await expect(sharesBtn).toHaveAttribute('aria-selected', 'true');
		await tokensBtn.click();
		await expect(tokensBtn).toHaveAttribute('aria-selected', 'true');
	});
});
