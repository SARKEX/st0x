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
import { parseUnits } from 'viem';
import {
	createAnvilTestClient,
	fundErc20,
	fundErc20ViaImpersonation,
	fundOrderbookVault
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

// Rain Orderbook v4 on Base — pinned in src/lib/config/networks.ts trustedOrderbooks[0].
export const ORDERBOOK_ADDRESS = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' as `0x${string}`;

/**
 * (owner, vaultId) pairs for active wtNVDA orders at FORK_BLOCK=45_990_727
 * sourced from the orderbook subgraph (ob4-base/2026-02-05-c4ef). Their
 * on-chain output vaults are empty — pre-funding them via deposit2() is what
 * makes the SDK preflight see real fillable liquidity for marketBuy / marketSell
 * (the subgraph reports active orders with sentinel max-output values but the
 * actual on-chain vault depth is what binds preflight).
 *
 * If the subgraph reindexes or orders churn, regenerate by running:
 *   curl -X POST <ob4-base-url> -d '{"query":"{ orders(where:{active:true,outputs_:{token:\"<TOKEN>\"}}) { orderHash owner outputs(where:{token:\"<TOKEN>\"}){vaultId} } }"}'
 */
const WTNVDA_ASK_VAULTS: ReadonlyArray<{ owner: `0x${string}`; vaultId: `0x${string}` }> = [
	{
		owner: '0xbd41f40d91ee4e816ada1aa842e94aeb6b6385a6',
		vaultId: '0x0000000000000000000000000000000000000000000000000000000000000eab'
	},
	{
		owner: '0x502ce9fb1814cb03843967ec5e0d8f6aa3a3c2e1',
		vaultId: '0xed1b54d76daffa5a76f6eb45ca78a12fc66564089bd8a6b24d13fd8cbe7e9963'
	},
	{
		owner: '0xa9c16673f65ae808688cb18952afe3d9658c808f',
		vaultId: '0x0000000000000000000000000000000000000000000000000000000000000fab'
	},
	{
		owner: '0xbd41f40d91ee4e816ada1aa842e94aeb6b6385a6',
		vaultId: '0x0000000000000000000000000000000000000000000000000000000000000fab'
	},
	{
		owner: '0x18a62a3ac2ca9f775a4a12380eda03245270b73e',
		vaultId: '0x7dcba36aa1aab1349aa0c0c24c261f59d3885782e431b7019780e6f72c0e86bc'
	}
];

const WTNVDA_BID_VAULTS: ReadonlyArray<{ owner: `0x${string}`; vaultId: `0x${string}` }> = [
	{
		owner: '0xa9c16673f65ae808688cb18952afe3d9658c808f',
		vaultId: '0x000000000000000000000000000000000000000000000000000000000000fab2'
	},
	{
		owner: '0xbd41f40d91ee4e816ada1aa842e94aeb6b6385a6',
		vaultId: '0x0000000000000000000000000000000000000000000000000000000000000fab'
	}
];

/**
 * Pre-fund the output vaults of all known wtNVDA ask orders so a marketBuy
 * for wtNVDA can find on-chain fillable depth. Each vault gets 0.5 wtNVDA —
 * comfortably greater than any test order size (≤ 0.02 wtNVDA) and well within
 * the orderbook's ~6 wtNVDA custody balance which serves as the donor.
 */
export async function prefundWtNvdaAskOrders(client: ReturnType<typeof createAnvilTestClient>) {
	const perVault = parseUnits('0.5', TOKENS.tNVDA.decimals);
	for (const v of WTNVDA_ASK_VAULTS) {
		await fundOrderbookVault({
			client,
			orderbook: ORDERBOOK_ADDRESS,
			owner: v.owner,
			token: TOKENS.tNVDA.address,
			tokenDecimals: TOKENS.tNVDA.decimals,
			vaultId: v.vaultId,
			amount: perVault,
			funding: { method: 'donor', donor: TOKENS.tNVDA.donor }
		});
	}
}

/**
 * Pre-fund the output vaults of all known wtNVDA bid orders so a marketSell
 * of wtNVDA can find on-chain fillable USDC depth. Each vault gets 10,000
 * USDC via setStorageAt (Circle proxy slot 9 — works without impersonation).
 */
export async function prefundWtNvdaBidOrders(client: ReturnType<typeof createAnvilTestClient>) {
	const perVault = parseUnits('10000', TOKENS.USDC.decimals);
	for (const v of WTNVDA_BID_VAULTS) {
		await fundOrderbookVault({
			client,
			orderbook: ORDERBOOK_ADDRESS,
			owner: v.owner,
			token: TOKENS.USDC.address,
			tokenDecimals: TOKENS.USDC.decimals,
			vaultId: v.vaultId,
			amount: perVault,
			funding: { method: 'slot', slot: TOKENS.USDC.balanceSlot }
		});
	}
}

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
