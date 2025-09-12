import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	define: {
		'process.env': {}
	},
	ssr: {
		// Bundle heavy ESM deps to avoid runtime "EMFILE" in serverless
		noExternal: ['viem', '@wagmi/core', '@wagmi/connectors', 'svelte-wagmi']
	},
	test: {
		server: {
			deps: {
				inline: ['svelte-wagmi', 'viem', 'ethers']
			}
		},
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		includeSource: ['src/**/*.{js,ts}'],
		setupFiles: ['./vitest-setup.ts']
	}
});
