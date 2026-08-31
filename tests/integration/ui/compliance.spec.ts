import { expect, test } from '@playwright/test';

const forbiddenActions = [
	'Quick trade',
	'Place Market Order',
	'Place Limit Order',
	'Deploy Order',
	'Start earning',
	'Sell to USDC',
	'Launch Trading Terminal'
];

test('public pages expose information without trading actions', async ({ page }) => {
	const swapRequests: string[] = [];
	page.on('request', (request) => {
		if (/\/api\/st0x\/v[12]\/swap\/(quote|calldata)/.test(request.url())) {
			swapRequests.push(request.url());
		}
	});

	for (const path of ['/', '/markets', '/markets/nvda', '/platform-metrics', '/faqs', '/terms']) {
		await page.goto(path);
		await expect(page.locator('body')).toBeVisible();
		for (const label of forbiddenActions) {
			await expect(page.getByText(label, { exact: true })).toHaveCount(0);
		}
		await expect(page.getByRole('link', { name: 'Trade', exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Earn', exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Strategies', exact: true })).toHaveCount(0);
	}

	expect(swapRequests).toEqual([]);
});

test('retired routes return hard 404 responses', async ({ page }) => {
	for (const path of [
		'/trade/0x1234',
		'/trade/0x1234/proofs',
		'/strategies',
		'/earn',
		'/api-docs'
	]) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
		await expect(page).toHaveURL(path);
	}
});

test('website proxy rejects order, trade and swap endpoints', async ({ request }) => {
	for (const path of [
		'/api/st0x/v1/orders/token/0xToken',
		'/api/st0x/v1/orders/owner/0xOwner',
		'/api/st0x/v1/trades/token/0xToken',
		'/api/st0x/v1/trades/tx/0xHash',
		'/api/st0x/v1/trades/taker/0xTaker'
	]) {
		expect((await request.get(path)).status()).toBe(404);
	}

	for (const path of [
		'/api/st0x/v1/orders/query',
		'/api/st0x/v1/trades/query',
		'/api/st0x/v1/swap/quote',
		'/api/st0x/v1/swap/calldata',
		'/api/st0x/v2/swap/quote',
		'/api/st0x/v2/swap/calldata'
	]) {
		expect((await request.post(path, { data: {} })).status()).toBe(404);
	}
});

test('retired documentation assets are unavailable', async ({ page }) => {
	for (const path of ['/scalar.html', '/openapi.json']) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
	}
});

test('wallet page is limited to balances and wrapping', async ({ page }) => {
	await page.goto('/dashboard');
	await expect(page.getByText(/Connect your wallet to view token balances/)).toBeVisible();
	await expect(page.getByText('orders', { exact: true })).toHaveCount(0);
	await expect(page.getByText('vaults', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Trade', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Earn', { exact: true })).toHaveCount(0);
});

test('mobile primary navigation contains only retained sections', async ({ page }, testInfo) => {
	test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
	await page.goto('/');
	const primaryNavigation = page.getByRole('navigation', { name: 'Primary' });
	await expect(primaryNavigation).toBeVisible();
	await expect(primaryNavigation.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
	await expect(primaryNavigation.getByRole('link', { name: 'Markets', exact: true })).toBeVisible();
	await expect(primaryNavigation.getByRole('link', { name: 'Wallet', exact: true })).toBeVisible();
	await expect(primaryNavigation.getByRole('link', { name: 'Metrics', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Trade', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Earn', exact: true })).toHaveCount(0);
});

test('markets content uses readable theme tokens in light and dark modes', async ({ page }) => {
	for (const theme of ['light', 'dark'] as const) {
		await page.goto('/markets');
		await page.evaluate((nextTheme) => localStorage.setItem('st0x-theme', nextTheme), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

		const marketColors = await page.evaluate(() => {
			const resolveColor = (variable: string) => {
				const probe = document.createElement('span');
				probe.style.color = `var(${variable})`;
				document.body.append(probe);
				const color = getComputedStyle(probe).color;
				probe.remove();
				return color;
			};
			const heading = [...document.querySelectorAll('h1')].find(
				(element) => element.textContent?.trim() === 'Tokenized markets'
			);
			const section = heading?.closest('section');
			const introduction = heading?.nextElementSibling;
			const firstCard = section?.querySelector('ul a');
			const cardText = firstCard?.querySelector('span span:first-child');
			const cardDetail = firstCard?.querySelector('span span:last-child');
			if (!heading || !introduction || !firstCard || !cardText || !cardDetail) {
				throw new Error('Expected markets content was not rendered');
			}
			return {
				heading: getComputedStyle(heading).color,
				introduction: getComputedStyle(introduction).color,
				cardText: getComputedStyle(cardText).color,
				cardDetail: getComputedStyle(cardDetail).color,
				text: resolveColor('--text'),
				secondaryText: resolveColor('--text-2')
			};
		});

		expect(marketColors.heading).toBe(marketColors.text);
		expect(marketColors.cardText).toBe(marketColors.text);
		expect(marketColors.introduction).toBe(marketColors.secondaryText);
		expect(marketColors.cardDetail).toBe(marketColors.secondaryText);

		await page.goto('/markets/nvda');
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		const detailColors = await page.evaluate(() => {
			const heading = [...document.querySelectorAll('h1')].find(
				(element) => element.textContent?.trim().startsWith('Tokenized NVIDIA Corporation')
			);
			const body = heading?.closest('div')?.querySelector('p');
			const sectionHeading = heading?.closest('section')?.querySelector('h2');
			if (!heading || !body || !sectionHeading) {
				throw new Error('Expected market detail content was not rendered');
			}
			return {
				heading: getComputedStyle(heading).color,
				sectionHeading: getComputedStyle(sectionHeading).color,
				body: getComputedStyle(body).color,
				pageText: getComputedStyle(document.body).color
			};
		});
		expect(detailColors.heading).toBe(detailColors.pageText);
		expect(detailColors.sectionHeading).toBe(detailColors.pageText);
		expect(detailColors.body).not.toBe(detailColors.heading);
	}
});
