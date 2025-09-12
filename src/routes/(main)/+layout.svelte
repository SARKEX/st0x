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
	import { page } from '$app/stores';
	import { browser } from '$app/environment';

	import { getSfts } from '$lib/query';
	import * as alpha from '$lib/services/alpha';
	import type { ApiStockQuote } from '$lib/types';
	import { sfts, rainlangConfirmationModal, tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import { TOKENS } from '$lib/network';

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;

	// Prevent background scroll when mobile sidebar is open
	$: if (browser) {
		if (mobileSidebarOpen) {
			document.body.classList.add('overflow-hidden');
		} else {
			document.body.classList.remove('overflow-hidden');
		}
	}

	// Get page title and description based on current route
	$: pageTitle = getPageTitle($page.url.pathname);
	$: pageDescription = getPageDescription($page.url.pathname);

	function getPageTitle(pathname: string): string {
		if (pathname.startsWith('/trade/')) return 'Trade Details';

		switch (pathname) {
			case '/':
				return 'Trade';
			case '/strategies':
				return 'Strategies';
			case '/dashboard':
				return 'My Dashboard';
			case '/portfolio':
				return 'My Dashboard';
			case '/platform-metrics':
				return 'Platform Metrics';
			case '/orderlist':
				return 'Order List';
			case '/vaultlist':
				return 'Vault List';
			case '/tokens':
				return 'Token List';
			default:
				return 'ST0x';
		}
	}

	function getPageDescription(pathname: string): string {
		if (pathname.startsWith('/trade/')) return 'Trade tokenized stocks';

		switch (pathname) {
			case '/':
				return `Browse and trade tokenized stocks`;
			case '/strategies':
				return 'Manage automated trading strategies';
			case '/dashboard':
				return 'Portfolio, orders, and vault positions';
			case '/platform-metrics':
				return 'Platform statistics and metrics';
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
		queryKey: ['tokenGlobalQuote-unique-symbols'],
		queryFn: async () => {
			// Build unique list of base symbols across all TOKENS (strip 's1' and '0x' suffixes)
			const uniqueBaseSymbols = Array.from(
				new Set(
					TOKENS.map((t) => {
						const sym = t.symbol ?? '';
						if (sym.includes('s1')) return sym.split('s1')[0];
						if (sym.includes('0x')) return sym.split('0x')[0];
						return sym;
					})
				)
			).filter(Boolean);

			const tokenQuotes = [];
			for (const baseSymbol of uniqueBaseSymbols) {
				const data = await alpha.getGlobalQuote(baseSymbol, publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
				tokenQuotes.push(data);
			}
			return tokenQuotes;
		},
		enabled: true
	});

	$: sfts.set($vaultQuery.data);
	$: tokenGlobalQuote.set(($tokenGlobalQuoteQuery.data as unknown as ApiStockQuote[]) ?? []);
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
			<!-- Header for all screen sizes -->
			<Header
				title={pageTitle}
				description={pageDescription}
				on:openMenu={() => (mobileSidebarOpen = !mobileSidebarOpen)}
			/>

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
