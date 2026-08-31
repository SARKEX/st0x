<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Header from '$lib/components/Header.svelte';
	import AmbientBackground from '$lib/components/AmbientBackground.svelte';
	import MobileTabBar from '$lib/components/MobileTabBar.svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { navCollapsed } from '$lib/stores/uiStore';

	type TransactionModalComponent = typeof import('$lib/components/TransactionModal.svelte').default;
	type WalletConnectionModalComponent =
		typeof import('$lib/components/WalletConnectionModal.svelte').default;

	let TransactionModal: TransactionModalComponent | null = null;
	let WalletConnectionModal: WalletConnectionModalComponent | null = null;

	async function loadDeferredLayoutComponents() {
		const [transactionModal, walletConnectionModal] = await Promise.all([
			import('$lib/components/TransactionModal.svelte'),
			import('$lib/components/WalletConnectionModal.svelte')
		]);

		TransactionModal = transactionModal.default;
		WalletConnectionModal = walletConnectionModal.default;
	}

	onMount(() => {
		void loadDeferredLayoutComponents();
	});

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;
	let sidebarCollapsed = false;

	// Landing page uses the clean/floating layout (no sidebar, transparent header)
	$: isLandingPage = $page.url.pathname === '/';
	$: useCleanLayout = isLandingPage;

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

	// Get page title based on current route
	$: pageTitle = getPageTitle($page.url.pathname);

	function getPageTitle(pathname: string): string {
		switch (pathname) {
			case '/':
				return '';
			case '/dashboard':
				return '';
			case '/portfolio':
				return '';
			case '/platform-metrics':
				return '';
			default:
				return 'ST0x';
		}
	}
</script>

<div class="relative min-h-screen overflow-x-hidden bg-bg text-text">
	<!-- Ambient v2 background: drifting auroras + bokeh canvas + grid veil -->
	<AmbientBackground />

	<!-- Mobile/Tablet sidebar (hidden on clean layout pages) -->
	{#if !useCleanLayout}
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
	{/if}

	<!-- Main Content -->
	<div
		class="relative z-10 transition-all duration-300"
		class:lg:ml-64={!useCleanLayout && !sidebarCollapsed}
		class:lg:ml-0={useCleanLayout || sidebarCollapsed}
		style:--desktop-sidebar-offset={!useCleanLayout && !sidebarCollapsed ? '16rem' : '0rem'}
		style:padding-bottom={$navCollapsed ? 'calc(60px + env(safe-area-inset-bottom))' : undefined}
	>
		<!-- Header for all screen sizes -->
		<Header
			title={pageTitle}
			isSidebarCollapsed={useCleanLayout || sidebarCollapsed}
			isLandingPage={useCleanLayout}
		/>

		<slot {sidebarExpanded} />
		{#if TransactionModal}
			<svelte:component this={TransactionModal} />
		{/if}
	</div>

	<!-- Connection Modal -->
	{#if WalletConnectionModal}
		<svelte:component this={WalletConnectionModal} />
	{/if}

	<!-- Mobile bottom tab bar: primary nav once the header collapses -->
	<MobileTabBar />
</div>
