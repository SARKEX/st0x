// Playwright globalTeardown — runs once after the full spec suite. Mirrors the
// SIGTERM + grace-delay pattern from tests/helpers/anvil.ts:74-80 / previewServer.ts.
import { stopAnvilFork } from '../../helpers/anvil';
import { stopPreviewServer } from '../../helpers/previewServer';

export default async function globalTeardown(): Promise<void> {
	await stopPreviewServer();
	await stopAnvilFork();
}
