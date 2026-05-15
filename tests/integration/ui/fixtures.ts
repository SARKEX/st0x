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
import {
	createAnvilTestClient,
	fundErc20,
	fundErc20ViaImpersonation
} from '../../helpers/anvilControl';
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

// Universal donor for ST0x tokenized securities: the Rain Orderbook contract
// custodies vault balances for every active order, so it reliably holds a
// non-trivial wallet `balanceOf` of any actively-traded asset/payment token at
// the pinned FORK_BLOCK. Verified at FORK_BLOCK=45_990_727: ~6 tNVDA, ~4.84 tAMZN.
// Same address used in src/lib/config/networks.ts trustedOrderbooks[0].
const ORDERBOOK_DONOR = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' as `0x${string}`;

// Token table — wrapped addresses sourced from src/lib/config/tokens.ts.
//
// Funding strategy per token:
//   - USDC: setStorageAt at balanceSlot 9 (Circle proxy pattern; verified by
//     marketBuy.spec.ts which exercises USDC end-to-end).
//   - tNVDA / tAMZN: impersonate-and-transfer from the Rain Orderbook. Their
//     wrapper proxies have non-trivial storage layouts (none of slots 0-200
//     hold a balance map; the impl is likely behind an EIP-1967 delegate with
//     diamond-style or custom slot derivation), so setStorageAt is unreliable
//     for them. See `fundErc20ViaImpersonation` in helpers/anvilControl.ts and
//     01-RUNBOOK §"ERC20 balance slot table" fallback note.
//
// `id` is the URL slug used by /trade/[id] — the page resolves via
// getTokenByAnyAddress() (DRIFT-01) so wrapped/unwrapped/legacy all work; we use
// the wrapped address for stability.
export const TOKENS = {
	USDC: {
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
		decimals: 6,
		balanceSlot: 9 as const
	},
	tNVDA: {
		address: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7' as `0x${string}`,
		decimals: 18,
		donor: ORDERBOOK_DONOR,
		id: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7'
	},
	tAMZN: {
		address: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53' as `0x${string}`,
		decimals: 18,
		donor: ORDERBOOK_DONOR,
		id: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53'
	}
} as const;

/**
 * Funds `holder` with `amount` of `token` via whichever strategy that token is
 * configured for. Specs should call this instead of fundErc20/fundErc20ViaImpersonation
 * directly so the strategy choice lives in one place.
 */
export async function fundToken(args: {
	client: ReturnType<typeof createAnvilTestClient>;
	token: typeof TOKENS[keyof typeof TOKENS];
	holder: `0x${string}`;
	amount: bigint;
}): Promise<void> {
	const tok = args.token;
	if ('donor' in tok) {
		await fundErc20ViaImpersonation({
			client: args.client,
			token: tok.address,
			donor: tok.donor,
			holder: args.holder,
			amount: args.amount
		});
	} else {
		await fundErc20({
			client: args.client,
			token: tok.address,
			holder: args.holder,
			amount: args.amount,
			balanceSlot: tok.balanceSlot
		});
	}
}

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
		// Redirect Base mainnet RPC traffic to anvil. TWO separate clients hit
		// these hosts:
		//   1. svelte-wagmi's defaultConfig builds its HTTP transport from
		//      chain.rpcUrls.default (https://mainnet.base.org for Base) for
		//      balance reads, contract reads, etc.
		//   2. The Rain SDK (@rainlanguage/orderbook) has its OWN RPC client
		//      configured via src/lib/clients/raindex.ts:SETTINGS_YAML. Its
		//      URL is `PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com'`
		//      — and this URL is read at runtime via `$env/dynamic/public`, NOT
		//      build time. In E2E we don't set PUBLIC_BASE_RPC_URL on the
		//      preview server, so the SDK falls back to publicnode.com, and
		//      its eth_call simulation for getTakeCalldata MUST be forwarded
		//      to anvil — otherwise the SDK simulates against LIVE Base
		//      mainnet, sees zero USDC balance / zero allowance for the test
		//      wallet (we only funded anvil via setStorageAt), and returns
		//      isReady=false with no calldata. Trade flow then collapses at
		//      "Order not ready for execution yet."
		//
		// NOTE on host pattern: `base-rpc.publicnode.com` is the literal URL
		// the SDK falls back to. `base.publicnode.com` (which the previous
		// regex matched) is not used anywhere — that was a typo introduced
		// in commit 7e93b5a. networks.ts:fallbackRpcUrls also lists meowrpc,
		// blastapi.io, and gateway.tenderly.co; we include them defensively
		// in case the SDK's primary fails and it falls over to a fallback.
		await page.route(/https:\/\/(mainnet\.base\.org|base-rpc\.publicnode\.com|.*\.g\.alchemy\.com|base\.llamarpc\.com|base\.meowrpc\.com|base-mainnet\.public\.blastapi\.io|gateway\.tenderly\.co|base\.drpc\.org|.*\.drpc\.live).*/, async (route) => {
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

export { expect, fundErc20, fundErc20ViaImpersonation };
