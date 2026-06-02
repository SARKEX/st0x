import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

export default defineConfig(({ mode }) => ({
	plugins: [
		sentrySvelteKit({
			adapter: 'vercel',
			sourceMapsUploadOptions: {
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				authToken: process.env.SENTRY_AUTH_TOKEN
			},
			autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN
		}),
		sveltekit(),
		svelteTesting(),
		// PERF-01: bundle visualizer gated on ANALYZE=1 (developer-local only).
		// Output (`stats.html`) is .gitignore'd so it never ships.
		...(process.env.ANALYZE === '1'
			? [
					visualizer({
						emitFile: true,
						filename: 'stats.html',
						open: false,
						gzipSize: true,
						brotliSize: true,
						template: 'treemap'
					})
				]
			: [])
	],
	resolve: {
	  conditions: mode === 'test' ? ['browser'] : [],
	  alias: {
	    '@vercel/speed-insights/sveltekit': path.resolve('./node_modules/@vercel/speed-insights/dist/sveltekit/index.mjs')
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
	  modulePreload: { polyfill: false },
	  rollupOptions: {
		output: {
		  manualChunks(id) {
			if (!id.includes('node_modules')) return;
			if (id.includes('@tanstack/')) return 'tanstack-query';
			if (
			  id.includes('svelte-wagmi') ||
			  id.includes('@wagmi/') ||
			  id.includes('@web3modal/') ||
			  id.includes('@walletconnect/') ||
			  id.includes('viem') ||
			  id.includes('ethers')
			) {
			  return 'wallet';
			}
		  }
		}
	  }
	},
	test: {
	  server: {
		deps: { inline: ['svelte-wagmi', 'viem', 'ethers'] }
	  },
	  environment: 'jsdom',
	  include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
	  exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
	  includeSource: ['src/**/*.{js,ts}', 'tests/**/*.{js,ts}'],
	  setupFiles: ['./vitest-setup.ts']
	}
}))
