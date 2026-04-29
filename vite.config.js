import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
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
		svelteTesting()
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
	  modulePreload: { polyfill: false }
	},
	test: {
	  server: {
		deps: { inline: ['svelte-wagmi', 'viem', 'ethers'] }
	  },
	  environment: 'jsdom',
	  include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
	  includeSource: ['src/**/*.{js,ts}', 'tests/**/*.{js,ts}'],
	  setupFiles: ['./vitest-setup.ts']
	}
}))
