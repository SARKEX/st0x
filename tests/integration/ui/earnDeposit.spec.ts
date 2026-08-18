// TEST-08 — Save & Earn deposit via UI (Path-B deploy-and-take).
//
// The Save & Earn deposit is a market BUY of wtSGOV spending USDC, executed
// through the SAME engine as the market-order form (executeMarketOrder /
// filterQuotesForSide / sortQuotesByPrice) — only the entry point differs
// (SaveEarnModal instead of MarketOrder.svelte). This spec proves the whole
// modal path takes a real maker order on-chain.
//
// We deploy our own fixed-limit maker ASK offering wtSGOV at a reasonable
// price (the maker GIVES wtSGOV, TAKES USDC), surface it to the UI via the
// synthetic Goldsky + ST0x REST stubs, drive the SaveEarnModal deposit flow,
// and assert the on-chain balance delta (wtSGOV credited, USDC debited).
//
// See marketBuy.spec.ts for the architectural notes on the Path-B maker→taker
// model and the synthetic-stub fixes that unblock it.
//
// Funding note: wtSGOV is funded by impersonating the Rain Orderbook donor,
// same as the other ST0x wrappers. If the donor holds no wtSGOV at the chosen
// fork block, `fundToken` will revert — swap TOKENS.wtSGOV.donor (fixtures.ts)
// for a known wtSGOV holder and lower `makerDeposit` accordingly.
import { test, expect, fundToken, MAKER_ACCOUNT } from './fixtures';
import { deployMakerLimitOrder } from '../../helpers/makerOrders';
import { registerMakerOrders } from './syntheticOrdersStub';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-08 — Save & Earn deposit via UI (Path-B)', () => {
	test('deposit takes a maker ask: USDC spent, wtSGOV received', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// Save & Earn intentionally follows NYSE hours. Keep this money-moving test
		// deterministic instead of depending on the CI runner's wall clock.
		await page.clock.install({ time: new Date('2026-08-18T15:00:00Z') });

		// 180s budget: maker deploy (approve+addOrder multicall) + UI cache build
		// (getQuotes against synth orders) + take-orders multicall + receipt wait
		// + on-chain assertion polling.
		test.setTimeout(180_000);

		// Surface SDK / preflight errors so a failure has an explanation in stdout.
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

		// 1) Fund maker with wtSGOV — output token for an ask (maker GIVES wtSGOV).
		//    0.5 wtSGOV of depth covers a 10-USDC fill at ~$100/share (~0.1 share).
		const makerDeposit = parseUnits('0.5', tokens.wtSGOV.decimals);
		await fundToken({
			client: testClient,
			token: tokens.wtSGOV,
			holder: MAKER_ACCOUNT.address,
			amount: makerDeposit
		});

		// 2) Deploy maker ask at 100 USDC/wtSGOV via the production SDK path. The
		//    SaveEarnModal previews and executes through the same guarded REST quote
		//    path as MarketOrder, so $100 sits near the tokenized ETF's expected NAV.
		const maker = await deployMakerLimitOrder({
			testClient,
			makerPrivateKey: MAKER_ACCOUNT.privateKey,
			assetToken: {
				address: tokens.wtSGOV.address,
				symbol: 'wtSGOV',
				decimals: tokens.wtSGOV.decimals
			},
			paymentToken: {
				address: tokens.USDC.address,
				symbol: 'USDC',
				decimals: tokens.USDC.decimals
			},
			side: 'sell',
			pricePaymentPerAsset: '100',
			depositAmount: makerDeposit
		});
		registerMakerOrders(maker);

		// 3) Fund taker with USDC.
		const initialUsdc = parseUnits('1000', tokens.USDC.decimals);
		await fundToken({
			client: testClient,
			token: tokens.USDC,
			holder: fundedAccount.address,
			amount: initialUsdc
		});

		// 4) Drive UI: open the Save & Earn modal from the home card and deposit
		//    10 USDC into wtSGOV.
		await page.goto(`${process.env.PREVIEW_URL}/`);

		const openButton = page.locator('[data-testid="open-save-earn"]');
		await openButton.waitFor({ state: 'visible', timeout: 60_000 });
		await openButton.click();

		const modal = page.locator('[data-testid="save-earn-modal"][data-mode="deposit"]');
		await modal.waitFor({ state: 'visible', timeout: 30_000 });

		await page.locator('[data-testid="save-earn-amount"]').fill('10');

		// Wait for the authoritative REST quote to surface the maker ask. The
		// receive estimate only appears after a fully-filled guarded quote resolves.
		await expect(page.locator('[data-testid="save-earn-receive"]')).toContainText(/[0-9]/, {
			timeout: 60_000
		});

		// The deposit executes directly from the entry step (no separate review step).
		const confirm = page.locator('[data-testid="save-earn-confirm"]');
		await expect(confirm).toBeEnabled({ timeout: 30_000 });
		await confirm.click();

		// 5) On-chain assertion: wtSGOV credited to taker, USDC debited.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.wtSGOV.address,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [fundedAccount.address]
					}),
				{ timeout: 90_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeGreaterThan(0n);

		const usdcBalance = await testClient.readContract({
			address: tokens.USDC.address,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [fundedAccount.address]
		});
		expect(usdcBalance).toBeLessThan(initialUsdc);
	});
});
