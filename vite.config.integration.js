import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'path';

// Integration-only Vitest config. Runs anvil-driven tests under
// tests/integration/ — gated behind `npm run test:integration` so the
// default `npm test` feedback loop stays fast (per RESEARCH §"Anvil-CI
// Resolution"). Mirrors the test block from vite.config.js but:
//   - include scoped to tests/integration/**/*.test.ts
//   - testTimeout / hookTimeout raised to 60s for anvil spin-up
export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	resolve: {
		conditions: ['browser'],
		alias: {
			'@vercel/speed-insights/sveltekit': path.resolve(
				'./node_modules/@vercel/speed-insights/dist/sveltekit/index.mjs'
			)
		}
	},
	optimizeDeps: {
		esbuildOptions: {
			target: 'es2022',
			supported: { 'top-level-await': true }
		}
	},
	build: {
		target: 'es2022',
		modulePreload: { polyfill: false }
	},
	test: {
		server: {
			deps: { inline: ['svelte-wagmi', 'viem', 'ethers'] }
		},
		environment: 'jsdom',
		setupFiles: ['./vitest-setup.ts'],
		include: ['tests/integration/**/*.test.ts'],
		testTimeout: 60_000,
		hookTimeout: 60_000
	}
});
