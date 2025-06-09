<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { targetNetwork, wrongNetwork } from '$lib/stores';
  import { signerAddress, connected } from 'svelte-wagmi';
  import { page } from '$app/stores';
  import WalletConnect from './WalletConnect.svelte';
  import Button from './Button.svelte';
  export let sidebarOpen = false;
  const dispatch = createEventDispatcher();

  const NAVIGATION_ITEMS = [
    { name: 'Dashboard', href: '/' },
    { name: 'Mint', href: '/mint' },
    { name: 'Burn', href: '/burn' },
    { name: 'Docs', href: '/docs' }
  ];

  $: activePath = $page.url.pathname;
</script>

<Button class="fixed top-4 left-4 z-50 flex items-center justify-center md:hidden bg-gray-900 rounded-lg p-2 border border-white/10" on:click={() => dispatch('toggle')} aria-label="Open sidebar">
  <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
</Button>

<div class="fixed left-0 top-0 h-full w-64 bg-gray-900 backdrop-blur-lg border-r border-white/10 z-50 flex-col transition-transform duration-300
  hidden md:flex"
  class:block={sidebarOpen}
  tabindex="-1"
  aria-label="Sidebar"
>
	<div class="p-4 border-b border-white/10 mt-10 md:mt-0">
		<div class="flex items-center gap-3">
			<div class="w-10 h-10 bg-gradient-to-br from-purple-800 via-blue-600 to-yellow-500 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg shadow-yellow-500/30 relative overflow-hidden">
				<span class="relative z-10">ST0x</span>
				<div class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-white/10 to-transparent rotate-45 animate-pulse" />
			</div>
			<div>
				<div class="font-semibold">ST0x</div>
				<div class="text-xs text-gray-400">Onchain Equities</div>
			</div>
		</div>
	</div>

	<div class="p-4 border-b border-white/10">
		<WalletConnect />
	</div>

	<nav class="p-4 space-y-2 flex-grow">
		{#each NAVIGATION_ITEMS as item}
			<a
			href={item.href}
			class="flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium {activePath === item.href 
				? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' 
				: 'text-gray-400 hover:text-white hover:bg-white/5'}"
			>
			{item.name}
			{#if activePath === item.href}
				<div class="ml-auto w-2 h-2 bg-yellow-500 rounded-full" />
			{/if}
			</a>
		{/each}
	</nav> 
</div>

<div class="ml-64">
  <slot />
</div>