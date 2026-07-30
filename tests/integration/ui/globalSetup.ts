// Playwright globalSetup — runs once after webServer is ready, before any spec.
//
// Lifecycle:
// 1. Guard: BASE_RPC_URL must be set (mirrors tests/helpers/anvil.ts:40-42).
// 2. Resolve FORK_BLOCK to a recent NYSE-market-hours block (see "FORK_BLOCK
//    selection" below).
// 3. Spawn anvil at that block.
// 4. Smoke-probe `/api/auth/csrf` (preview was started by Playwright's webServer
//    block — see playwright.config.ts). Probe detects Pitfall 7 (Vercel adapter
//    doesn't serve API routes through vite preview) fast.
//
// The build + preview lifecycle moved to playwright.config.ts:webServer so
// Playwright can auto-restart preview if it crashes mid-suite (the previous
// manual-spawn left subsequent tests with ERR_CONNECTION_REFUSED).
//
// FORK_BLOCK selection
// --------------------
// The Rain SDK, Goldsky subgraph, and ST0x REST API are all LIVE data sources —
// they reflect "now", not the fork. If the fork is pinned days
// in the past, every UI-driven query sees one reality and the on-chain SDK
// simulation sees another, and the test has to manually stub each divergence.
// To keep the fixture honest, we instead pin the fork as close to "now" as the
// archive RPC allows: latest block minus a small safety margin, REQUIRING that
// the chosen block falls inside NYSE market hours so the orders' Rainlang
// market-hours gate and on-chain oracle freshness both hold.
//
// Override path: set FORK_BLOCK env var to a specific number to bypass
// dynamic selection (useful for reproducing a specific past failure).
import { startAnvilFork } from '../../helpers/anvil';

const SAFETY_MARGIN_BLOCKS = 60; // ~2min at Base's 2s/block — archive often lags head a bit.

/**
 * NYSE market hours are 9:30 AM - 4:00 PM ET, Monday-Friday.
 * EDT (Mar-Nov): ET = UTC-4 → 13:30 - 20:00 UTC.
 * EST (Nov-Mar): ET = UTC-5 → 14:30 - 21:00 UTC.
 * We use an inclusive window 13:30-21:00 UTC and let the order's Rainlang
 * gate be the source of truth — picking a slightly-too-early-or-late block
 * will surface as the same revert the test would catch in production.
 */
function isNyseMarketHoursUtc(unixSec: number): boolean {
	const d = new Date(unixSec * 1000);
	const day = d.getUTCDay(); // 0=Sun, 6=Sat
	if (day === 0 || day === 6) return false;
	const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
	const open = 13 * 60 + 30; // 13:30 UTC (9:30 ET EDT)
	const close = 21 * 60; // 21:00 UTC (covers EST close 16:00 ET = 21:00 UTC)
	return mins >= open && mins <= close;
}

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
	const json = (await res.json()) as { result?: T; error?: { message: string } };
	if (json.error) throw new Error(`RPC error (${method}): ${json.error.message}`);
	return json.result as T;
}

async function resolveForkBlock(rpcUrl: string): Promise<{ block: number; timestamp: number }> {
	let candidate: number;
	if (process.env.FORK_BLOCK) {
		candidate = Number(process.env.FORK_BLOCK);
		console.log(`[e2e:globalSetup] FORK_BLOCK pinned via env: ${candidate}`);
	} else {
		const latestHex = await rpcCall<string>(rpcUrl, 'eth_blockNumber', []);
		const latest = parseInt(latestHex, 16);
		candidate = latest - SAFETY_MARGIN_BLOCKS;
	}
	const block = await rpcCall<{ timestamp: string } | null>(rpcUrl, 'eth_getBlockByNumber', [
		'0x' + candidate.toString(16),
		false
	]);
	if (!block) {
		throw new Error(`BASE_RPC_URL archive missing block ${candidate}`);
	}
	const ts = parseInt(block.timestamp, 16);
	if (!isNyseMarketHoursUtc(ts)) {
		const when = new Date(ts * 1000).toISOString();
		throw new Error(
			`Block ${candidate} (timestamp ${when}, UTC) is outside NYSE market hours ` +
				`(Mon-Fri 13:30-21:00 UTC). The E2E suite requires the fork-block to be ` +
				`during NYSE hours so the orders' market-hours Rainlang gate doesn't revert ` +
				`every quote(). Re-run during NYSE hours, or pin FORK_BLOCK env to a known ` +
				`market-hours block.`
		);
	}
	if (!process.env.FORK_BLOCK) {
		console.log(
			`[e2e:globalSetup] FORK_BLOCK resolved dynamically: ${candidate} (ts=${new Date(
				ts * 1000
			).toISOString()})`
		);
	}
	return { block: candidate, timestamp: ts };
}

export default async function globalSetup(): Promise<void> {
	if (!process.env.BASE_RPC_URL) {
		throw new Error('BASE_RPC_URL required for E2E suite — set in CI secrets / .env');
	}

	// 1. Resolve fork block dynamically.
	const { block: forkBlock, timestamp: forkBlockTs } = await resolveForkBlock(
		process.env.BASE_RPC_URL
	);

	// 2. Spawn anvil fork at the resolved block.
	await startAnvilFork(forkBlock);

	// 3. Smoke probe — webServer block already brought preview up. Fail fast
	//    if Pitfall 7 (vite preview vs adapter-vercel) bites: adapter-vercel
	//    compiles API routes to serverless functions, not into the static
	//    preview. If this probe fires, switch the E2E build to
	//    @sveltejs/adapter-node per
	//    .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md
	//    §"Vite-preview API-route fidelity".
	const apiProbe = await fetch('http://127.0.0.1:4173/api/auth/csrf').catch(() => null);
	if (!apiProbe || apiProbe.status >= 500) {
		throw new Error(
			'vite preview not serving /api/* routes — Pitfall 7 (adapter-vercel ' +
				'compiles routes to serverless functions, not into the static preview). ' +
				'Switch the E2E build to @sveltejs/adapter-node per ' +
				'.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md ' +
				'§"Vite-preview API-route fidelity".'
		);
	}

	process.env.PREVIEW_URL = 'http://127.0.0.1:4173';
	process.env.ANVIL_URL = 'http://127.0.0.1:8545';
	process.env.FORK_BLOCK = String(forkBlock);
	// Block timestamp (UNIX seconds) — consumed by the per-page Date.now() init
	// script in fixtures.ts so the browser's wall-clock-driven gates
	// (marketHours.isOutsideMarketHours and on-chain oracle freshness) agree with the fork
	// instead of with the host's real-world clock (which may be a weekend).
	process.env.FORK_BLOCK_TS = String(forkBlockTs);
}
