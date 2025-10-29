import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit(), svelteTesting()],
	resolve: {
	  conditions: mode === 'test' ? ['browser'] : []
	},
	define: {
	  'process.env': {}
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
	  include: ['src/**/*.{test,spec}.{js,ts}'],
	  includeSource: ['src/**/*.{js,ts}'],
	  setupFiles: ['./vitest-setup.ts']
	}
}))
