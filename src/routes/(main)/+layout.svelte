<script lang="ts">
	import '../../app.css';
	import { defaultConfig, wagmiConfig } from 'svelte-wagmi';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { PUBLIC_WALLETCONNECT_ID } from '$env/static/public';
	import { arbitrum } from '@wagmi/core/chains';
	import { createQuery } from '@tanstack/svelte-query';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { onMount } from 'svelte';
	import { getSfts } from '$lib/query';
	import { sfts } from '$lib/stores';

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

	$: vaultQuery = createQuery({
		queryKey: ['getSfts'],
		queryFn: () => {
			return getSfts();
		}
	});

	$: sfts.set($vaultQuery.data);

	onMount(() => {
		initWallet();
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

{#if $vaultQuery.isLoading}
	<div class="flex h-screen items-center justify-center bg-gray-900">
		<div class="relative">
			<div
				class="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-20"
			></div>
			<div
				class="relative h-32 w-32 animate-spin rounded-full border-4 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500"
			></div>
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="h-24 w-24 rounded-full bg-gray-900"></div>
			</div>
		</div>
	</div>
{:else if $vaultQuery.isError}
	<div class="flex h-screen items-center justify-center">
		<div class="text-red-500">Error: {$vaultQuery.error.message}</div>
	</div>
{:else if $wagmiConfig}
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
