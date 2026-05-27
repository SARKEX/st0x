// Wrap-ratio UX E2E — verifies the surfaces that light up when a wrapped
// token has a non-1:1 wrap ratio (chip, explainer modal, denom toggle,
// Ratio History tab).
//
// Target token: **wtSGOV** (iShares 0-3 Month T-Bill ETF). SGOV's wrap ratio
// will grow over time as T-bill yield accrues into the vault — see
// st0x.registry PR #22 + rain.pyth PR #20. Today every wrapper in the preview
// registry reports `assetsPerShare: "1.0"`, so this spec stubs the
// /v1/tokens/exchange-rates endpoints to inject a representative 1.0123 ratio
// (~1.23% accrued) and a synthetic donation/snapshot history.
//
// Why SGOV: SGOV isn't in the SFT subgraph yet, so `getSftById` returns null
// quickly — `singleTokenQuery` resolves fast, the page falls back to tokens.ts
// metadata for header/symbols/wrap-ratio plumbing, and the chip renders
// without waiting on subgraph hydration of trades/orders/etc. (Switching the
// target to a fully-indexed token like wtNVDA made the page hang on token-
// data loading and the chip never rendered within the 30s spec budget.)
//
// This spec deliberately does NOT use the `testClient` (anvil) fixture —
// every assertion is UI-only and reads from the stubbed API. The
// globalSetup still spawns anvil because Playwright globalSetup is global;
// the spec doesn't read from it.
import { test, expect } from './fixtures';

const WT_SGOV_ADDRESS = '0x78c31580c97101694C70022c83D570150c11e935';
const T_SGOV_ADDRESS = '0xc941C1506B7555Ba8C506Fb6c9b9CC259902d612';

// 1 wtSGOV = 1.0123 tSGOV — small enough to be plausible for an early-life
// yield-accruing wrapper, large enough that toFixed(4) rounding makes the
// difference visible in the UI.
const RATIO = 1.0123;

// ──────────────────────────── stub responses ────────────────────────────
function buildRatesResponse() {
	return [
		{
			share: { address: WT_SGOV_ADDRESS.toLowerCase(), symbol: 'wtSGOV', decimals: 18 },
			asset: { address: T_SGOV_ADDRESS.toLowerCase(), symbol: 'tSGOV', decimals: 18 },
			assetsPerShare: String(RATIO),
			blockNumber: 46437713,
			blockTimestamp: 1779664773,
			capturedAt: '2026-05-24 23:19:35'
		}
	];
}

function buildHistoryResponse() {
	return {
		share: { address: WT_SGOV_ADDRESS.toLowerCase(), symbol: 'wtSGOV', decimals: 18 },
		asset: { address: T_SGOV_ADDRESS.toLowerCase(), symbol: 'tSGOV', decimals: 18 },
		events: [
			{
				type: 'snapshot',
				blockNumber: 45_000_000,
				blockTimestamp: 1_777_000_000,
				assetsPerShare: '1.0',
				capturedAt: '2026-04-20 00:00:00'
			},
			{
				type: 'donation',
				blockNumber: 45_500_000,
				blockTimestamp: 1_778_500_000,
				txHash: '0x' + 'aa'.repeat(32),
				donor: '0x' + 'bb'.repeat(20),
				assetAmount: '12.34',
				newAssetsPerShare: '1.006'
			},
			{
				type: 'donation',
				blockNumber: 46_437_713,
				blockTimestamp: 1_779_664_773,
				txHash: '0x' + 'cc'.repeat(32),
				donor: '0x' + 'dd'.repeat(20),
				assetAmount: '5.5',
				newAssetsPerShare: String(RATIO)
			}
		],
		pagination: { page: 1, pageSize: 50, totalEvents: 3, totalPages: 1, hasMore: false }
	};
}

test.describe('Wrap ratio UX — non-1:1 wtSGOV (stubbed)', () => {
	test('chip, explainer, ratio history, denom toggle render with stubbed ratio', async ({
		page
	}) => {
		// Inject stubs BEFORE first navigation so the page's TanStack queries pick
		// them up on cold start.
		await page.route('**/api/st0x/v1/tokens/exchange-rates', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildRatesResponse())
			});
		});
		await page.route('**/api/st0x/v1/tokens/exchange-rates/history**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildHistoryResponse())
			});
		});
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
		await expect(chip).toContainText('1.0123 tSGOV');

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
		// Close — retry-loop the click for the same reason as the open: the
		// store-based reactive close path occasionally fails to propagate the
		// `show=false` to the modal mount when the page is hydrating heavy
		// reactive deps in the background.
		const closeBtn = modal.getByRole('button', { name: 'Got it' });
		await expect(async () => {
			await closeBtn.click();
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
		// the page is still hydrating the exchange-rates query (it's reactive
		// over the same currentRatio that drives the tab strip). Retry until
		// the panel content appears.
		const ratioTab = page.getByRole('tab', { name: /Ratio History/i }).first();
		await ratioTab.scrollIntoViewIfNeeded();
		await expect(async () => {
			await ratioTab.click();
			await expect(page.getByText('Wrap Ratio History')).toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });
		// Two donations in the stub — both should appear in the timeline.
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
