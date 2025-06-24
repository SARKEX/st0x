<script lang="ts">
	import { targetNetwork } from '$lib/stores';
	import { signerAddress, connected } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { WalletOutline, ArrowUpRightFromSquareSolid } from 'flowbite-svelte-icons';
	import TelegramLogo from '$lib/images/telegram.svg';

	export let sidebarExpanded = true;

	const NAVIGATION_ITEMS = [
		{ name: 'Dashboard', href: '/', protected: false },
		{ name: 'Mint', href: '/mint', protected: false },
		{ name: 'Burn', href: '/burn', protected: false },
		{ name: 'Token List', href: '/tokens', protected: false },
		{ name: 'New Order', href: '/neworder', protected: true },
		{ name: 'Order List', href: '/orderlist', protected: true },
		{ name: 'Vault List', href: '/vaultlist', protected: true }
	];

	$: activePath = $page.url.pathname;
</script>

<div
	class="fixed left-0 top-0 z-50 h-full border-r border-white/10 bg-gray-800/95 backdrop-blur-lg transition-all duration-300 ease-in-out {sidebarExpanded
		? 'w-64'
		: 'w-16'}"
>
	<div class="border-b border-white/10 p-4">
		<div class="flex items-center gap-2 md:gap-3">
			<a href="/dashboard">
				<img src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75" alt="ST0x Logo" class="h-8 w-8 md:h-9 md:w-9 rounded-full" />
			</a>
			<a href="/dashboard">
				<span class="text-base md:text-xl font-extrabold bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-transparent select-none tracking-tight">ST0X Liquidity</span>
			</a>
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
					: item.protected && !$connected
						? 'text-blue-400/60 hover:text-blue-300'
						: 'text-gray-400 hover:bg-white/5 hover:text-white'}"
			>
				{#if sidebarExpanded}
					<span>{item.name}</span>
					{#if item.protected && !$connected}
						<WalletOutline class="ml-auto h-5 w-5" />
					{:else if activePath === item.href}
						<div class="ml-auto h-2 w-2 rounded-full bg-yellow-500" />
					{/if}
				{:else}
					<div class="mx-auto">{item.name.charAt(0)}</div>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Bottom Section -->
	

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
	<div class="mt-4 flex flex-col gap-1 p-4 border-t border-b border-white/10">
		<a href="/docs" class="flex items-center gap-2 text-gray-300 font-normal text-base hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-white/5">
			<ArrowUpRightFromSquareSolid class="h-5 w-5" />
			Docs
		</a>
		<a href="https://t.me/your_telegram_link" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-gray-300 font-normal text-base hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-white/5">
			<img src={TelegramLogo} alt="Telegram" class="h-5 w-5" />
			Telegram
		</a>
	</div>
</div>
