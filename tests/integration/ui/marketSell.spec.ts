// TEST-07 — Sell market order via UI (Path-B deploy-and-take).
//
// Mirror of marketBuy.spec.ts on the opposite side: deploy a maker BID (the
// maker GIVES USDC, TAKES wtCOIN), then drive the UI through a market SELL of
// wtCOIN against it. Same fixed-limit registry path — no Pyth / NYSE-hours
// gates on the maker order itself.
//
// On-chain assertion: taker's wtCOIN balance dropped (sold) AND USDC balance
// grew (proceeds received). See marketBuy.spec.ts for the architectural notes
// and the synthetic-stub fixes that unblock Path-B.
import {
	test,
	expect,
	fundToken,
	clickModeTab,
	openTradePanel,
	MAKER_ACCOUNT
} from './fixtures';
import { deployMakerLimitOrder } from '../../helpers/makerOrders';
import { registerMakerOrders } from './syntheticOrdersStub';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-07 — Sell market order via UI (Path-B)', () => {
	test('takes a maker bid: wtCOIN sold, USDC received', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		test.setTimeout(180_000);

		page.on('console', (msg) => {
			const text = msg.text();
			if (
				text.includes('take-order failed') ||
				text.includes('SDK error') ||
				text.includes('readableMsg') ||
				text.includes('no_liquidity') ||
				text.includes('preflight') ||
				msg.type() === 'error'
			) {
				console.log(`[browser ${msg.type()}] ${text.slice(0, 600)}`);
			}
		});
		page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

		// 1) Fund maker with USDC — output token for a bid (maker GIVES USDC).
		//    200 USDC is enough for the taker to sell ~1 wtCOIN at ~$180/coin.
		const makerDeposit = parseUnits('200', tokens.USDC.decimals);
		await fundToken({
			client: testClient,
			token: tokens.USDC,
			holder: MAKER_ACCOUNT.address,
			amount: makerDeposit
		});

		// 2) Deploy maker bid at 200 USDC/wtCOIN — within the PRICE_GUARD_MULTIPLIER
		//    ±5% band around the ~$180-$185 oracle, taker-favorable on a sell.
		const maker = await deployMakerLimitOrder({
			testClient,
			makerPrivateKey: MAKER_ACCOUNT.privateKey,
			assetToken: {
				address: tokens.wtCOIN.address,
				symbol: 'wtCOIN',
				decimals: tokens.wtCOIN.decimals
			},
			paymentToken: {
				address: tokens.USDC.address,
				symbol: 'USDC',
				decimals: tokens.USDC.decimals
			},
			side: 'buy',
			pricePaymentPerAsset: '200',
			depositAmount: makerDeposit
		});
		registerMakerOrders(maker);

		// 3) Fund taker with wtCOIN.
		const initialAsset = parseUnits('1', tokens.wtCOIN.decimals);
		await fundToken({
			client: testClient,
			token: tokens.wtCOIN,
			holder: fundedAccount.address,
			amount: initialAsset
		});

		const initialUsdc = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});

		// 4) Drive UI: market SELL 0.05 wtCOIN.
		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		await openTradePanel(page, 'sell');
		await clickModeTab(page, 'market');
		await page.click('[data-testid="side-toggle"][data-side="sell"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// Sell side is asset-anchored by default; the spend-input/asset-input
		// testid auto-switches to `asset-input` for sell. Fill the asset amount
		// directly (no input-mode toggle needed on sell — only buy exposes the
		// USD-anchored "spend up to" path).
		// Wait for the wagmi balance read of wtCOIN to settle BEFORE filling
		// the asset input. TradeAmountInput's `$: balancePromise` is reactive
		// over `$walletAddress` and `$wagmiConfig`; a race between the initial
		// null-walletAddress invocation and the post-connection one
		// occasionally leaves `spendingTokenBalance` at the default `0n` even
		// after wagmi has resolved. Waiting for the visible "Balance: 1.000"
		// row in the panel proves the second balancePromise resolution landed.
		await expect(
			page.getByText(/Balance:\s*1\.000?/i).first()
		).toBeVisible({ timeout: 30_000 });
		await page.locator('[data-testid="asset-input"] input').first().fill('0.05');

		const submit = page.locator('[data-testid="trade-submit"][data-side="sell"]');
		await expect(submit).toBeEnabled({ timeout: 60_000 });
		await submit.click();

		// 5) On-chain assertion: USDC credited, wtCOIN debited.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.USDC.address,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [fundedAccount.address]
					}),
				{ timeout: 90_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeGreaterThan(initialUsdc);

		const wtCoinBalance = await testClient.readContract({
			address: tokens.wtCOIN.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(wtCoinBalance).toBeLessThan(initialAsset);
	});
});
