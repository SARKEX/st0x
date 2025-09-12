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
		external: ['viem', '@wagmi/core', '@wagmi/connectors', 'wagmi'],
		noExternal: ['svelte-wagmi']
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
