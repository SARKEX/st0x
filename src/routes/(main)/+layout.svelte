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
	import Button from '$lib/components/ui/Button.svelte';
	import { page } from '$app/stores';

	import { getSfts } from '$lib/query';
	import * as alpha from '$lib/services/alpha';
	import type { ApiStockQuote } from '$lib/types';
	import { sfts, rainlangConfirmationModal, tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import { TOKENS } from '$lib/network';

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;

	// Prevent background scroll when mobile sidebar is open
	$: {
		if (mobileSidebarOpen) {
			document?.body?.classList.add('overflow-hidden');
		} else {
			document?.body?.classList.remove('overflow-hidden');
		}
	}

	// Get page title and description based on current route
	$: pageTitle = getPageTitle($page.url.pathname);
	$: pageDescription = getPageDescription($page.url.pathname);

	function getPageTitle(pathname: string): string {
		if (pathname.startsWith('/trade/')) return 'Trade Details';

		switch (pathname) {
			case '/':
			case '/trade-list':
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
			case '/trade-list':
				return `Browse and trade tokenized stocks on ${$currentNetwork?.displayName || 'Network'}`;
			case '/strategies':
				return 'Manage your trading strategies';
			case '/dashboard':
				return 'Your portfolio, orders, and vault positions';
			case '/portfolio':
				return 'Your portfolio, orders, and vault positions';
			case '/platform-metrics':
				return 'Platform statistics and metrics';
			case '/orderlist':
				return 'Order management';
			case '/vaultlist':
				return 'Vault management';
			case '/tokens':
				return 'View all tokens';
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
				const data = await alpha.getGlobalQuote(
					baseSymbol,
					publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY
				);
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
			<!-- Desktop Header -->
			<div class="hidden lg:block">
				<Header title={pageTitle} description={pageDescription} />
			</div>

			<!-- Mobile Header with Menu Button -->
			<div
				class="relative z-[9999] flex items-center justify-between border-b border-white/10 bg-gray-800/95 p-4 backdrop-blur-lg lg:hidden"
			>
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
					on:click={() => (mobileSidebarOpen = !mobileSidebarOpen)}
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				</Button>
				<a href="/trade-list" aria-label="Go to trade list" class="flex items-center gap-2">
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
				</a>
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
