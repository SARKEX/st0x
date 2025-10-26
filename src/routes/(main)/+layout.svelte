<script lang="ts">
	import '../../app.css';
	import { wagmiConfig } from 'svelte-wagmi';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import RainlangConfirmationModal from '$lib/components/RainlangConfirmationModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Header from '$lib/components/Header.svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { sfts, rainlangConfirmationModal } from '$lib/stores';

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;
	let sidebarCollapsed = false;

	// Prevent background scroll when mobile sidebar is open
	$: if (browser) {
		if (mobileSidebarOpen) {
			document.body.classList.add('overflow-hidden');
		} else {
			document.body.classList.remove('overflow-hidden');
		}
	}

	function handleSidebarToggle(event: CustomEvent<{ collapsed: boolean }>) {
		sidebarCollapsed = event.detail.collapsed;
	}

	function handleHeaderSidebarToggle(event: CustomEvent<{ target: 'mobile' | 'desktop' }>) {
		if (event.detail?.target === 'desktop') {
			sidebarCollapsed = !sidebarCollapsed;
			mobileSidebarOpen = false;
		} else {
			mobileSidebarOpen = !mobileSidebarOpen;
		}
	}

	// Get page title and description based on current route
	$: pageTitle = getPageTitle($page.url.pathname);
	$: pageDescription = getPageDescription($page.url.pathname);

	function getPageTitle(pathname: string): string {
		if (pathname.startsWith('/trade/')) return 'Trade';

		switch (pathname) {
			case '/':
				return 'Assets';
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
		if (pathname.startsWith('/trade/')) {
			// Extract token name from path
			const tokenId = pathname.split('/trade/')[1];
			const sft = $sfts?.find((s) => s.id === tokenId);
			if (sft) {
				return `Trade ${sft.name} on our DEX`;
			}
			return 'Trade tokenised assets';
		}

		switch (pathname) {
			case '/':
				return `Browse and trade tokenised assets`;
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
</script>

{#if $wagmiConfig}
	<div class="relative min-h-screen overflow-x-hidden bg-gray-900 text-white">
		<!-- Background Pattern -->
		<div class="pointer-events-none fixed inset-0 z-0 opacity-5">
			<div
				class="bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 2000 1000%27%3E%3Cpath d=%27M0,500 Q250,400 500,500 T1000,500 T1500,500 T2000,500%27 stroke=%27%23F3B13C%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,400 Q250,300 500,400 T1000,400 T1500,400 T2000,400%27 stroke=%27%231A5C8E%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,600 Q250,500 500,600 T1000,600 T1500,600 T2000,600%27 stroke=%27%2337134D%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3C/svg%3E')] h-full w-full bg-cover"
			/>
		</div>
		<!-- Mobile/Tablet sidebar (always rendered) -->
		<div class="lg:hidden">
			<Sidebar
				visible={mobileSidebarOpen}
				desktop={false}
				on:close={() => (mobileSidebarOpen = false)}
				on:open={() => (mobileSidebarOpen = true)}
			/>
		</div>
		<!-- Desktop sidebar -->
		<div class="fixed left-0 top-0 z-50 hidden h-full lg:block">
			<Sidebar
				visible={true}
				desktop={true}
				collapsed={sidebarCollapsed}
				on:toggleCollapse={handleSidebarToggle}
			/>
		</div>

		<!-- Main Content -->
		<div
			class="transition-all duration-300"
			class:lg:ml-64={!sidebarCollapsed}
			class:lg:ml-0={sidebarCollapsed}
		>
			<!-- Header for all screen sizes -->
			<Header
				title={pageTitle}
				description={pageDescription}
				isSidebarCollapsed={sidebarCollapsed}
				isMobileSidebarOpen={mobileSidebarOpen}
				on:toggleSidebar={handleHeaderSidebarToggle}
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
	<div class="flex h-screen items-center justify-center bg-gray-900 text-white">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading ST0x..." />
	</div>
{/if}
