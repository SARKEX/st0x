<script lang="ts">
	import TickerTape from './TickerTape.svelte';
	import NetworkSelector from './NetworkSelector.svelte';
	import RewardsDisplay from './rewards/RewardsDisplay.svelte';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { connected, signerAddress, web3Modal } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { wrongNetwork } from '$lib/stores';

	export let title: string;
	export let description: string;
	export let isSidebarCollapsed = false;
	export let isMobileSidebarOpen = false;

	const dispatch = createEventDispatcher();

	let mobileNavOpen = false;
	let windowWidth = 0;
	let navTooWide = false;
	let actionCluster: HTMLDivElement | null = null;
	let clusterObserver: ResizeObserver | null = null;

	type SidebarToggleTarget = 'mobile' | 'desktop';

	function handleSidebarToggle(target: SidebarToggleTarget) {
		dispatch('toggleSidebar', { target });
	}

	function toggleMobileNav() {
		if (!isHamburgerMode) return;
		mobileNavOpen = !mobileNavOpen;
	}

	function closeMobileNav() {
		mobileNavOpen = false;
	}

	$: activePath = $page.url.pathname;

	const NAV_ITEMS = [
		{ name: 'Assets', href: '/' },
		{ name: 'Strategies', href: '/strategies', showAlpha: true },
		{ name: 'Platform Metrics', href: '/platform-metrics' }
	];

	const DESKTOP_NAV_WIDTH = 'w-28 xl:w-40';

	let isHamburgerMode = true;

	function cleanupObserver() {
		if (clusterObserver) {
			clusterObserver.disconnect();
			clusterObserver = null;
		}
	}

	async function checkNavOverflow() {
		await tick();
		if (!actionCluster || windowWidth < 1024) {
			if (windowWidth < 1024 && navTooWide) {
				navTooWide = false;
			}
			return;
		}
		if (isHamburgerMode && navTooWide) {
			return;
		}
		const needsHamburger = actionCluster.scrollWidth > actionCluster.clientWidth + 1;
		if (needsHamburger !== navTooWide) {
			navTooWide = needsHamburger;
		}
	}

	function setupObserver() {
		if (!actionCluster || windowWidth < 1024 || isHamburgerMode) {
			cleanupObserver();
			return;
		}
		if (!clusterObserver) {
			clusterObserver = new ResizeObserver(() => {
				checkNavOverflow();
			});
		}
		const observer = clusterObserver;
		observer.disconnect();
		observer.observe(actionCluster);
		checkNavOverflow();
	}

	onMount(() => {
		windowWidth = window.innerWidth;
		tick().then(() => {
			checkNavOverflow();
		});
		const handleResize = () => {
			windowWidth = window.innerWidth;
			if (windowWidth < 1024) {
				navTooWide = false;
				cleanupObserver();
			} else if (navTooWide) {
				navTooWide = false;
				tick().then(() => {
					setupObserver();
					checkNavOverflow();
				});
			} else {
				checkNavOverflow();
			}
		};
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	onDestroy(() => {
		cleanupObserver();
	});

	$: {
		if (!isHamburgerMode) {
			setupObserver();
		} else {
			cleanupObserver();
		}
	}

	$: isHamburgerMode = windowWidth < 1024 || navTooWide;
	$: if (!isHamburgerMode) {
		mobileNavOpen = false;
	}
</script>

<div class="sticky top-0 z-[100] border-b border-white/10 bg-gray-800/95 backdrop-blur-lg">
	<div class="hidden sm:block"><TickerTape /></div>
	<div class="px-4 py-2 sm:px-6 sm:py-3">
		<div class="flex items-center justify-between gap-3 lg:gap-4">
			<div class="flex items-center gap-2 lg:gap-4">
				<Button
					variant="ghost"
					size="sm"
					className="p-2 lg:hidden"
					aria-label={isMobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
					on:click={() => handleSidebarToggle('mobile')}
				>
					<svg
						class="h-5 w-5 transition-transform duration-200"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
						class:rotate-180={isMobileSidebarOpen}
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</Button>
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
				<a href="/" aria-label="Go to home" class="shrink-0">
					<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-8 w-auto lg:h-10" />
				</a>
				<div class="ml-2 hidden lg:block">
					<h1 class="text-base font-bold">{title}</h1>
					<p class="truncate text-xs text-gray-400 md:max-w-[200px] xl:max-w-[260px]">
						{description}
					</p>
				</div>
			</div>

			<div
				class="flex min-w-0 flex-nowrap items-center gap-2 xl:gap-3"
				bind:this={actionCluster}
			>
				{#if !isHamburgerMode}
					<div class="flex flex-nowrap items-center gap-2 xl:gap-3">
						{#each NAV_ITEMS as item}
							<a
								href={item.href}
								class={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${DESKTOP_NAV_WIDTH} ${
									activePath === item.href
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

				<RewardsDisplay />

				{#if $connected && !$wrongNetwork && $signerAddress}
					<div class="flex items-center gap-2">
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
						<Button
							variant="ghost"
							size="sm"
							className="p-2"
							aria-label="Disconnect wallet"
							on:click={() => $web3Modal.open()}
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
					<Button
						on:click={() => $web3Modal.open()}
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
			<nav class="flex flex-col gap-2">
				{#each NAV_ITEMS as item}
					<a
						href={item.href}
						on:click={closeMobileNav}
						class="rounded-lg px-4 py-3 text-base font-medium transition-colors {activePath ===
						item.href
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
