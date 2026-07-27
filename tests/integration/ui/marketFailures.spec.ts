// Browser coverage for the local balance guard that runs before the REST
// calldata request. REST quote/calldata failures are covered by the buy/sell
// browser contract tests and the service unit tests.
import { test, expect, UNFUNDED_ACCOUNT, clickModeTab, openTradePanel } from './fixtures';
import { eip1193StubSource } from '../../helpers/eip1193Stub';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-08 — Market order local guards', () => {
	test('blocks a buy when the connected wallet has insufficient payment balance', async ({
		page,
		tokens
	}) => {
		await page.addInitScript(eip1193StubSource({ address: UNFUNDED_ACCOUNT.address }));
		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await openTradePanel(page, 'buy');
		await clickModeTab(page, 'market');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}
		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="insufficient_balance"]')
		).toBeVisible({ timeout: 90_000 });
		await expect(page.locator('[data-testid="trade-submit"][data-side="buy"]')).toBeDisabled();
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});
});
