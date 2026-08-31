import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/integration/ui',
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }
	],
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
		port: 4173,
		timeout: 600_000,
		reuseExistingServer: !process.env.CI,
		env: {
			SESSION_SECRET: 'e2e-build-only-dummy-session-secret',
			CSRF_SECRET: 'e2e-build-only-dummy-csrf-secret',
			BASE_RPC_URL: 'https://base-rpc.publicnode.com'
		}
	}
});
