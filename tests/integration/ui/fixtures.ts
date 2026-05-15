// Playwright test fixtures for the UI E2E suite. Wires together:
// - testClient: viem TestClient bound to anvil (snapshot/revert lifecycle per test)
// - fundedAccount / unfundedAccount: anvil pre-funded EOAs (D-04 + D-08)
// - tokens: USDC + wtNVDA + wtAMZN with addresses from src/lib/config/tokens.ts and
//   balance slots from .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md
// - page: extended with EIP-1193 stub injected via addInitScript before any goto()
//
// SNAPSHOT/REVERT ORDER (per 01-RUNBOOK §"Snapshot/revert state-leakage trap"):
// take snapshot FIRST, then any test-body funding, then revert in afterEach.
import { test as base, expect } from '@playwright/test';
import { createAnvilTestClient, fundErc20 } from '../../helpers/anvilControl';
import { eip1193StubSource } from '../../helpers/eip1193Stub';

// Anvil default accounts — these are PUBLIC test keys baked into the anvil
// pre-funded set. No real-money risk; documented as such in the threat register
// (T-1-01-02). DO NOT swap these for real keys under any circumstance.
export const FUNDED_ACCOUNT = {
	address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`, // anvil[0]
	privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`
};

// D-08 insufficient-balance fixture: anvil[1] has ETH (gas) but no ERC20 of any
// asset/payment token under test.
export const UNFUNDED_ACCOUNT = {
	address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`, // anvil[1]
	privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`
};

// Token table — wrapped addresses sourced from src/lib/config/tokens.ts; balance
// slots from 01-RUNBOOK.md §"ERC20 balance slot table". Slots marked ASSUMED
// there will be verified by the smoke spec on first CI run.
//
// `id` is the URL slug used by /trade/[id] — the page resolves via
// getTokenByAnyAddress() (DRIFT-01) so wrapped/unwrapped/legacy all work; we use
// the wrapped address for stability.
export const TOKENS = {
	USDC: {
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
		decimals: 6,
		balanceSlot: 9 // Circle proxy; verify per 01-RUNBOOK
	},
	tNVDA: {
		address: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7' as `0x${string}`,
		decimals: 18,
		balanceSlot: 0, // OZ ERC20 default
		id: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7'
	},
	tAMZN: {
		address: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53' as `0x${string}`,
		decimals: 18,
		balanceSlot: 0,
		id: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53'
	}
} as const;

interface UiFixtures {
	testClient: ReturnType<typeof createAnvilTestClient>;
	fundedAccount: typeof FUNDED_ACCOUNT;
	unfundedAccount: typeof UNFUNDED_ACCOUNT;
	tokens: typeof TOKENS;
}

export const test = base.extend<UiFixtures>({
	testClient: async ({}, use) => {
		const client = createAnvilTestClient();
		// Snapshot FIRST (Pitfall 2 / 01-RUNBOOK §"Snapshot/revert"), then any test
		// body funding writes, then revert in afterEach.
		const snapshotId = await client.snapshot();
		await use(client);
		await client.revert({ id: snapshotId });
	},
	fundedAccount: async ({}, use) => {
		await use(FUNDED_ACCOUNT);
	},
	unfundedAccount: async ({}, use) => {
		await use(UNFUNDED_ACCOUNT);
	},
	tokens: async ({}, use) => {
		await use(TOKENS);
	},
	page: async ({ page }, use) => {
		await page.addInitScript(eip1193StubSource({ address: FUNDED_ACCOUNT.address }));
		// Pre-dismiss one-time announcement modals — they auto-open on fresh
		// browser sessions (no localStorage entry) and intercept pointer events
		// on the page under test. The modal logic lives in
		// src/lib/stores/announcementStore.ts; the localStorage key is the
		// production-facing one (do NOT change without updating both sides).
		await page.addInitScript(() => {
			window.localStorage.setItem('st0x_token_swap_announcement_seen', 'true');
			// Seed wagmi reconnect state so autoConnect picks up the injected
			// (EIP-1193 stub) connector on first page load. Without this,
			// `autoConnect: true` in src/routes/+layout.svelte:52 only reconnects to
			// a *previously-used* connector — fresh browser session has none, so
			// $connected stays false → $isAuthenticated false → openTradePanel()
			// early-returns before the trade panel renders.
			//
			// TWO keys are required (verified against node_modules/@wagmi/core/dist/esm/connectors/injected.js):
			// 1. wagmi.recentConnectorId — biases reconnect() toward the injected
			//    connector (vs e.g. walletConnect).
			// 2. wagmi.injected.connected — REQUIRED gate. The injected connector's
			//    isAuthorized() returns false for targetless setups without this
			//    flag, so reconnect() silently skips it and no autoConnect fires.
			// Wagmi storage values are JSON-serialized; raw strings need surrounding
			// quotes, booleans are 'true'/'false' (no quotes around the word).
			window.localStorage.setItem('wagmi.recentConnectorId', '"injected"');
			window.localStorage.setItem('wagmi.injected.connected', 'true');
		});
		// Stub the wallet-registration check so the trade panel opens without
		// hitting the live access-control API. Production code path:
		// src/lib/stores/accessStore.ts → checkWalletAccess() → GET
		// /api/access/check?address=… The smoke spec exercises trade UI, not
		// registration; without this mock, openTradePanel() in trade/[id]/+page.svelte
		// returns early at the !$walletRegistered guard and the panel never opens.
		await page.route('**/api/access/check**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ registered: true })
			});
		});
		// Redirect wagmi's chain-read HTTP traffic to anvil. svelte-wagmi's
		// defaultConfig builds its HTTP transport from chain.rpcUrls.default
		// (https://mainnet.base.org for Base), separate from the EIP-1193 stub
		// which only handles signing. Without this redirect, balance reads
		// (readContracts → erc20Abi.balanceOf used by LowFundsBanner.svelte and
		// MarketOrder spendingTokenBalance) hit live Base mainnet and return 0
		// for the test wallet, so the submit button stays disabled with
		// insufficient-balance error even though we funded USDC on anvil via
		// setStorageAt.
		await page.route(/https:\/\/(mainnet\.base\.org|base\.publicnode\.com|.*\.g\.alchemy\.com|base\.llamarpc\.com|base\.drpc\.org|.*\.drpc\.live).*/, async (route) => {
			const req = route.request();
			const resp = await fetch('http://127.0.0.1:8545', {
				method: req.method(),
				headers: { 'content-type': 'application/json' },
				body: req.postData() ?? undefined
			});
			const body = await resp.text();
			await route.fulfill({ status: resp.status, contentType: 'application/json', body });
		});
		await use(page);
	}
});

export { expect, fundErc20 };
