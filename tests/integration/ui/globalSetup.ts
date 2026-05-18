// Playwright globalSetup — runs once before any spec.
//
// Lifecycle:
// 1. Guard: BASE_RPC_URL must be set (mirrors tests/helpers/anvil.ts:40-42).
// 2. Build the production bundle once with E2E=1 (so hooks.server.ts CSP gate is
//    active in the bundled output).
// 3. Resolve FORK_BLOCK to a recent NYSE-market-hours block (see "FORK_BLOCK
//    selection" below).
// 4. Spawn anvil at that block.
// 5. Start vite preview on :4173 with E2E=1 so hooks.server.ts relaxes CSP.
// 6. Smoke-probe `/api/auth/csrf` to detect Pitfall 7 (Vercel adapter doesn't
//    serve API routes through `vite preview`).
//
// FORK_BLOCK selection
// --------------------
// The Rain SDK, Goldsky subgraph, ST0x REST API, and Pyth Hermes are all LIVE
// data sources — they reflect "now", not the fork. If the fork is pinned days
// in the past, every UI-driven query sees one reality and the on-chain SDK
// simulation sees another, and the test has to manually stub each divergence.
// To keep the fixture honest, we instead pin the fork as close to "now" as the
// archive RPC allows: latest block minus a small safety margin, REQUIRING that
// the chosen block falls inside NYSE market hours so the orders' Rainlang
// market-hours gate and on-chain Pyth freshness both hold.
//
// Override path: set FORK_BLOCK env var to a specific number to bypass
// dynamic selection (useful for reproducing a specific past failure).
import { execSync } from 'node:child_process';
import { startAnvilFork } from '../../helpers/anvil';
import { startPreviewServer } from '../../helpers/previewServer';

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

async function resolveForkBlock(rpcUrl: string): Promise<number> {
	if (process.env.FORK_BLOCK) {
		const n = Number(process.env.FORK_BLOCK);
		console.log(`[e2e:globalSetup] FORK_BLOCK pinned via env: ${n}`);
		return n;
	}
	const latestHex = await rpcCall<string>(rpcUrl, 'eth_blockNumber', []);
	const latest = parseInt(latestHex, 16);
	const candidate = latest - SAFETY_MARGIN_BLOCKS;
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
	console.log(
		`[e2e:globalSetup] FORK_BLOCK resolved dynamically: ${candidate} (latest=${latest}, ts=${new Date(
			ts * 1000
		).toISOString()})`
	);
	return candidate;
}

export default async function globalSetup(): Promise<void> {
	if (!process.env.BASE_RPC_URL) {
		throw new Error('BASE_RPC_URL required for E2E suite — set in CI secrets / .env');
	}

	// auth.ts (and other server modules) throw at load-time when their
	// production secrets are unset && !dev. Inject a synthetic SESSION_SECRET
	// so the build + preview server boot cleanly — the E2E suite never
	// authenticates real users.
	process.env.SESSION_SECRET ||= 'e2e-build-only-dummy-session-secret';

	// 1. Build production bundle ONCE with E2E=1 baked into hooks.server.ts CSP gate.
	execSync('npm run build', { stdio: 'inherit', env: { ...process.env, E2E: '1' } });

	// 2. Resolve fork block dynamically.
	const forkBlock = await resolveForkBlock(process.env.BASE_RPC_URL);

	// 3. Spawn anvil fork at the resolved block.
	await startAnvilFork(forkBlock);

	// 4. Start vite preview with E2E=1 so hooks.server.ts relaxes connect-src.
	await startPreviewServer({ port: 4173, env: { E2E: '1' } });

	// 5. Smoke probe — fail fast if Pitfall 7 (vite preview vs adapter-vercel) bites.
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
}
