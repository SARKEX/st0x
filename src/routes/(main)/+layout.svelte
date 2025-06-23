<script lang="ts">
	import '../../app.css';
	import { defaultConfig, wagmiConfig } from 'svelte-wagmi';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { PUBLIC_ALPHAVANTAGE_API_KEY, PUBLIC_WALLETCONNECT_ID } from '$env/static/public';
	import { arbitrum } from '@wagmi/core/chains';
	import { createQuery } from '@tanstack/svelte-query';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import RainlangConfirmationModal from '$lib/components/RainlangConfirmationModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { onMount } from 'svelte';
	import { getSfts } from '$lib/query';
	import { sfts, rainlangConfirmationModal, tokenGlobalQuote } from '$lib/stores';
	import { STOXs } from '$lib/network';

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

	$: tokenGlobalQuoteQuery = createQuery({
		queryKey: ['tokenGlobalQuote'],
		queryFn: async () => {
			const tokenQuotes = [];
			for (const stox of STOXs) {
				const response = await fetch(
					`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${
						stox.symbol?.split('s1')[0]
					}&apikey=${PUBLIC_ALPHAVANTAGE_API_KEY}`
				);
				const data = await response.json();
				tokenQuotes.push(data);
			}
			return tokenQuotes;
		}
	});

	$: sfts.set($vaultQuery.data);
	$: tokenGlobalQuote.set($tokenGlobalQuoteQuery.data ?? []);

	onMount(() => {
		initWallet();
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

{#if $vaultQuery.isLoading || $tokenGlobalQuoteQuery.isLoading}
	<LoadingSpinner variant="fullscreen" size="xl" text="Loading ST0x..." />
{:else if $vaultQuery.isError || $tokenGlobalQuoteQuery.isError}
	<div class="flex h-screen items-center justify-center">
		<div class="text-red-500">
			Error: {$vaultQuery.error?.message || $tokenGlobalQuoteQuery.error?.message}
		</div>
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
			<RainlangConfirmationModal
				show={$rainlangConfirmationModal.show}
				rainlangCode={$rainlangConfirmationModal.rainlangCode}
				onDeploy={$rainlangConfirmationModal.onDeploy || (() => {})}
				onCancel={$rainlangConfirmationModal.onCancel || (() => {})}
			/>
		</div>
	</div>
{/if}
