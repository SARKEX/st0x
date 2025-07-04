<script lang="ts">
	import type { LayoutData } from './$types';
	import { BarsOutline } from 'flowbite-svelte-icons';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import SocialLinks from '$lib/components/SocialLinks.svelte';
	export let data: LayoutData;

	let mobileMenuOpen = false;
	const toggleMenu = () => {
		mobileMenuOpen = !mobileMenuOpen;
	};

	// For header nav collapse
	let mobileHeaderMenuOpen = false;
	const toggleHeaderMenu = () => {
		mobileHeaderMenuOpen = !mobileHeaderMenuOpen;
	};
</script>

<!-- Docs Header -->
<div
	class="sticky top-0 z-[1000] border-b border-white/10 bg-gray-900/90 px-4 py-3 backdrop-blur-md"
>
	<div class="flex items-center justify-between">
		<!-- Left: Logo and Title -->
		<div class="flex items-center gap-2 md:gap-3">
			<a href="/dashboard">
				<img
					src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
					alt="St0x Logo"
					class="h-8 w-8 rounded-full md:h-9 md:w-9"
				/>
			</a>
			<a href="/dashboard">
				<span
					class="select-none bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-base font-extrabold tracking-tight text-transparent md:text-xl"
					>St0x Liquidity</span
				>
			</a>
		</div>
		<!-- Hamburger (mobile only) -->
		<button class="ml-1 md:hidden" on:click={toggleHeaderMenu}>
			<BarsOutline class="text-white" size="xl" />
		</button>
		<!-- Right: Nav, Social, Wallet (desktop only) -->
		<div class="hidden items-center gap-6 md:flex">
			<a href="/dashboard" class="text-lg text-white transition-colors hover:text-yellow-400"
				>Dashboard</a
			>
			<a href="/neworder" class="text-lg text-white transition-colors hover:text-yellow-400"
				>New Order</a
			>
			<SocialLinks />
			<WalletConnect />
		</div>
	</div>
	<!-- Mobile dropdown menu -->
	{#if mobileHeaderMenuOpen}
		<div class="mt-2 flex flex-col gap-2 md:hidden">
			<a href="/dashboard" class="text-lg text-white transition-colors hover:text-yellow-400"
				>Dashboard</a
			>
			<a href="/neworder" class="text-lg text-white transition-colors hover:text-yellow-400"
				>New Order</a
			>
			<SocialLinks />
			<WalletConnect />
		</div>
	{/if}
</div>

<!-- Mobile Header -->
<div
	class="sticky top-0 z-[999] flex h-[var(--header-height)] flex-row items-center gap-x-2 border-b border-white/10 bg-gray-800/80 px-2 py-6 text-white backdrop-blur-sm md:hidden md:p-4"
>
	<BarsOutline
		class="block cursor-pointer text-gray-300 transition-colors hover:text-white"
		size="xl"
		withEvents
		on:click={toggleMenu}
		data-testid="menu-icon"
	/>
</div>

<!-- Main Layout -->
<div class="z-0 flex min-h-screen flex-col bg-gray-900 text-white md:flex-row">
	<!-- Sidebar -->
	<div
		data-testid="side-menu"
		class:left-0={mobileMenuOpen}
		class="fixed -left-full z-[999] h-[calc(100vh-56px)] w-full min-w-80 overflow-auto border-b border-white/10 bg-gray-800/80 p-4 backdrop-blur-sm transition-all md:sticky md:left-0 md:top-[56px] md:w-80 md:border-b-0 md:border-r"
	>
		<ul class="container flex flex-col gap-y-2 md:mx-auto">
			{#each data.categorisedArticles as { articles }}
				{#each articles as { slug, title }}
					<li>
						<a
							on:click={toggleMenu}
							data-testid="doc-title"
							href={`${slug}`}
							class="rounded-lg px-3 py-2 text-lg text-gray-100 transition-colors hover:bg-white/10 hover:text-yellow-400"
						>
							{title}
						</a>
					</li>
				{/each}
			{/each}
		</ul>
	</div>

	<!-- Content Area -->
	<div class="flex-1">
		<div class="prose prose-invert max-w-[100ch] p-4 md:p-8">
			<slot />
		</div>
	</div>
</div>
