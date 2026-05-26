// TEST-06 — Buy market order via UI (Path-B deploy-and-take).
//
// We deploy our own fixed-limit maker order to anvil (no Pyth / NYSE-hours
// gates, unlike production tokenized-security orders) and take it through
// the UI's market path. The synthetic Goldsky + ST0x REST stubs surface the
// maker order to the UI; the SDK's preflight reads the Float-encoded vault
// balance from the stub, the take-orders multicall hits anvil, and we
// assert the on-chain balance delta.
//
// Historical context: prior to commit `4b48798` this spec was Path-A
// (re-quote LIVE orders against the fork) which was Saturday/NYSE-hours
// brittle. Path-B was scaffolded (makerOrders.ts + syntheticOrdersStub.ts)
// but never wired into the spec because the SDK preflight reported
// `no_liquidity`. Root cause: the Goldsky stub's `outputs[0].balance` was
// hard-coded to all-zero bytes32 — the SDK reads that field via Float.parse
// for the liquidity gate, sees 0, and refuses to quote. Fix in
// syntheticOrdersStub.ts:encodeVaultBalanceHex — Float-encode the real
// vault balance, same call shape Albion's deposit4 helper uses.
import {
	test,
	expect,
	fundToken,
	clickModeTab,
	MAKER_ACCOUNT
} from './fixtures';
import { deployMakerLimitOrder } from '../../helpers/makerOrders';
import { registerMakerOrders } from './syntheticOrdersStub';
import { erc20Abi, parseUnits } from 'viem';

test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required for anvil fork');

test.describe('TEST-06 — Buy market order via UI (Path-B)', () => {
	test('takes a maker ask: USDC spent, wtCOIN received', async ({
		page,
		testClient,
		tokens,
		fundedAccount
	}) => {
		// 180s budget: maker deploy (approve+addOrder multicall) + UI cache build
		// (parallel getQuotes against synth orders) + take-orders multicall +
		// receipt wait + on-chain assertion polling.
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

		// 1) Fund maker with wtCOIN — output token for an ask (maker GIVES wtCOIN).
		//    1 wtCOIN of depth is plenty for a 10-USDC fill at ~$300/coin.
		const makerDeposit = parseUnits('1', tokens.wtCOIN.decimals);
		await fundToken({
			client: testClient,
			token: tokens.wtCOIN,
			holder: MAKER_ACCOUNT.address,
			amount: makerDeposit
		});

		// 2) Deploy maker ask via the production SDK path (same registry the UI
		//    hits). MarketOrder.svelte applies a PRICE_GUARD_MULTIPLIER=1.05
		//    band around the Pyth oracle price for liquidity matching — quotes
		//    outside ±5% are filtered out and the form reports `no_liquidity`.
		//    wtCOIN tracks Coinbase Global; the spot oracle hovers around
		//    $180-$185 at recent fork blocks. 170 USDC/wtCOIN sits comfortably
		//    inside the band on either side of the oracle (and is taker-
		//    favorable so the slippage check passes too).
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
			side: 'sell',
			pricePaymentPerAsset: '170',
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

		// 4) Drive UI: market BUY 10 USDC → wtCOIN.
		await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.wtCOIN.id}`);

		await page.click('[data-testid="open-trade"][data-side="buy"]');
		await clickModeTab(page, 'market');
		await page.click('[data-testid="side-toggle"][data-side="buy"]');
		await page.waitForSelector('[data-testid="market-form-loaded"]');

		// UI default flipped to 'amount' in 5b3c81d — toggle back to spend so we
		// can drive the dollar-anchored entry.
		const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
		if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
			await modeToggle.click();
		}
		await page.locator('[data-testid="spend-input"] input').first().fill('10');

		const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
		await expect(submit).toBeEnabled({ timeout: 60_000 });
		await submit.click();

		// 5) On-chain assertion: wtCOIN credited to taker, USDC debited.
		await expect
			.poll(
				async () =>
					await testClient.readContract({
						address: tokens.wtCOIN.address,
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
