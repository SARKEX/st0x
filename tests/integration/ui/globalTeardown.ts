// Playwright globalTeardown — runs once after the full spec suite. Preview
// teardown is handled by Playwright's webServer block (see playwright.config.ts);
// only anvil needs explicit cleanup here.
import { stopAnvilFork } from '../../helpers/anvil';

export default async function globalTeardown(): Promise<void> {
	await stopAnvilFork();
}
