<script lang="ts">
	import '../../app.css';
	import { wagmiConfig } from 'svelte-wagmi';
	import { PUBLIC_ALPHAVANTAGE_API_KEY } from '$env/static/public';
	import { createQuery } from '@tanstack/svelte-query';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import RainlangConfirmationModal from '$lib/components/RainlangConfirmationModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	import { getSfts } from '$lib/query';
	import { sfts, rainlangConfirmationModal, tokenGlobalQuote } from '$lib/stores';
	import { STOXs } from '$lib/network';

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;

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

		<!-- Always render for transition, pass visible prop -->
		<div class="lg:hidden">
			<Sidebar
				visible={mobileSidebarOpen}
				desktop={false}
				on:close={() => (mobileSidebarOpen = false)}
			/>
		</div>
		<!-- Desktop sidebar -->
		<div class="fixed left-0 top-0 z-50 hidden h-full lg:block">
			<Sidebar visible={true} desktop={true} />
		</div>

		<!-- Main Content -->
		<div
			class="transition-all duration-300"
			class:lg:ml-64={sidebarExpanded}
			class:lg:ml-16={!sidebarExpanded}
		>
			<!-- Mobile Header with Menu Button -->
			<div
				class="flex items-center justify-between border-b border-white/10 bg-gray-800/95 p-4 backdrop-blur-lg lg:hidden"
			>
				<button
					on:click={() => (mobileSidebarOpen = !mobileSidebarOpen)}
					class="rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				</button>
				<div class="flex items-center gap-2">
					<img
						src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
						alt="ST0x Logo"
						class="h-8 w-8 rounded-full"
					/>
					<span
						class="bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
					>
						ST0X
					</span>
				</div>
			</div>

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
