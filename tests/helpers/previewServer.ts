// vite preview spawn/kill with ready-detect. Mirrors the spawn-with-pipe + exit-handler
// + ready-poll pattern from tests/helpers/anvil.ts so the two long-running test
// processes have identical lifecycle shape.
import { spawn, type ChildProcess } from 'node:child_process';

let previewProc: ChildProcess | null = null;

/**
 * Poll the given URL until it returns a non-5xx response (default 30s timeout).
 * Used by previewServer ready-detect and by globalSetup smoke probes.
 */
export async function waitForUrl(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const r = await fetch(url);
			if (r.ok || r.status < 500) return;
		} catch {
			// preview not ready yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`preview at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Spawn `npm run preview` on the given port with the given env overlay (E2E=1 set
 * by globalSetup so hooks.server.ts relaxes CSP). Awaits ready-probe before
 * resolving.
 *
 * Caller must invoke stopPreviewServer() in globalTeardown.
 */
export async function startPreviewServer(opts: {
	port: number;
	env: Record<string, string>;
}): Promise<void> {
	if (previewProc) {
		throw new Error('preview already running — call stopPreviewServer() first');
	}
	previewProc = spawn(
		'npm',
		['run', 'preview', '--', '--port', String(opts.port), '--host', '127.0.0.1'],
		{ stdio: 'pipe', env: { ...process.env, ...opts.env } }
	);

	previewProc.on('exit', (code, signal) => {
		if (code !== 0 && signal !== 'SIGTERM') {
			console.error(`preview exited unexpectedly: code=${code} signal=${signal}`);
		}
	});

	await waitForUrl(`http://127.0.0.1:${opts.port}/`);
}

export async function stopPreviewServer(): Promise<void> {
	if (!previewProc) return;
	previewProc.kill('SIGTERM');
	// give it a moment to clean up (mirrors stopAnvilFork())
	await new Promise((r) => setTimeout(r, 200));
	previewProc = null;
}
