<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Header from '$lib/components/Header.svelte';
	import TickerTape from '$lib/components/TickerTape.svelte';
	import AmbientBackground from '$lib/components/AmbientBackground.svelte';
	import MobileTabBar from '$lib/components/MobileTabBar.svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { rainlangConfirmationModal, tradePanelOpen } from '$lib/stores';
	import { navCollapsed } from '$lib/stores/uiStore';

	type TransactionModalComponent = typeof import('$lib/components/TransactionModal.svelte').default;
	type RainlangConfirmationModalComponent =
		typeof import('$lib/components/RainlangConfirmationModal.svelte').default;
	type WalletConnectionModalComponent =
		typeof import('$lib/components/WalletConnectionModal.svelte').default;
	type SaveEarnModalComponent = typeof import('$lib/components/earn/SaveEarnModal.svelte').default;
	type TutorialComponent = typeof import('$lib/components/Tutorial.svelte').default;
	type LowFundsBannerComponent = typeof import('$lib/components/LowFundsBanner.svelte').default;
	type OldTokensBannerComponent = typeof import('$lib/components/OldTokensBanner.svelte').default;

	let TransactionModal: TransactionModalComponent | null = null;
	let RainlangConfirmationModal: RainlangConfirmationModalComponent | null = null;
	let WalletConnectionModal: WalletConnectionModalComponent | null = null;
	let SaveEarnModal: SaveEarnModalComponent | null = null;
	let Tutorial: TutorialComponent | null = null;
	let LowFundsBanner: LowFundsBannerComponent | null = null;
	let OldTokensBanner: OldTokensBannerComponent | null = null;

	async function loadDeferredLayoutComponents() {
		const [
			transactionModal,
			rainlangConfirmationModalComponent,
			walletConnectionModal,
			tutorial,
			lowFundsBanner,
			oldTokensBanner,
			saveEarnModal
		] = await Promise.all([
			import('$lib/components/TransactionModal.svelte'),
			import('$lib/components/RainlangConfirmationModal.svelte'),
			import('$lib/components/WalletConnectionModal.svelte'),
			import('$lib/components/Tutorial.svelte'),
			import('$lib/components/LowFundsBanner.svelte'),
			import('$lib/components/OldTokensBanner.svelte'),
			import('$lib/components/earn/SaveEarnModal.svelte')
		]);

		TransactionModal = transactionModal.default;
		RainlangConfirmationModal = rainlangConfirmationModalComponent.default;
		WalletConnectionModal = walletConnectionModal.default;
		Tutorial = tutorial.default;
		LowFundsBanner = lowFundsBanner.default;
		OldTokensBanner = oldTokensBanner.default;
		SaveEarnModal = saveEarnModal.default;
	}

	onMount(() => {
		void loadDeferredLayoutComponents();
	});

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;
	let sidebarCollapsed = false;

	// Landing page uses the clean/floating layout (no sidebar, transparent header)
	$: isLandingPage = $page.url.pathname === '/';
	$: isTradePage = $page.url.pathname.startsWith('/trade/');
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
		if (pathname.startsWith('/trade/')) return '';

		switch (pathname) {
			case '/':
				return '';
			case '/strategies':
				return 'Strategies';
			case '/dashboard':
				return '';
			case '/portfolio':
				return '';
			case '/platform-metrics':
				return '';
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
		class:lg:mr-[22rem]={isTradePage && $tradePanelOpen}
		style={$navCollapsed ? 'padding-bottom: calc(60px + env(safe-area-inset-bottom));' : ''}
	>
		<!-- Header for all screen sizes -->
		<Header
			title={pageTitle}
			isSidebarCollapsed={useCleanLayout || sidebarCollapsed}
			isLandingPage={useCleanLayout}
		/>

		<!-- Low funds banner (shown when wallet has no USDC) -->
		{#if LowFundsBanner}
			<svelte:component this={LowFundsBanner} />
		{/if}

		<!-- Old tokens banner (shown when user has legacy tokens that need to be swapped) -->
		{#if OldTokensBanner}
			<svelte:component this={OldTokensBanner} />
		{/if}

		<!-- Ticker tape underneath header (trade pages only) -->
		{#if isTradePage}
			<div class="hidden sm:block"><TickerTape /></div>
		{/if}

		<slot {sidebarExpanded} />
		{#if TransactionModal}
			<svelte:component this={TransactionModal} />
		{/if}
		{#if RainlangConfirmationModal}
			<svelte:component
				this={RainlangConfirmationModal}
				show={$rainlangConfirmationModal.show}
				rainlangCode={$rainlangConfirmationModal.rainlangCode}
				onDeploy={$rainlangConfirmationModal.onDeploy || (() => {})}
				onCancel={$rainlangConfirmationModal.onCancel || (() => {})}
			/>
		{/if}
	</div>

	<!-- Connection Modal -->
	{#if WalletConnectionModal}
		<svelte:component this={WalletConnectionModal} />
	{/if}

	<!-- Save & Earn (SGOV) deposit/withdraw modal -->
	{#if SaveEarnModal}
		<svelte:component this={SaveEarnModal} />
	{/if}

	<!-- Tutorial Overlay -->
	{#if Tutorial}
		<svelte:component this={Tutorial} />
	{/if}

	<!-- Mobile bottom tab bar: primary nav once the header collapses -->
	<MobileTabBar />
</div>
