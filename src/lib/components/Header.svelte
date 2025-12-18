<script lang="ts">
	import NetworkSelector from './NetworkSelector.svelte';
	import RewardsDisplay from './rewards/RewardsDisplay.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { connected, signerAddress, web3Modal } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { wrongNetwork, sfts, tradePanelOpen } from '$lib/stores';
	import { walletRegistered } from '$lib/stores/accessStore';

	export let title: string;
	export let isSidebarCollapsed = false;
	export let isLandingPage = false;

	const dispatch = createEventDispatcher();

	let mobileNavOpen = false;
	let windowWidth = 0;

	function handleSidebarToggle(target: 'mobile' | 'desktop') {
		dispatch('toggleSidebar', { target });
	}

	function toggleMobileNav() {
		mobileNavOpen = !mobileNavOpen;
	}

	function closeMobileNav() {
		mobileNavOpen = false;
	}

	$: activePath = $page.url.pathname;
	$: firstTokenId = $sfts?.[0]?.id;
	$: tradeHref = firstTokenId ? `/trade/${firstTokenId}` : '/';
	$: isOnTradePage = activePath.startsWith('/trade/');

	$: NAV_ITEMS = [
		{ name: 'Trade', href: tradeHref, isActive: isOnTradePage, showAlpha: false },
		{ name: 'Strategies', href: '/strategies', isActive: false, showAlpha: true },
		{ name: 'Platform Metrics', href: '/platform-metrics', isActive: false, showAlpha: false }
	];

	const DESKTOP_NAV_WIDTH = 'w-28 xl:w-40';

	// Hamburger mode below 1024px, or below 1400px when trade panel is open (needs more space)
	$: isHamburgerMode = windowWidth < 1024 || ($tradePanelOpen && windowWidth < 1400);
	$: if (!isHamburgerMode) mobileNavOpen = false;

	onMount(() => {
		windowWidth = window.innerWidth;
		const handleResize = () => (windowWidth = window.innerWidth);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function handleConnectWallet() {
		$web3Modal.open();
	}
</script>

<div class="sticky top-0 z-[100] bg-transparent transition-all duration-300">
	<div class="px-3 py-3 sm:px-6 sm:py-5">
		<div class="flex items-center justify-between gap-2 sm:gap-3 lg:gap-4">
			<div class="flex items-center gap-1.5 sm:gap-2 lg:gap-4">
				{#if !isLandingPage}
					{#if isSidebarCollapsed}
						<Button
							variant="ghost"
							size="sm"
							className="hidden p-2 lg:inline-flex"
							aria-label="Expand sidebar"
							on:click={() => handleSidebarToggle('desktop')}
						>
							<svg
								class="h-5 w-5 transition-transform duration-200"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
								class:rotate-180={!isSidebarCollapsed}
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
						</Button>
					{/if}
				{/if}
				<a href="/" aria-label="Go to home" class="shrink-0">
					<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-7 w-auto sm:h-8 lg:h-10" />
				</a>
				{#if title}
					<div class="ml-2 hidden lg:block">
						<h1 class="text-base font-bold">{title}</h1>
					</div>
				{/if}
			</div>

			<div class="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2 xl:gap-3">
				{#if !isHamburgerMode}
					<div class="flex flex-nowrap items-center gap-2 xl:gap-3">
						{#each NAV_ITEMS as item}
							<a
								href={item.href}
								class={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${DESKTOP_NAV_WIDTH} ${
									item.isActive || activePath === item.href
										? 'bg-yellow-500/20 text-yellow-500'
										: 'text-gray-300 hover:bg-white/5 hover:text-white'
								}`}
							>
								{item.name}
								{#if item.showAlpha}
									<span
										class="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-yellow-400"
										>Alpha</span
									>
								{/if}
							</a>
						{/each}
					</div>
				{/if}

				<NetworkSelector />

				<!-- Hide on mobile, show in hamburger menu instead -->
				{#if !isHamburgerMode}
					<RewardsDisplay />
				{/if}

				{#if $connected && !$wrongNetwork && $signerAddress && $walletRegistered}
					<!-- Fully registered user -->
					<div class="flex items-center gap-2">
						{#if !isHamburgerMode}
							<!-- Full dashboard button on desktop -->
							<a href="/dashboard">
								<Button variant="primary" size="sm" className="px-3 py-2 text-sm whitespace-nowrap">
									<div class="flex items-center gap-2">
										<span>My Dashboard</span>
										<span class="text-[11px] font-normal text-yellow-300/80">
											...{$signerAddress.slice(-4)}
										</span>
									</div>
								</Button>
							</a>
						{:else}
							<!-- Compact dashboard link on mobile/hamburger mode -->
							<a href="/dashboard">
								<Button variant="primary" size="sm" className="px-3 py-2 text-sm whitespace-nowrap">
									Dashboard
								</Button>
							</a>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							className="p-2"
							aria-label="Disconnect wallet"
							on:click={handleConnectWallet}
						>
							<svg
								class="h-5 w-5 text-gray-400 hover:text-red-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
								/>
							</svg>
						</Button>
					</div>
				{:else}
					<!-- Not connected or not registered -->
					<Button
						on:click={handleConnectWallet}
						variant="primary"
						size="sm"
						className="px-3 py-2 text-sm whitespace-nowrap"
					>
						Connect Wallet
					</Button>
				{/if}

				{#if isHamburgerMode}
					<Button
						variant="ghost"
						size="sm"
						className="p-2"
						aria-label="Toggle navigation"
						on:click={toggleMobileNav}
					>
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							{#if mobileNavOpen}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								></path>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 6h16M4 12h16M4 18h16"
								></path>
							{/if}
						</svg>
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Mobile/Tablet Navigation Dropdown -->

{#if mobileNavOpen && isHamburgerMode}
	<div
		class="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
		role="button"
		tabindex="0"
		on:click={closeMobileNav}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') closeMobileNav();
		}}
	/>
	<div
		class="fixed left-0 right-0 top-[60px] z-[99] border-b border-white/10 bg-gray-800/95 backdrop-blur-lg"
	>
		<div class="flex flex-col gap-4 p-4">
			<!-- Boost Rewards in mobile menu -->
			<div class="border-b border-white/10 pb-4">
				<RewardsDisplay />
			</div>

			<nav class="flex flex-col gap-2">
				{#each NAV_ITEMS as item}
					<a
						href={item.href}
						on:click={closeMobileNav}
						class="rounded-lg px-4 py-3 text-base font-medium transition-colors {item.isActive ||
						activePath === item.href
							? 'bg-yellow-500/20 text-yellow-500'
							: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
					>
						<span class="flex items-center gap-2">
							{item.name}
							{#if item.showAlpha}
								<span
									class="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-400"
									>Alpha</span
								>
							{/if}
						</span>
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}
