<script lang="ts">
	import '../../app.css';
	import { wagmiConfig } from 'svelte-wagmi';
	import { env as publicEnv } from '$env/dynamic/public';
	import { createQuery } from '@tanstack/svelte-query';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import RainlangConfirmationModal from '$lib/components/RainlangConfirmationModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Header from '$lib/components/Header.svelte';
	import NetworkSelector from '$lib/components/NetworkSelector.svelte';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { page } from '$app/stores';

	import { getSfts } from '$lib/query';
	import { sfts, rainlangConfirmationModal, tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import { TOKENS } from '$lib/network';

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;

	// Get page title and description based on current route
	$: pageTitle = getPageTitle($page.url.pathname);
	$: pageDescription = getPageDescription($page.url.pathname);

	function getPageTitle(pathname: string): string {
		switch (pathname) {
			case '/':
			case '/dashboard':
				return 'Dashboard';
			case '/tokens':
				return 'Token List';
			case '/trade':
				return 'Trade';
			case '/mm':
				return 'Market Making';
			case '/portfolio':
				return 'Portfolio';
			case '/orderlist':
				return 'Order List';
			case '/vaultlist':
				return 'Vault List';
			case '/metrics':
				return 'Platform Metrics';
			default:
				return 'ST0x';
		}
	}

	function getPageDescription(pathname: string): string {
		switch (pathname) {
			case '/':
			case '/dashboard':
				return `Welcome to ST0x - ${$currentNetwork?.displayName || 'Network'}`;
			case '/tokens':
				return 'View all tokens';
			case '/trade':
				return 'Trade tokens';
			case '/mm':
				return 'Market making';
			case '/portfolio':
				return 'Your portfolio';
			case '/orderlist':
				return 'Order management';
			case '/vaultlist':
				return 'Vault management';
			case '/metrics':
				return '';
			default:
				return 'ST0x Platform';
		}
	}

	$: vaultQuery = createQuery({
		queryKey: ['getSfts', $currentNetwork?.id],
		queryFn: () => {
			return getSfts();
		},
		enabled: !!$currentNetwork?.subgraph_url
	});

	$: tokenGlobalQuoteQuery = createQuery({
		queryKey: ['tokenGlobalQuote', $currentNetwork?.id],
		queryFn: async () => {
			// Filter tokens by current network's chain ID
			const networkTokens = TOKENS.filter((token) => token.chainId === $currentNetwork.chainId);
			const tokenQuotes = [];
			for (const stox of networkTokens) {
				const response = await fetch(
					`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${
						stox.symbol?.split('s1')[0]
					}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY || ''}`
				);
				const data = await response.json();
				tokenQuotes.push(data);
			}
			return tokenQuotes;
		},
		enabled: !!$currentNetwork?.chainId
	});

	$: sfts.set($vaultQuery.data);
	$: tokenGlobalQuote.set($tokenGlobalQuoteQuery.data ?? []);
</script>

{#if $wagmiConfig}
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
			<!-- Desktop Header -->
			<div class="hidden lg:block">
				<Header title={pageTitle} description={pageDescription} />
			</div>

			<!-- Mobile Header with Menu Button -->
			<div
				class="relative z-[9999] flex items-center justify-between border-b border-white/10 bg-gray-800/95 p-4 backdrop-blur-lg lg:hidden"
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
						ST0x
					</span>
				</div>
				<div class="flex items-center gap-2">
					<NetworkSelector />
					<WalletConnect />
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
{:else}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading ST0x..." />
	</div>
{/if}
