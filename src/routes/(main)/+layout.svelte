<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import TransactionModal from '$lib/components/TransactionModal.svelte';
	import RainlangConfirmationModal from '$lib/components/RainlangConfirmationModal.svelte';
	import RewardsDetailsModal from '$lib/components/rewards/RewardsDetailsModal.svelte';
	import RewardsLeaderboardModal from '$lib/components/rewards/RewardsLeaderboardModal.svelte';
import TokenSwapAnnouncementModal from '$lib/components/rewards/TokenSwapAnnouncementModal.svelte';
	import ReferralJoinModal from '$lib/components/referrals/ReferralJoinModal.svelte';
	import ReferralDashboardModal from '$lib/components/referrals/ReferralDashboardModal.svelte';
	import ReferralLeaderboardModal from '$lib/components/referrals/ReferralLeaderboardModal.svelte';
	import { initTokenSwapAnnouncement } from '$lib/stores/rewardsStore';
	import AccessCodeModal from '$lib/components/AccessCodeModal.svelte';
	import WalletConnectionModal from '$lib/components/WalletConnectionModal.svelte';
	import Tutorial from '$lib/components/Tutorial.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Header from '$lib/components/Header.svelte';
	import TickerTape from '$lib/components/TickerTape.svelte';
	import LowFundsBanner from '$lib/components/LowFundsBanner.svelte';
	import OldTokensBanner from '$lib/components/OldTokensBanner.svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { rainlangConfirmationModal, tradePanelOpen } from '$lib/stores';
	import { checkAndStoreAccessCodeFromUrl } from '$lib/utils/accessCodeStorage';
	// Note: Access check is handled by accessStore's subscription to walletAddress

	// Check for access code in URL params on mount
	onMount(() => {
		checkAndStoreAccessCodeFromUrl();
		initTokenSwapAnnouncement();
	});

	let sidebarExpanded = true;
	let mobileSidebarOpen = false;
	let sidebarCollapsed = false;

	// Check if current page should use the clean/floating layout (no sidebar, transparent header)
	$: isLandingPage = $page.url.pathname === '/';
	$: isTradePage = $page.url.pathname.startsWith('/trade/');
	$: isDashboardPage = $page.url.pathname === '/dashboard';
	$: isMetricsPage = $page.url.pathname === '/platform-metrics';
	// Landing page: no sidebar, transparent header
	// Trade/Dashboard/Metrics pages: sidebar visible, with enhanced background
	$: useCleanLayout = isLandingPage;
	$: useEnhancedBackground = isLandingPage || isTradePage || isDashboardPage || isMetricsPage;

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

<div class="relative min-h-screen overflow-x-hidden bg-gray-900 text-white">
	<!-- Background - enhanced for clean layout pages -->
	{#if useEnhancedBackground}
		<div class="pointer-events-none fixed inset-0 z-0">
			<!-- Gradient overlay -->
			<div
				class="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-900/95 to-gray-900"
			></div>
			<!-- Subtle grid pattern -->
			<div
				class="absolute inset-0 opacity-[0.04]"
				style="background-image: linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px); background-size: 60px 60px;"
			></div>
			<!-- Radial glow accents -->
			<div
				class="absolute left-1/2 top-1/3 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gold-500/[0.07] blur-[120px]"
			></div>
			<div
				class="absolute bottom-0 right-1/4 h-[600px] w-[600px] rounded-full bg-brand-purple-500/[0.06] blur-[100px]"
			></div>
		</div>
	{:else if !useEnhancedBackground}
		<!-- Standard background pattern for other pages -->
		<div class="pointer-events-none fixed inset-0 z-0 opacity-5">
			<div
				class="bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 2000 1000%27%3E%3Cpath d=%27M0,500 Q250,400 500,500 T1000,500 T1500,500 T2000,500%27 stroke=%27%23F3B13C%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,400 Q250,300 500,400 T1000,400 T1500,400 T2000,400%27 stroke=%27%231A5C8E%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3Cpath d=%27M0,600 Q250,500 500,600 T1000,600 T1500,600 T2000,600%27 stroke=%27%2337134D%27 fill=%27none%27 stroke-width=%271%27 opacity=%270.3%27/%3E%3C/svg%3E')] h-full w-full bg-cover"
			/>
		</div>
	{/if}

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
	>
		<!-- Header for all screen sizes -->
		<Header
			title={pageTitle}
			isSidebarCollapsed={useCleanLayout || sidebarCollapsed}
			isLandingPage={useCleanLayout}
		/>

		<!-- Low funds banner (shown when wallet has no USDC) -->
		<LowFundsBanner />

		<!-- Old tokens banner (shown when user has legacy tokens that need to be swapped) -->
		<OldTokensBanner />

		<!-- Ticker tape underneath header (trade pages only) -->
		{#if isTradePage}
			<div class="hidden sm:block"><TickerTape /></div>
		{/if}

		<slot {sidebarExpanded} />
		<TransactionModal />
		<RainlangConfirmationModal
			show={$rainlangConfirmationModal.show}
			rainlangCode={$rainlangConfirmationModal.rainlangCode}
			onDeploy={$rainlangConfirmationModal.onDeploy || (() => {})}
			onCancel={$rainlangConfirmationModal.onCancel || (() => {})}
		/>
	</div>

	<!-- Rewards Modals - temporarily hidden -->
	<!-- <RewardsDetailsModal /> -->
	<!-- <RewardsLeaderboardModal /> -->
	<TokenSwapAnnouncementModal />

	<!-- Referral Modals -->
	<ReferralJoinModal />
	<ReferralDashboardModal />
	<ReferralLeaderboardModal />

	<!-- Access/Connection Modals -->
	<AccessCodeModal />
	<WalletConnectionModal />

	<!-- Tutorial Overlay -->
	<Tutorial />
</div>
