import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	define: {
		'process.env': {}
	},
	optimizeDeps: {
		include: [
			'viem',
			'viem/chains',
			'viem/actions',
			'viem/utils',
			'viem/accounts',
			'viem/clients',
			'viem/contract',
			'viem/ens',
			'viem/public',
			'viem/wallet',
			'@wagmi/core',
			'@wagmi/connectors',
			'wagmi'
		],
		exclude: []
	},
	ssr: {
		noExternal: [
			'viem',
			'@wagmi/core',
			'@wagmi/connectors', 
			'wagmi',
			'svelte-wagmi'
		]
	},
	build: {
		rollupOptions: {
			external: (id) => {
				// Don't externalize viem or wagmi related packages
				if (id.includes('viem') || id.includes('wagmi')) {
					return false;
				}
				return false;
			}
		}
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
