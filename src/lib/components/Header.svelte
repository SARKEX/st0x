<script lang="ts">
	import TickerTape from './TickerTape.svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { connected, signerAddress, web3Modal } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { wrongNetwork } from '$lib/stores';

	export let title: string;
	export let description: string;

	const dispatch = createEventDispatcher();

	let mobileNavOpen = false;

	function openMobileMenu() {
		dispatch('openMenu');
	}

	function toggleMobileNav() {
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

	const DESKTOP_NAV_WIDTH = 'w-44';
</script>

<div class="sticky top-0 z-[100] border-b border-white/10 bg-gray-800/95 backdrop-blur-lg">
	<div class="hidden sm:block"><TickerTape /></div>
	<div class="px-4 py-2 sm:px-6 sm:py-3">
		<!-- Mobile/Tablet layout -->
		<div class="flex items-center justify-between gap-3 md:hidden">
			<!-- Left: Logo and Sidebar menu button -->
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="p-2"
					aria-label="Open sidebar"
					on:click={openMobileMenu}
				>
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							fill-rule="evenodd"
							d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
							clip-rule="evenodd"
						></path>
					</svg>
				</Button>
				<a href="/" aria-label="Go to home">
					<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-8 w-auto" />
				</a>
			</div>

			<!-- Right: Hamburger menu button -->
			<Button
				variant="ghost"
				size="sm"
				className="p-2"
				aria-label="Open navigation"
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
		</div>

		<!-- Desktop layout -->
		<div class="hidden items-center justify-between gap-4 md:flex">
			<!-- Left side: Logo, title/description -->
			<div class="flex items-center gap-4">
				<a href="/" aria-label="Go to home" class="shrink-0">
					<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-10 w-auto" />
				</a>
				<div class="ml-2">
					<h1 class="text-base font-bold sm:text-lg">{title}</h1>
					<p class="text-xs text-gray-400">{description}</p>
				</div>
			</div>

			<!-- Right side: Navigation, Wallet -->
			<div class="flex items-center gap-3">
				<!-- Navigation Links -->
				{#each NAV_ITEMS as item}
					<a
						href={item.href}
						class={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${DESKTOP_NAV_WIDTH} ${
							activePath === item.href
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-300 hover:bg-white/5 hover:text-white'
						}`}
					>
						<span class="flex items-center gap-1.5">
							{item.name}
							{#if item.showAlpha}
								<span
									class="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-yellow-400"
									>Alpha</span
								>
							{/if}
						</span>
					</a>
				{/each}

				<!-- Wallet / My Dashboard Button -->
				{#if $connected && !$wrongNetwork && $signerAddress}
					<div class="flex items-center gap-2">
						<a href="/dashboard">
							<Button variant="primary" size="sm" className="px-3 py-2 text-sm">
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
						className="px-3 py-2 text-sm"
					>
						Connect Wallet
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Mobile/Tablet Navigation Dropdown -->
{#if mobileNavOpen}
	<div
		class="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm md:hidden"
		role="button"
		tabindex="0"
		on:click={closeMobileNav}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') closeMobileNav();
		}}
	/>
	<div class="fixed left-0 right-0 top-[60px] z-[99] border-b border-white/10 bg-gray-800/95 backdrop-blur-lg md:hidden">
		<div class="flex flex-col gap-2 p-4">
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
			<div class="my-2 border-t border-white/10"></div>
			{#if $connected && !$wrongNetwork && $signerAddress}
				<a href="/dashboard" on:click={closeMobileNav}>
					<Button variant="primary" size="sm" fullWidth={true} className="mb-2">
						My Dashboard
					</Button>
				</a>
				<Button
					variant="ghost"
					size="sm"
					fullWidth={true}
					on:click={() => {
						$web3Modal.open();
						closeMobileNav();
					}}
				>
					<div class="flex items-center justify-center gap-2">
						<span>Disconnect Wallet</span>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
							/>
						</svg>
					</div>
				</Button>
			{:else}
				<Button
					on:click={() => {
						$web3Modal.open();
						closeMobileNav();
					}}
					variant="primary"
					size="sm"
					fullWidth={true}
				>
					Connect Wallet
				</Button>
			{/if}
		</div>
	</div>
{/if}
