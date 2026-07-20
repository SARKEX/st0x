<script lang="ts">
	import NetworkSelector from './NetworkSelector.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { web3Modal } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { wrongNetwork, sfts, tradePanelOpen } from '$lib/stores';
	// Unified auth
	import { walletAddress, authMethod, isAuthenticated } from '$lib/stores/authStore';
	import { openAuthModal, logoutDynamic, dynamicSession } from '$lib/stores/dynamicStore';
	import { navCollapsed } from '$lib/stores/uiStore';

	export let title: string;
	export let isSidebarCollapsed = false;
	export let isLandingPage = false;

	let accountMenuOpen = false;
	let windowWidth = 0;

	function toggleAccountMenu() {
		accountMenuOpen = !accountMenuOpen;
	}

	function closeAccountMenu() {
		accountMenuOpen = false;
	}

	function handleClickOutsideAccountMenu(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.account-menu-container')) {
			closeAccountMenu();
		}
	}

	$: activePath = $page.url.pathname;
	$: firstTokenId = $sfts?.[0]?.id;
	$: tradeHref = firstTokenId ? `/trade/${firstTokenId}` : '/';
	$: isOnTradePage = activePath.startsWith('/trade/');

	$: NAV_ITEMS = [
		{ name: 'Trade', href: tradeHref, isActive: isOnTradePage, showAlpha: false },
		{ name: 'Strategies', href: '/strategies', isActive: false, showAlpha: true },
		{
			name: 'Platform Metrics',
			href: '/platform-metrics',
			isActive: false,
			showAlpha: false
		}
	];

	// Calculate effective breakpoint based on what's taking up space
	// Base: 1350px for the nav content itself
	// +256px when sidebar is expanded (not landing page and not collapsed)
	// +352px when trade panel is open
	$: sidebarOffset = !isLandingPage && !isSidebarCollapsed ? 256 : 0;
	$: tradePanelOffset = $tradePanelOpen ? 352 : 0;
	// Base = the width the full nav cluster actually needs (~1100px of content +
	// margin). The sidebar/trade-panel offsets account for horizontal space those
	// take away from the header, so a full-size laptop keeps the inline nav and only
	// collapses to the hamburger when the sidebar + order panel are both open.
	$: effectiveBreakpoint = 1180 + sidebarOffset + tradePanelOffset;
	$: isHamburgerMode = windowWidth < effectiveBreakpoint;
	// Share the collapse signal so the bottom MobileTabBar shows exactly when the
	// inline header nav hides — no width band is left without navigation.
	$: navCollapsed.set(isHamburgerMode);

	onMount(() => {
		windowWidth = window.innerWidth;
		const handleResize = () => (windowWidth = window.innerWidth);
		window.addEventListener('resize', handleResize);
		document.addEventListener('click', handleClickOutsideAccountMenu);
		return () => {
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('click', handleClickOutsideAccountMenu);
		};
	});

	function handleConnectWallet() {
		// For wallet users who are already connected, open wallet modal to manage/disconnect
		if ($authMethod === 'wallet') {
			$web3Modal.open();
		} else {
			// Show unified auth modal for new connections
			openAuthModal();
		}
	}

	function handleDisconnect() {
		if ($authMethod === 'dynamic') {
			logoutDynamic();
		} else {
			$web3Modal.open();
		}
	}

	// Truncate email to show first 3 chars + @domain (e.g., "ala...@gmail.com")
	function truncateEmail(email: string): string {
		const atIndex = email.indexOf('@');
		if (atIndex <= 3) return email;
		return `${email.slice(0, 3)}...${email.slice(atIndex)}`;
	}
</script>

<div
	class="bg-bg/80 sticky top-0 z-[100] border-b border-line backdrop-blur-xl transition-all duration-300"
>
	<div class="px-4 py-3 sm:px-6">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-5">
				<a href="/" aria-label="Go to home" class="shrink-0">
					<img
						src="/images/logo-sidebar.svg"
						alt="ST0x Logo"
						class="logo-img h-7 w-auto sm:h-8 lg:h-10"
					/>
				</a>
				{#if title}
					<div class="ml-2 hidden lg:block">
						<h1 class="text-base font-bold">{title}</h1>
					</div>
				{/if}
			</div>

			<div class="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
				{#if !isHamburgerMode}
					<div class="flex flex-nowrap items-center gap-1">
						{#each NAV_ITEMS as item}
							<a
								href={item.href}
								class="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors {item.isActive ||
								activePath === item.href
									? 'bg-white/10 text-text'
									: 'text-text-2 hover:bg-white/5 hover:text-text'}"
							>
								{item.name}
								{#if item.showAlpha}
									<span
										class="rounded-full bg-iris-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-iris-300"
										>Alpha</span
									>
								{/if}
							</a>
						{/each}
					</div>
				{/if}

				<ThemeToggle />
				<NetworkSelector />

				{#if $authMethod === 'dynamic' && $dynamicSession}
					<!-- Dynamic authenticated user -->
					<div class="account-menu-container relative">
						<button
							class="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-400 px-2.5 py-2 text-sm font-semibold text-[#053124] shadow-[0_10px_30px_-10px_rgba(45,227,166,0.45)] transition hover:brightness-105 sm:px-3.5"
							on:click={toggleAccountMenu}
						>
							{#if isHamburgerMode}
								<Icon name="wallet" className="h-4 w-4" />
							{:else}
								<span>My Dashboard</span>
								<span class="font-mono text-[11px] font-medium text-emerald-900/70">
									{$dynamicSession.email
										? truncateEmail($dynamicSession.email)
										: `·${$dynamicSession.walletAddress.slice(-4)}`}
								</span>
							{/if}
							<Icon
								name="chevronDown"
								className="h-4 w-4 text-emerald-900/60 transition-transform {accountMenuOpen
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if accountMenuOpen}
							<div
								class="absolute right-0 top-full z-[110] mt-1 w-48 rounded-lg border border-line bg-surface-1 py-1 shadow-xl"
							>
								<a
									href="/dashboard"
									class="flex items-center gap-2 px-4 py-2.5 text-sm text-text-2 transition-colors hover:bg-surface-2"
									on:click={closeAccountMenu}
								>
									<Icon name="blocks" className="h-4 w-4" />
									Dashboard
								</a>
								<button
									class="hover:bg-down/10 flex w-full items-center gap-2 px-4 py-2.5 text-sm text-down transition-colors"
									on:click={() => {
										closeAccountMenu();
										handleDisconnect();
									}}
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
										/>
									</svg>
									Log out
								</button>
							</div>
						{/if}
					</div>
				{:else if $isAuthenticated && !$wrongNetwork && $walletAddress}
					<!-- Wallet user -->
					<div class="account-menu-container relative">
						<button
							class="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-400 px-2.5 py-2 text-sm font-semibold text-[#053124] shadow-[0_10px_30px_-10px_rgba(45,227,166,0.45)] transition hover:brightness-105 sm:px-3.5"
							on:click={toggleAccountMenu}
						>
							{#if isHamburgerMode}
								<Icon name="wallet" className="h-4 w-4" />
							{:else}
								<span>My Dashboard</span>
								<span class="font-mono text-[11px] font-medium text-emerald-900/70">
									·{$walletAddress?.slice(-4)}
								</span>
							{/if}
							<Icon
								name="chevronDown"
								className="h-4 w-4 text-emerald-900/60 transition-transform {accountMenuOpen
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if accountMenuOpen}
							<div
								class="absolute right-0 top-full z-[110] mt-1 w-48 rounded-lg border border-line bg-surface-1 py-1 shadow-xl"
							>
								<a
									href="/dashboard"
									class="flex items-center gap-2 px-4 py-2.5 text-sm text-text-2 transition-colors hover:bg-surface-2"
									on:click={closeAccountMenu}
								>
									<Icon name="blocks" className="h-4 w-4" />
									Dashboard
								</a>
								<button
									class="hover:bg-down/10 flex w-full items-center gap-2 px-4 py-2.5 text-sm text-down transition-colors"
									on:click={() => {
										closeAccountMenu();
										handleDisconnect();
									}}
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
										/>
									</svg>
									Disconnect
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Not connected -->
					<Button
						on:click={handleConnectWallet}
						variant="primary"
						size="sm"
						className="px-3 py-2 text-sm whitespace-nowrap"
					>
						Connect or Log In
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* The wordmark SVG is white/cream (drawn for dark backgrounds). In light mode
	   darken it to a near-black silhouette so it stays legible on the light shell. */
	:global([data-theme='light']) .logo-img {
		filter: brightness(0);
	}
</style>
