import { spawn, type ChildProcess } from 'node:child_process';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

let anvilProc: ChildProcess | null = null;

// Default 90s — public archive RPCs (dRPC, Alchemy free-tier) take significantly
// longer than 30s for a cold fork at a 2-month-old block. Local development
// against a paid Alchemy/QuickNode endpoint typically completes in <5s, so the
// extra ceiling only adds latency on the (rare) failure path.
async function waitForRpc(url: string, timeoutMs = 90_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_blockNumber',
					params: []
				})
			});
			if (res.ok) {
				const json = (await res.json()) as { result?: string };
				if (json.result) return;
			}
		} catch {
			// anvil not ready yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`anvil RPC at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Spawn an anvil process forked from BASE_RPC_URL pinned to forkBlock.
 * Exposes RPC at http://127.0.0.1:8545. Returns a viem PublicClient bound to it.
 *
 * Caller must invoke stopAnvilFork() in afterAll/teardown.
 */
export async function startAnvilFork(forkBlock: number) {
	if (!process.env.BASE_RPC_URL) {
		throw new Error('BASE_RPC_URL required for anvil fork — set in CI secrets / .env');
	}
	if (anvilProc) {
		throw new Error('anvil already running — call stopAnvilFork() first');
	}
	anvilProc = spawn(
		'anvil',
		[
			'--fork-url',
			process.env.BASE_RPC_URL,
			'--fork-block-number',
			String(forkBlock),
			'--port',
			'8545',
			// --block-time 2 enables interval mining so blocks tick every 2s
			// (matches Base's actual block time). REQUIRED for E2E flows that
			// wait for >1 confirmation. approvalStore.ts and marketTakeStore.ts
			// both call waitForTransactionReceipt with confirmations: 2; with
			// anvil's default auto-mine (one block per tx, then idle), the
			// confirmation block never arrives and the wait hangs until
			// Playwright's 60s timeout.
			'--block-time',
			'2',
			// Public Base RPCs (publicnode, base.org) throttle aggressively
			// under anvil's bursty lazy state-fetch pattern; --no-rate-limit
			// disables anvil's outbound limiter so we don't get spurious
			// "state pruned" errors masquerading as 429-style throttling.
			'--no-rate-limit',
			// Retry on transient parent-RPC failures.
			'--retries',
			'5'
		],
		{ stdio: 'pipe' }
	);

	// Surface anvil output so fork-init failures are debuggable in CI logs.
	// Anvil writes its boot banner to stdout and RPC errors to stderr; both
	// must reach the workflow log or we're flying blind on dRPC throttling /
	// archive availability problems.
	anvilProc.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[anvil] ${chunk}`));
	anvilProc.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[anvil] ${chunk}`));

	anvilProc.on('exit', (code, signal) => {
		if (code !== 0 && signal !== 'SIGTERM') {
			console.error(`anvil exited unexpectedly: code=${code} signal=${signal}`);
		}
	});

	await waitForRpc('http://127.0.0.1:8545');

	return createPublicClient({
		chain: base,
		transport: http('http://127.0.0.1:8545')
	});
}

export async function stopAnvilFork(): Promise<void> {
	if (!anvilProc) return;
	anvilProc.kill('SIGTERM');
	// give it a moment to clean up
	await new Promise((r) => setTimeout(r, 200));
	anvilProc = null;
}
