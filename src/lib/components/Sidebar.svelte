<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { targetNetwork, wrongNetwork } from '$lib/stores';
	import { signerAddress, connected } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import WalletConnect from './WalletConnect.svelte';
	import Button from './Button.svelte';

	export let sidebarExpanded = true;
	export let toggleSidebar = () => {};

	const NAVIGATION_ITEMS = [
		{ name: 'Dashboard', href: '/' },
		{ name: 'Mint', href: '/mint' },
		{ name: 'Burn', href: '/burn' },
		{ name: 'Token List', href: '/tokens' },
		{ name: 'New Order', href: '/neworder' },
		{ name: 'Order List', href: '/orderlist' },
		{ name: 'Vault List', href: '/vaultlist' }
	];

	$: activePath = $page.url.pathname;
</script>

<div
	class="fixed left-0 top-0 z-50 h-full border-r border-white/10 bg-gray-800/95 backdrop-blur-lg transition-all duration-300 ease-in-out {sidebarExpanded
		? 'w-64'
		: 'w-16'}"
>
	<div class="border-b border-white/10 p-4">
		<div class="flex items-center gap-3">
			<button
				on:click={toggleSidebar}
				class="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
			>
				<span class="text-xl">☰</span>
			</button>
			{#if sidebarExpanded}
				<div class="flex items-center gap-3">
					<div
						class="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-purple-800 via-blue-600 to-yellow-500 text-sm font-bold shadow-lg shadow-yellow-500/30"
					>
						<span class="relative z-10">ST0x</span>
						<div
							class="absolute -left-1/2 -top-1/2 h-full w-full rotate-45 animate-pulse bg-gradient-to-br from-white/10 to-transparent"
						/>
					</div>
					<div>
						<div class="font-semibold">ST0x</div>
						<div class="text-xs text-gray-400">Onchain Equities</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Navigation -->
	<nav class="space-y-2 p-4">
		{#each NAVIGATION_ITEMS as item}
			<a
				href={item.href}
				class="flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-all {activePath ===
				item.href
					? 'border border-yellow-500/30 bg-yellow-500/20 text-yellow-500'
					: 'text-gray-400 hover:bg-white/5 hover:text-white'}"
			>
				{#if sidebarExpanded}
					{item.name}
					{#if activePath === item.href}
						<div class="ml-auto h-2 w-2 rounded-full bg-yellow-500" />
					{/if}
				{:else}
					<div class="mx-auto">{item.name.charAt(0)}</div>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Bottom Section -->
	<div class="absolute bottom-0 left-0 right-0 border-t border-white/10 p-4">
		<div class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
			{#if sidebarExpanded}
				<div class="flex-1">
					<div class="text-sm font-semibold text-yellow-500">{$targetNetwork.name}</div>
					{#if $connected}
						<div class="text-xs text-gray-400">
							{$signerAddress?.slice(0, 6)}...{$signerAddress?.slice(-4)}
						</div>
					{:else}
						<div class="text-xs text-gray-400">Not Connected</div>
					{/if}
				</div>
			{:else}
				<div class="mx-auto text-xs font-semibold text-yellow-500">{$targetNetwork.name}</div>
			{/if}
		</div>
	</div>
</div>
