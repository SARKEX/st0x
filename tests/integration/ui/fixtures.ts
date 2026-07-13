// Playwright test fixtures for the UI E2E suite. Wires together:
// - testClient: viem TestClient bound to anvil (snapshot/revert lifecycle per test)
// - fundedAccount / unfundedAccount: anvil pre-funded EOAs
// - tokens: USDC + wtCOIN + wtNVDA + wtAMZN
// - page: extended with EIP-1193 stub injected via addInitScript before any goto()
//
// Design note — NO stubs for Hermes, ST0x REST orders API, or Goldsky subgraph.
// globalSetup picks a recent NYSE-market-hours block so LIVE data sources
// (Pyth Hermes price, ST0x REST quotes, Goldsky subgraph order list) are
// effectively at the same chain head the fork is at, and the SDK's on-chain
// preflight against the fork sees the same orders the UI displays. The only
// production interception is the RPC redirect (so the SDK's on-chain calls
// hit anvil) and the wallet-registration check stub (so the trade panel opens
// without an access-control roundtrip).
import { test as base, expect } from '@playwright/test';
import {
	createAnvilTestClient,
	fundErc20,
	fundErc20ViaImpersonation
} from '../../helpers/anvilControl';
import { eip1193StubSource } from '../../helpers/eip1193Stub';
import {
	buildSyntheticOrdersResponse,
	clearMakerOrders,
	getMakerOrders,
	handleGoldskyRequest
} from './syntheticOrdersStub';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Goldsky GraphQL response cache. Module-scoped so all tests in a workers=1
// run share it. See the page.route for `api.goldsky.com` below for rationale.
//
// Disk persistence: Goldsky free-tier rate-limits hard after even a handful
// of cold runs. The first run after a quota reset warms the cache; every
// subsequent run replays from disk and never touches upstream, so the suite
// is immune to mid-day rate-limit blowups. Cache files are committed to the
// repo so CI has a warm start too. Bust the cache by deleting the directory.
const GOLDSKY_CACHE_DIR = join(
	process.cwd(),
	'tests/integration/ui/__fixtures__/goldsky-cache'
);
const goldskyCache = new Map<string, { status: number; body: string }>();

function goldskyCacheKeyHash(key: string): string {
	return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function loadGoldskyCacheFromDisk(key: string): { status: number; body: string } | null {
	const path = join(GOLDSKY_CACHE_DIR, `${goldskyCacheKeyHash(key)}.json`);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as { status: number; body: string };
	} catch {
		return null;
	}
}

function saveGoldskyCacheToDisk(key: string, value: { status: number; body: string }): void {
	if (!existsSync(GOLDSKY_CACHE_DIR)) {
		mkdirSync(GOLDSKY_CACHE_DIR, { recursive: true });
	}
	writeFileSync(join(GOLDSKY_CACHE_DIR, `${goldskyCacheKeyHash(key)}.json`), JSON.stringify(value));
}

// Anvil default accounts — these are PUBLIC test keys baked into the anvil
// pre-funded set. No real-money risk; documented as such in the threat register
// (T-1-01-02). DO NOT swap these for real keys under any circumstance.
export const FUNDED_ACCOUNT = {
	address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`, // anvil[0]
	privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`
};

// Insufficient-balance fixture: anvil[1] has ETH (gas) but no ERC20 of any
// asset/payment token under test.
export const UNFUNDED_ACCOUNT = {
	address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`, // anvil[1]
	privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`
};

// Maker fixture for the Path-B maker→taker model. anvil[2]. MUST be different
// from FUNDED_ACCOUNT (the taker) — the Rain orderbook reverts self-takes.
// All three are anvil-baked test keys; safe to commit.
export const MAKER_ACCOUNT = {
	address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as `0x${string}`, // anvil[2]
	privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as `0x${string}`
};

// Universal donor for ST0x tokenized securities: the Rain Orderbook contract
// custodies vault balances for every active order, so it reliably holds a
// non-trivial wallet `balanceOf` of any actively-traded asset/payment token at
// recent fork blocks. Same address used in
// src/lib/config/networks.ts trustedOrderbooks[0].
export const ORDERBOOK_ADDRESS = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' as `0x${string}`;
const ORDERBOOK_DONOR = ORDERBOOK_ADDRESS;

// Token table — wrapped addresses sourced from src/lib/config/tokens.ts.
//
// Primary test token is wtCOIN (Coinbase Global, NASDAQ:COIN, decimals 18,
// Pyth price feed). Active orderbook + no st0x off-chain oracle dependency
// (the st0x oracle is only used for the SPYM ETF feed; wtCOIN reads the
// regular on-chain Pyth Network feed which is reliably fresh during NYSE
// hours).
//
// Funding strategy per token:
//   - USDC: setStorageAt at balanceSlot 9 (Circle proxy pattern).
//   - ST0x asset tokens (wtCOIN, tNVDA, tAMZN): impersonate-and-transfer from
//     the Rain Orderbook contract. Their wrapper proxies have non-trivial
//     storage layouts (EIP-1967 delegate + custom slots), so setStorageAt is
//     unreliable.
//
// `id` is the URL slug used by /trade/[id] — the page resolves via
// getTokenByAnyAddress() so wrapped/unwrapped/legacy all work; we use
// the wrapped address for stability.
export const TOKENS = {
	USDC: {
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
		decimals: 6,
		balanceSlot: 9 as const
	},
	wtCOIN: {
		address: '0x5cDa0E1CA4ce2af96315f7F8963C85399c172204' as `0x${string}`,
		decimals: 18,
		donor: ORDERBOOK_DONOR,
		id: '0x5cDa0E1CA4ce2af96315f7F8963C85399c172204'
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
	},
	// wtSPYM: S&P500 ETF, uses the off-chain st0x oracle (not Pyth). The
	// off-chain oracle is unreachable from the fork, so every wtSPYM order's
	// quote() reverts during cache build — used by marketFailures to produce
	// an empty orderbook for the "no_liquidity" classifier path.
	wtSPYM: {
		address: '0x31C2C14134e6E3B7ef9478297F199331133Fc2d8' as `0x${string}`,
		decimals: 18,
		donor: ORDERBOOK_DONOR,
		id: '0x31C2C14134e6E3B7ef9478297F199331133Fc2d8'
	},
	// wtSGOV: tokenized iShares 0-3M Treasury ETF — the Save & Earn product.
	// Reads a regular on-chain Pyth feed (priceFeedId in src/lib/config/tokens.ts),
	// NOT the off-chain st0x oracle, so it behaves like wtCOIN under the fork.
	// Funded by impersonating the Rain Orderbook donor (same strategy as the
	// other ST0x wrappers); if the donor holds no wtSGOV at the chosen fork
	// block, swap `donor` for a known wtSGOV holder.
	wtSGOV: {
		address: '0x78c31580c97101694C70022c83D570150c11e935' as `0x${string}`,
		decimals: 18,
		donor: ORDERBOOK_DONOR,
		id: '0x78c31580c97101694C70022c83D570150c11e935'
	}
} as const;

/**
 * Funds `holder` with `amount` of `token` via whichever strategy that token is
 * configured for. Specs should call this instead of fundErc20/fundErc20ViaImpersonation
 * directly so the strategy choice lives in one place.
 */
export async function fundToken(args: {
	client: ReturnType<typeof createAnvilTestClient>;
	token: (typeof TOKENS)[keyof typeof TOKENS];
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
		// Path-B: clear synthetic maker-orders registry. Snapshot revert undoes the
		// on-chain side; this clears the in-memory side. Pair-symmetric with the
		// fixture deploying maker orders inside each test body.
		clearMakerOrders();
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
		// Pin the page's wall clock to the fork-block timestamp + 60s so wall-clock-
		// driven gates inside the production code agree with the fork state:
		//   - marketHours.isOutsideMarketHours() (reads `new Date()` — Sunday-runs
		//     would otherwise gate the form to `market_closed` even when the
		//     fork-block is a NYSE Friday afternoon).
		//   - Pyth freshness windows (offchain publishTime compared to Date.now()).
		// Tests that DELIBERATELY drive Date.now elsewhere (marketFailures'
		// stale_oracle / market_closed forcing paths) can re-patch via their own
		// page.addInitScript AFTER fixture setup — last-write-wins for initScripts.
		if (process.env.FORK_BLOCK_TS) {
			const pinMs = (Number(process.env.FORK_BLOCK_TS) + 60) * 1000;
			// Patches Date.now() AND the zero-arg new Date() constructor; calls
			// with explicit args (new Date(timestamp), new Date(2026, 0, 1), etc.)
			// fall through untouched. Advances forward from PIN at real elapsed
			// rate so monotonic-delta polling keeps working.
			await page.addInitScript((pin: number) => {
				const RealDate = Date;
				const realNow = RealDate.now.bind(RealDate);
				const startedAt = realNow();
				RealDate.now = () => pin + (realNow() - startedAt);
				const Patched = function (...args: unknown[]) {
					if (args.length === 0) return new RealDate(RealDate.now());
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return new (RealDate as any)(...args);
				};
				Patched.prototype = RealDate.prototype;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(Patched as any).UTC = RealDate.UTC;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(Patched as any).parse = RealDate.parse;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(Patched as any).now = RealDate.now;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(globalThis as any).Date = Patched;
			}, pinMs);
		}
		// Pre-dismiss one-time announcement modals — they auto-open on fresh
		// browser sessions (no localStorage entry) and intercept pointer events
		// on the page under test. The modal logic lives in
		// src/lib/stores/announcementStore.ts; the localStorage key is the
		// production-facing one (do NOT change without updating both sides).
		await page.addInitScript(() => {
			window.localStorage.setItem('st0x_token_swap_announcement_seen', 'true');
			// Pre-dismiss the vault tutorial. The trade page (src/routes/(main)/trade/[id]/+page.svelte:336-348)
			// auto-fires a vault tutorial on the FIRST switch to `panelStrategy = 'limit'`
			// or `'dca'`, and that handler CLOSES the trade panel (line 345) before
			// LimitOrder.svelte's lazy chunk gets to mount. Result: data-testid="limit-form-loaded"
			// never appears and limitDeploy.spec.ts times out at 180s. Storage key
			// comes from src/lib/utils/tutorialStorage.ts:VAULT_TUTORIAL_STORAGE_KEY.
			window.localStorage.setItem('st0x_hide_vault_tutorial', 'true');
			// Pre-dismiss the general onboarding tutorial too — same pattern, less
			// load-bearing for the current suite but cheap insurance.
			window.localStorage.setItem('st0x_hide_tutorial', 'true');
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
			window.localStorage.setItem('wagmi.recentConnectorId', '"injected"');
			window.localStorage.setItem('wagmi.injected.connected', 'true');
		});
		// Stub the wallet-registration check so the trade panel opens without
		// hitting the live access-control API. Production code path:
		// src/lib/stores/accessStore.ts → checkWalletAccess() → GET
		// /api/access/check?address=… Without this, openTradePanel() returns
		// early at the !$walletRegistered guard and the panel never opens.
		await page.route('**/api/access/check**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ registered: true })
			});
		});
		// Cache Goldsky GraphQL responses across tests in this worker. The Raindex
		// SDK in the browser hits the Goldsky subgraph during the hydration step
		// of marketOrderExecution.ts (one getOrders call per walk-fill orderHash).
		// Free-tier Goldsky rate-limits hard under that burst — and once
		// rate-limited the response comes back without CORS headers, which the
		// browser surfaces as a CORS error. The SDK then can't hydrate and the
		// preflight collapses with `preflight_chain_unreachable`.
		// Cache key = method + URL + body. With workers=1 the cache persists for
		// the full test-run lifetime; on repeated runs the second test onward
		// makes ZERO outbound Goldsky calls for orderHashes already seen.
		await page.route(/https:\/\/api\.goldsky\.com\/.*/, async (route) => {
			const req = route.request();
			const body = req.postData() ?? '';
			// If any maker orders are registered for this test, serve synthetic
			// SgOrder responses BEFORE falling through to the cached-LIVE stub.
			// This is how the SDK's in-WASM Goldsky calls see anvil-only orders.
			const synthetic = handleGoldskyRequest(body);
			if (synthetic !== null) {
				console.log(`[goldsky-synth] served (makers=${getMakerOrders().length})`);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: synthetic,
					headers: { 'access-control-allow-origin': '*' }
				});
				return;
			}
			const key = `${req.method()}|${req.url()}|${body}`;
			let cached = goldskyCache.get(key);
			let source: 'mem' | 'disk' | null = cached ? 'mem' : null;
			if (!cached) {
				const disk = loadGoldskyCacheFromDisk(key);
				if (disk) {
					cached = disk;
					goldskyCache.set(key, disk);
					source = 'disk';
				}
			}
			console.log(
				`[goldsky-cache] ${cached ? `HIT(${source})` : 'MISS'} ${req.method()} body-len=${body.length}`
			);
			if (cached) {
				await route.fulfill({
					status: cached.status,
					contentType: 'application/json',
					body: cached.body
				});
				return;
			}
			// Retry with backoff on 429. Goldsky free tier rate-limits in narrow
			// windows but a short wait typically lets the next attempt through.
			let status = 0;
			let respBody = '';
			for (let attempt = 0; attempt < 5; attempt++) {
				const upstream = await route.fetch();
				status = upstream.status();
				respBody = await upstream.text();
				if (status !== 429) break;
				const wait = 5000 * (attempt + 1);
				console.log(`[goldsky-cache] 429 attempt ${attempt + 1}, waiting ${wait}ms`);
				await new Promise((r) => setTimeout(r, wait));
			}
			console.log(
				`[goldsky-cache] upstream status=${status} body-len=${respBody.length}` +
					(status !== 200 ? ` body=${respBody.slice(0, 200)}` : '')
			);
			if (status === 200) {
				const entry = { status, body: respBody };
				goldskyCache.set(key, entry);
				saveGoldskyCacheToDisk(key, entry);
			}
			await route.fulfill({
				status,
				contentType: 'application/json',
				body: respBody,
				headers: { 'access-control-allow-origin': '*' }
			});
		});
		await page.route('**/api/st0x/v1/orders/token/**', async (route) => {
			// When maker orders are registered, serve a fully-synthetic
			// response built from the maker registry. Specs that don't
			// register any maker (e.g. limitDeploy, which only deploys and
			// never takes) get an empty list — the UI handles a sparse
			// orderbook gracefully and there's no LIVE/fork divergence to
			// bridge here.
			if (getMakerOrders().length > 0) {
				const url = new URL(route.request().url());
				const segments = url.pathname.split('/');
				const tokenAddr = segments[segments.length - 1];
				const sideParam = url.searchParams.get('side') as 'input' | 'output' | null;
				const resp = buildSyntheticOrdersResponse(tokenAddr, sideParam ?? undefined);
				console.log(
					`[orders-synth] token=${tokenAddr} side=${sideParam ?? 'both'} orders=${resp.orders.length}`
				);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(resp)
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					orders: [],
					pagination: { page: 1, pageSize: 0, totalOrders: 0, totalPages: 0, hasMore: false }
				})
			});
		});
		// Redirect Base mainnet RPC traffic to anvil. TWO separate clients hit
		// these hosts:
		//   1. svelte-wagmi's defaultConfig builds its HTTP transport from
		//      chain.rpcUrls.default (https://mainnet.base.org for Base) for
		//      balance reads, contract reads, etc.
		//   2. The Rain SDK (@rainlanguage/orderbook) has its OWN RPC client
		//      configured via src/lib/clients/raindex.ts:SETTINGS_YAML. Its
		//      URL is `PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com'`.
		//      In E2E we don't set PUBLIC_BASE_RPC_URL on the preview server,
		//      so the SDK falls back to publicnode.com and its eth_call
		//      simulation for getTakeOrdersCalldata MUST be forwarded to anvil
		//      — otherwise the SDK simulates against LIVE Base mainnet, sees
		//      zero USDC balance / zero allowance for the test wallet (we
		//      only funded anvil), and returns isReady=false with no calldata.
		await page.route(
			/https:\/\/(mainnet\.base\.org|base-rpc\.publicnode\.com|.*\.g\.alchemy\.com|base\.llamarpc\.com|base\.meowrpc\.com|base-mainnet\.public\.blastapi\.io|gateway\.tenderly\.co|base\.drpc\.org|.*\.drpc\.live).*/,
			async (route) => {
				const req = route.request();
				const resp = await fetch('http://127.0.0.1:8545', {
					method: req.method(),
					headers: { 'content-type': 'application/json' },
					body: req.postData() ?? undefined
				});
				const body = await resp.text();
				await route.fulfill({ status: resp.status, contentType: 'application/json', body });
			}
		);
		await use(page);
		// Drain in-flight route handlers BEFORE Playwright tears down the
		// page/context. The trade page polls /api/st0x/v1/orders/token/* every
		// 15s, and a `route.fetch` mid-flight at teardown throws "Target page
		// closed" — Playwright then reports that as a test failure even though
		// the assertions all passed. `ignoreErrors` swallows still-pending
		// callbacks gracefully.
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	}
});

export { expect, fundErc20 };

/**
 * Click a `data-testid="mode-tab"` button programmatically.
 *
 * The mode-tab buttons are `class="sr-only"` (1×1px clipped) with `tabindex="-1"`
 * — visually hidden test hooks that drive `panelStrategy` via on:click. With
 * `page.click({ force: true })` Playwright dispatches at the element's
 * coordinates (a 1×1px corner), where another element captures the hit and the
 * handler never fires. `el.click()` via page.evaluate bypasses coordinate-based
 * event delivery — DOM event fires directly on the bound handler.
 *
 * Use this anywhere a test needs to switch panel mode (market / limit / dca).
 */
export async function clickModeTab(
	page: import('@playwright/test').Page,
	mode: 'market' | 'limit' | 'dca'
): Promise<void> {
	await page.waitForSelector(`[data-testid="mode-tab"][data-mode="${mode}"]`, { state: 'attached' });
	await page.evaluate((m) => {
		const el = document.querySelector(
			`[data-testid="mode-tab"][data-mode="${m}"]`
		) as HTMLButtonElement | null;
		if (!el) throw new Error(`mode-tab[data-mode="${m}"] not found`);
		el.click();
	}, mode);
}

/**
 * Open the trade panel with a retry-until-mounted guard.
 *
 * `openTradePanel()` on the trade page returns early when `walletRegistered`
 * is still `null` (the auto-check fired by walletAddress.subscribe hasn't
 * resolved yet). The first click after `page.goto()` races with the
 * background `/api/access/check` fetch and intermittently drops on the floor
 * — the button gets focus, but the panel never opens, and the next
 * `clickModeTab()` call times out waiting for `mode-tab`.
 *
 * This helper retries the click until either:
 *   1. The mode-tab buttons (gated on showTradePanel) are in the DOM, or
 *   2. The 30s budget is exhausted.
 *
 * Use this instead of `page.click('[data-testid="open-trade"]…')` for any
 * spec that immediately follows the open-trade click with a panel-internal
 * assertion.
 */
export async function openTradePanel(
	page: import('@playwright/test').Page,
	side: 'buy' | 'sell'
): Promise<void> {
	const openSelector = `[data-testid="open-trade"][data-side="${side}"]`;
	const panelReadySelector = `[data-testid="mode-tab"][data-mode="market"]`;
	await page.waitForSelector(openSelector, { state: 'visible', timeout: 60_000 });
	// Wait for the "My Dashboard ...XXXX" button to render — Header.svelte only
	// renders it once ALL THREE of $isAuthenticated && $walletAddress &&
	// $walletRegistered are truthy. That gates the entire openTradePanel()
	// auto-return chain: clicking before this button exists means
	// openTradePanel calls promptWalletConnection/promptLogin and never sets
	// showTradePanel = true. Wait deterministically rather than racing the
	// click against the wagmi-init + access-check fetch.
	await page
		.getByRole('button', { name: /My Dashboard\s+\.\.\./i })
		.first()
		.waitFor({ state: 'visible', timeout: 60_000 })
		.catch(() => {
			// Fallback — older / Dynamic-auth header may render differently. The
			// retry-click below covers the race in any case.
		});
	await expect(async () => {
		await page.click(openSelector);
		await page.waitForSelector(panelReadySelector, { state: 'attached', timeout: 2_000 });
	}).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
}
