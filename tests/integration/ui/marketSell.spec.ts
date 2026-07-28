// Browser contract test for the market-sell REST calldata boundary.
import { test, expect, fundToken, clickModeTab, openTradePanel } from './fixtures';
import { parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via REST calldata', () => {
	test('posts spendUpTo with optional slippage and surfaces an API rejection', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		await fundToken({
			client: testClient,
			token: tokens.wtCOIN,
			holder: fundedAccount.address,
			amount: parseUnits('1', tokens.wtCOIN.decimals)
		});

		let resolveRequest!: (body: Record<string, unknown>) => void;
		const requestReceived = new Promise<Record<string, unknown>>((resolve) => {
			resolveRequest = resolve;
		});
		await page.route('**/api/st0x/v2/swap/calldata', async (route) => {
			resolveRequest(route.request().postDataJSON() as Record<string, unknown>);
			await route.fulfill({
				status: 400,
				contentType: 'text/plain',
				body: 'No liquidity available right now'
			});
		});

		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);
		await openTradePanel(page, 'sell');
		await clickModeTab(page, 'market');
		await page.click('[data-testid="side-toggle"][data-side="sell"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		await page.locator('[data-testid="asset-input"] input').first().fill('0.1');
		await page.locator('[data-testid="slippage-input"]').fill('1.25');
		await page.locator('[data-testid="slippage-input"]').blur();

		const submit = page.locator('[data-testid="trade-submit"][data-side="sell"]');
		await expect(submit).toBeEnabled();
		await submit.click();

		expect(await requestReceived).toEqual({
			taker: fundedAccount.address,
			inputToken: tokens.wtCOIN.address,
			outputToken: tokens.USDC.address,
			mode: 'spendUpTo',
			amount: '0.1',
			slippageBps: 125,
			denomination: 'wrapped'
		});
		await expect(
			page.locator('[data-testid="error-banner"][data-error-class="no_liquidity"]')
		).toBeVisible();
		await expect(page.locator('[data-testid="success-toast"]')).not.toBeVisible();
	});
});
