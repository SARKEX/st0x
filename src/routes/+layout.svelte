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

	let sidebarExpanded = true;
	function toggleSidebar() {
		sidebarExpanded = !sidebarExpanded;
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
		<div class="relative min-h-screen overflow-x-hidden bg-gray-900 text-white">
			<!-- Background Pattern -->
			<div class="pointer-events-none fixed inset-0 z-0 opacity-5">
				<div
					class="bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 2000 1000%27%3E%3Cpath d=%27M0,500 Q250,400 500,500 T1000,500 T1500,500 T2000,500%27 stroke=%27%23F3B13C%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,400 Q250,300 500,400 T1000,400 T1500,400 T2000,400%27 stroke=%27%231A5C8E%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,600 Q250,500 500,600 T1000,600 T1500,600 T2000,600%27 stroke=%27%2337134D%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3C/svg%3E')] h-full w-full bg-cover"
				/>
			</div>

			<Sidebar {sidebarExpanded} {toggleSidebar} />
			<div class="transition-all duration-300 {sidebarExpanded ? 'ml-64' : 'ml-16'}">
				<slot {sidebarExpanded} />
				<TransactionModal />
			</div>
		</div>
	{/if}
</QueryClientProvider>
