<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import { signerAddress, connected } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import WalletIcon from '$lib/components/icons/IconWalletOutline.svelte';
	import ExternalLinkIcon from '$lib/components/icons/IconExternalLink.svelte';
	import ShareButton from './ShareButton.svelte';

	export let visible: boolean = false; // controlled by parent
	export let desktop: boolean = false; // is this the desktop sidebar?

	const NAVIGATION_ITEMS = [
		{ name: 'Trade', href: '/trade-list', protected: false },
		{ name: 'Strategies', href: '/strategies', protected: false },
		{ name: 'My Dashboard', href: '/dashboard', protected: true },
		{ name: 'Platform Metrics', href: '/platform-metrics', protected: false }
	];

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	$: activePath = $page.url.pathname;
</script>

<!-- Overlay for mobile -->
{#if visible && !desktop}
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		role="button"
		tabindex="0"
		on:click={() => dispatch('close')}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') dispatch('close');
		}}
	/>
{/if}

<!-- Sidebar -->
<div
	class="fixed left-0 top-0 z-[10000] flex h-full w-64 max-w-[80vw] transform flex-col border-b border-r border-white/10 bg-gray-800/95 backdrop-blur-lg transition-transform duration-300 ease-in-out"
	class:translate-x-0={visible || desktop}
	class:-translate-x-full={!visible && !desktop}
>
	<!-- Logo -->
	<div class="p-4">
		<div class="flex items-center gap-2">
			<a href="/trade-list">
				<img
					src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
					alt="ST0x Logo"
					class="h-8 w-8 rounded-full md:h-9 md:w-9"
				/>
			</a>
			<a href="/trade-list">
				<span
					class="select-none bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-base font-extrabold tracking-tight text-transparent md:text-xl"
					>ST0x</span
				>
			</a>
		</div>
	</div>

	<!-- Navigation (scrollable) -->
	<div class="flex-1 space-y-2 overflow-y-auto p-4">
		{#each NAVIGATION_ITEMS as item}
            <a
                href={item.href}
                on:click={() => {
                    if (!desktop) dispatch('close');
                }}
                class="flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-all {activePath ===
				item.href
					? 'border border-yellow-500/30 bg-yellow-500/20 text-yellow-500'
					: item.protected && !$connected
						? 'text-blue-400/60 hover:text-blue-300'
						: 'text-gray-400 hover:bg-white/5 hover:text-white'}"
            >
                <span class="flex items-center gap-2">
                    {item.name}
                    {#if item.name === 'Strategies'}
                        <span class="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-400 uppercase tracking-wide">Alpha</span>
                    {/if}
                </span>
                {#if item.protected && !$connected}
                    <WalletIcon class="ml-auto h-5 w-5" />
                {:else if activePath === item.href}
                    <div class="ml-auto h-2 w-2 rounded-full bg-yellow-500" />
                {/if}
			</a>
		{/each}
	</div>

	<!-- Bottom Info -->
	<div class="border-t border-white/10 bg-gray-800/95 p-4">
		<div class="flex w-full flex-col gap-3">
			<div class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3">
				<div class="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between">
					<div class="text-sm font-semibold text-yellow-500">{$currentNetwork.name}</div>
                        {#if $connected}
                            <div class="text-xs text-gray-400 sm:ml-2">
                                <span class="sm:hidden">…{$signerAddress?.slice(-6)}</span>
                                <span class="hidden sm:inline">{$signerAddress?.slice(0, 6)}...{$signerAddress?.slice(-4)}</span>
                            </div>
					{:else}
						<div class="text-xs text-gray-400 sm:ml-2">Not Connected</div>
					{/if}
				</div>
			</div>
			<a
				href="/docs"
				class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-base font-normal text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
			>
				<ExternalLinkIcon class="h-5 w-5" />
				<span>Docs</span>
			</a>
			<ShareButton />
		</div>
	</div>
</div>
