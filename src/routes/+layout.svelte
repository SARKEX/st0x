<script lang="ts">
	import '../app.css';
	import { defaultConfig, wagmiConfig } from 'svelte-wagmi';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { PUBLIC_WALLETCONNECT_ID } from '$env/static/public';
	import { browser } from '$app/environment';
	import { arbitrum } from '@wagmi/core/chains';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';

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
			chains: [arbitrum],
			connectors: [injected(), walletConnect({ projectId: PUBLIC_WALLETCONNECT_ID })]
		});
		await erckit.init();
	};

	let sidebarOpen = false;
	function handleSidebarToggle() {
		sidebarOpen = !sidebarOpen;
		if (sidebarOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	}
	function handleSidebarClose() {
		sidebarOpen = false;
		document.body.style.overflow = '';
	}

	onMount(() => {
		initWallet();
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	{#if $wagmiConfig}
		<Sidebar {sidebarOpen} on:toggle={handleSidebarToggle} on:close={handleSidebarClose} />
		<div class="ml-0 md:ml-64 min-h-screen bg-gray-800/95">
			<main class="w-full flex-grow px-4 sm:px-6 py-6 transition-all duration-300">
				<slot />
				<TransactionModal />
			</main>
			{#if sidebarOpen}
				<div class="fixed inset-0 z-40 bg-black/40 md:hidden" on:click={handleSidebarClose}></div>
			{/if}
		</div>
	{/if}
</QueryClientProvider>
