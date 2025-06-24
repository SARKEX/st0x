<script lang="ts">
	import type { LayoutData } from './$types';
	import { BarsOutline } from 'flowbite-svelte-icons';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	export let data: LayoutData;

	let mobileMenuOpen = false;
	const toggleMenu = () => {
		mobileMenuOpen = !mobileMenuOpen;
	};
</script>

<!-- Docs Header -->
<div class="sticky top-0 z-[1000] flex items-center justify-between border-b border-white/10 bg-gray-900/90 px-4 py-3 backdrop-blur-md">
	<div class="flex items-center gap-2">
		<a href="/dashboard">
			<img src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75" alt="ST0x Logo" class="h-9 w-9 rounded-full" />
		</a>
	</div>
	<div class="flex items-center gap-6">
		<a href="/dashboard" class="text-white hover:text-yellow-400 transition-colors">Dashboard</a>
		<a href="/neworder" class="text-white hover:text-yellow-400 transition-colors">New Order</a>
	</div>
</div>

<!-- Mobile Header -->
<div
	class="sticky top-0 z-[999] flex h-[var(--header-height)] flex-row items-center gap-x-2 border-b border-white/10 bg-gray-800/80 backdrop-blur-sm px-2 py-6 text-white md:hidden md:p-4"
>
	<BarsOutline
		class="block cursor-pointer text-gray-300 hover:text-white transition-colors"
		size="xl"
		withEvents
		on:click={toggleMenu}
		data-testid="menu-icon"
	/>
</div>

<!-- Main Layout -->
<div class="z-0 flex flex-col bg-gray-900 text-white md:flex-row min-h-screen">
	<!-- Sidebar -->
	<div
		data-testid="side-menu"
		class:left-0={mobileMenuOpen}
		class="fixed -left-full z-[999] h-[calc(100vh-56px)] w-full min-w-56 overflow-auto border-b border-white/10 bg-gray-800/80 backdrop-blur-sm p-4 transition-all md:sticky md:left-0 md:top-[56px] md:w-56 md:border-r md:border-b-0"
	>
		<ul class="container flex flex-col gap-y-8 md:mx-auto">
			{#each data.categorisedArticles as { category, articles }}
				<li class="flex flex-col gap-y-2">
					{#if category}
						<div class="mb-1 mt-2 text-lg font-normal text-white">
							{category}
						</div>
					{/if}
					{#each articles as { slug, title }}
						{#if !((typeof title === 'string' && typeof category === 'string') && title.trim().toLowerCase() === category.trim().toLowerCase())}
							<a 
								on:click={toggleMenu} 
								data-testid="doc-title" 
								href={`${slug}`}
								class="text-gray-100 font-medium text-4xl hover:text-yellow-400 transition-colors py-2 px-3 rounded-lg hover:bg-white/10"
							>
								{title}
							</a>
						{/if}
					{/each}
					<hr class="my-2 border-t border-white/10 last:hidden" />
				</li>
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
