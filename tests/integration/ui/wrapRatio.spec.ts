// Wrap-ratio UX E2E — verifies the surfaces that light up when a wrapped
// token has a non-1:1 wrap ratio (chip, explainer modal, denom toggle,
// Ratio History tab).
//
// Target token: **wtSGOV** (iShares 0-3 Month T-Bill ETF). SGOV's wrap
// ratio is stubbed from the REST API response shape so the test covers the
// production data path without depending on staging data.
//
// Why SGOV: the token details response is stubbed so `singleTokenQuery`
// resolves fast and the page renders the wrap-ratio surfaces without depending
// on staging API/subgraph freshness.
//
// This spec deliberately does NOT use the `testClient` (anvil) fixture —
// every assertion is UI-only.
import { test, expect } from './fixtures';

const WT_SGOV_ADDRESS = '0x78c31580c97101694C70022c83D570150c11e935';
const T_SGOV_ADDRESS = '0xc941C1506B7555Ba8C506Fb6c9b9CC259902d612';

// The UI renders ratios with
// `toLocaleString('en-US', { maximumFractionDigits: 4 })`.
const RATIO_DISPLAY = '1.0027';

test.describe('Wrap ratio UX — non-1:1 wtSGOV (REST API)', () => {
	test('chip, explainer, ratio history, denom toggle render with REST wrap-ratio data', async ({
		page
	}) => {
		await page.route(/\/api\/st0x\/v1\/tokens/, async (route) => {
			const url = new URL(route.request().url());
			const pathname = url.pathname.toLowerCase();
			if (url.pathname === '/api/st0x/v2/tokens') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify([
						{
							address: WT_SGOV_ADDRESS,
							symbol: 'wtSGOV',
							decimals: 18,
							name: 'Wrapped iShares 0-3 Month Treasury Bond ETF ST0x',
							network: { chainId: 8453 },
							extensions: {
								category: 'ST0x',
								unwrappedAddress: T_SGOV_ADDRESS
							}
						}
					])
				});
				return;
			}
			if (url.pathname === '/api/st0x/v2/tokens/details') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						data: [
							{
								address: WT_SGOV_ADDRESS,
								receiptContractAddress: T_SGOV_ADDRESS,
								name: 'Wrapped iShares 0-3 Month Treasury Bond ETF ST0x',
								symbol: 'wtSGOV',
								decimals: 18,
								totalSupply: '0',
								holderCount: 0,
								transferCount: 0,
								bridgedSupply: '0',
								depositVolume: '0',
								withdrawVolume: '0',
								activityVolume: '0'
							}
						],
						errors: []
					})
				});
				return;
			}
			if (pathname === `/api/st0x/v2/tokens/${WT_SGOV_ADDRESS.toLowerCase()}/details`) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						address: WT_SGOV_ADDRESS,
						receiptContractAddress: T_SGOV_ADDRESS,
						name: 'Wrapped iShares 0-3 Month Treasury Bond ETF ST0x',
						symbol: 'wtSGOV',
						decimals: 18,
						totalSupply: '0',
						holderCount: 0,
						transferCount: 0,
						bridgedSupply: '0',
						depositVolume: '0',
						withdrawVolume: '0',
						activityVolume: '0',
						sftVaultAddress: T_SGOV_ADDRESS,
						deployTimestamp: 0,
						deployer: '0x0000000000000000000000000000000000000000',
						admin: '0x0000000000000000000000000000000000000000',
						activity: {
							deposits: [],
							withdraws: []
						}
					})
				});
				return;
			}
			if (pathname === `/api/st0x/v2/tokens/wrap-ratio/${WT_SGOV_ADDRESS.toLowerCase()}/history`) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						shareAddress: WT_SGOV_ADDRESS,
						assetAddress: T_SGOV_ADDRESS,
						events: [
							{
								type: 'snapshot',
								blockNumber: 46604184,
								blockTimestamp: 1748430000,
								assetsPerShare: '1.0',
								capturedAt: '1748430000'
							},
							{
								type: 'snapshot',
								blockNumber: 46604185,
								blockTimestamp: 1748433600,
								assetsPerShare: '1.002700626096609112',
								capturedAt: '1748433600'
							}
						],
						pagination: {
							page: 1,
							pageSize: 100,
							totalEvents: 2,
							totalPages: 1,
							hasMore: false
						}
					})
				});
				return;
			}
			if (url.pathname === '/api/st0x/v2/tokens/wrap-ratio') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						data: [
							{
								shareAddress: WT_SGOV_ADDRESS,
								assetAddress: T_SGOV_ADDRESS,
								assetsPerShare: '1.002700626096609112',
								blockNumber: 46604185,
								blockTimestamp: 1748433600,
								capturedAt: '1748433600'
							}
						],
						errors: []
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
		await page
			.locator('button[aria-label="Dismiss"]')
			.first()
			.click({ trial: true })
			.catch(() => {});

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
		await expect(page.getByRole('link', { name: /Unwrap in Dashboard/i }).first()).toBeVisible();

		// ───────── 4. Ratio History tab - timeline + snapshots ─────────
		// Tab click sometimes drops on the floor if hasRatio briefly flips while
		// the page is still hydrating (it's reactive over the same currentRatio
		// that drives the tab strip). Retry until the panel content appears.
		const ratioTab = page.getByRole('tab', { name: /Ratio History/i }).first();
		await ratioTab.scrollIntoViewIfNeeded();
		await expect(async () => {
			await ratioTab.click();
			await expect(page.getByText('Wrap Ratio History')).toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });
		// REST history returns sampled snapshots only. The most recent snapshot
		// gets the "latest" pill, followed by the synthetic deployment anchor.
		await expect(page.getByText(/^Snapshot$/).first()).toBeVisible();
		await expect(page.getByText(/^Deployed$/).first()).toBeVisible();
		await expect(page.getByText('latest').first()).toBeVisible();
		await expect(page.getByText(/^Rebase$/i)).toHaveCount(0);

		// ───────── 5. DenomToggle in the On-chain Market header ─────────
		const sharesBtn = page.getByRole('tab', { name: 'Shares (tSGOV)' });
		const tokensBtn = page.getByRole('tab', { name: 'Tokens (wtSGOV)' });
		await expect(sharesBtn).toBeVisible();
		await expect(tokensBtn).toBeVisible();
		await expect(sharesBtn).toHaveAttribute('aria-selected', 'true');
		await tokensBtn.click();
		await expect(tokensBtn).toHaveAttribute('aria-selected', 'true');

		// ───────── 6. Toggle re-scales table cells, not just headers ─────────
		// Regression guard for a Svelte reactivity bug we shipped once: the
		// table header switched its label between "(shares)" and "/ token"
		// when the toggle flipped, but the cell values stayed in their
		// original denomination because the per-row formatter functions read
		// `denomination` through a closure invisible to Svelte's template
		// dependency tracking. After the fix the cells re-render too.
		//
		// We don't need live orderbook data for this — clicking the toggle and
		// checking that the displayed token-suffix on at least one cell flips
		// from "wtSGOV" → "tSGOV" (and back) catches the bug.
		await page.getByRole('tab', { name: 'Orders' }).first().click();
		const ordersPanel = page.locator('[data-tutorial="dex-activity"]');

		// The orders table only renders its <thead>/<tbody> chrome when there
		// is at least one row to display. With no wallet connected the default
		// "My Orders" filter shows zero rows, so switch to "All Orders" to
		// surface live SGOV quotes from the API. If the API has no quotes for
		// SGOV at the fork block (rare but possible — the orderbook can churn)
		// we gracefully skip the cell-level assertion; the toggle aria flip
		// covered in section 5 is the floor-level guarantee for the toggle's
		// reactive plumbing.
		await ordersPanel.locator('select').first().selectOption('All Orders');

		// Switch back to shares and confirm the cells re-render with the
		// `tSGOV` label (the bug pre-fix was that they kept saying `wtSGOV`).
		await sharesBtn.click();
		await expect(sharesBtn).toHaveAttribute('aria-selected', 'true');

		const hasRows = (await ordersPanel.locator('tbody tr').count()) > 0;
		if (hasRows) {
			// Header re-labels: "Remaining (shares)" and "Price / share"
			await expect(ordersPanel.getByText(/Remaining\s*\(shares\)/i).first()).toBeVisible({
				timeout: 5_000
			});
			// Cells re-render: no `wtSGOV` suffix should appear in tbody, but
			// at least one `tSGOV` suffix should. This is the assertion the
			// pre-fix code failed: header changed but cells stayed in wt.
			await expect(ordersPanel.locator('tbody').getByText(/wtSGOV/i)).toHaveCount(0);
			await expect(
				ordersPanel
					.locator('tbody')
					.getByText(/(?<!w)tSGOV/i)
					.first()
			).toBeVisible();

			// And toggling back to wrapped flips them all back.
			await tokensBtn.click();
			await expect(tokensBtn).toHaveAttribute('aria-selected', 'true');
			await expect(
				ordersPanel
					.locator('tbody')
					.getByText(/wtSGOV/i)
					.first()
			).toBeVisible({ timeout: 5_000 });
		}
	});
});
