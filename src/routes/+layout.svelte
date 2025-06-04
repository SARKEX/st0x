<script lang="ts">
	import '../app.css';
	import { defaultConfig, wagmiConfig } from 'svelte-wagmi';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { PUBLIC_WALLETCONNECT_ID } from '$env/static/public';
	import { browser } from '$app/environment';
	import { polygon } from '@wagmi/core/chains';
	import Header from '$lib/components/Header.svelte';
	import TransactionModal from '$lib/components/TransactionModal.svelte';

	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Infinity
			}
		}
	});

	const initWallet = async () => {
		const erckit = defaultConfig({
			autoConnect: true,
			appName: 'st0x-liquidity',
			walletConnectProjectId: PUBLIC_WALLETCONNECT_ID,
			chains: [polygon],
			connectors: [injected(), walletConnect({ projectId: PUBLIC_WALLETCONNECT_ID })]
		});
		await erckit.init();
	};
	$: if (browser && window.navigator) {
		initWallet();
	}
</script>

<QueryClientProvider client={queryClient}>
	{#if $wagmiConfig}
		<div class="app-bg flex min-h-screen flex-col bg-white">
			<Header />
			<main class="mx-auto w-full max-w-screen-xl flex-grow px-4 py-6 sm:px-6">
				<slot />
				<TransactionModal />
			</main>
		</div>
	{/if}
</QueryClientProvider>
