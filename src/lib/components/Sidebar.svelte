<script lang="ts">
	import { targetNetwork } from '$lib/stores';
	import { signerAddress, connected } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import { WalletOutline, ArrowUpRightFromSquareSolid } from 'flowbite-svelte-icons';
	import TelegramLogo from '$lib/images/telegram.svg';

	export let visible: boolean = false; // controlled by parent
	export let desktop: boolean = false; // is this the desktop sidebar?

	const NAVIGATION_ITEMS = [
		{ name: 'Dashboard', href: '/', protected: false },
		{ name: 'Mint', href: '/mint', protected: false },
		{ name: 'Burn', href: '/burn', protected: false },
		{ name: 'Token List', href: '/tokens', protected: false },
		{ name: 'New Order', href: '/neworder', protected: true },
		{ name: 'Order List', href: '/orderlist', protected: true },
		{ name: 'Vault List', href: '/vaultlist', protected: true }
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
		on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') dispatch('close'); }}
	/>
{/if}

<!-- Sidebar -->
<div
	class="fixed top-0 left-0 z-50 h-full w-64 transform border-r border-white/10 bg-gray-800/95 backdrop-blur-lg transition-transform duration-300 ease-in-out"
	class:translate-x-0={visible || desktop}
	class:-translate-x-full={!visible && !desktop}
>
	<!-- Logo -->
	<div class="border-b border-white/10 p-4">
		<div class="flex items-center gap-2">
			<a href="/dashboard">
				<img
					src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
					alt="ST0x Logo"
					class="h-8 w-8 rounded-full md:h-9 md:w-9"
				/>
			</a>
			<a href="/dashboard">
				<span
					class="select-none bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-base font-extrabold tracking-tight text-transparent md:text-xl"
					>ST0X Liquidity</span
				>
			</a>
		</div>
	</div>

	<!-- Navigation -->
	<div class="space-y-2 p-4">
		{#each NAVIGATION_ITEMS as item}
			<a
				href={item.href}
				on:click={() => {
					if (!desktop) dispatch('close');
				}}
				class="flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-all {activePath === item.href
					? 'border border-yellow-500/30 bg-yellow-500/20 text-yellow-500'
					: item.protected && !$connected
						? 'text-blue-400/60 hover:text-blue-300'
						: 'text-gray-400 hover:bg-white/5 hover:text-white'}"
			>
				<span>{item.name}</span>
				{#if item.protected && !$connected}
					<WalletOutline class="ml-auto h-5 w-5" />
				{:else if activePath === item.href}
					<div class="ml-auto h-2 w-2 rounded-full bg-yellow-500" />
				{/if}
			</a>
		{/each}
	</div>

	<!-- Bottom Info -->
	<div class="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-gray-800/95 p-4">
		<div class="flex w-full flex-col gap-3">
			<div class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3">
				<div class="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between">
					<div class="text-sm font-semibold text-yellow-500">{$targetNetwork.name}</div>
					{#if $connected}
						<div class="text-xs text-gray-400 sm:ml-2">
							{$signerAddress?.slice(0, 6)}...{$signerAddress?.slice(-4)}
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
				<ArrowUpRightFromSquareSolid class="h-5 w-5" />
				<span>Docs</span>
			</a>
			<a
				href="https://t.me/toby_meller"
				target="_blank"
				rel="noopener noreferrer"
				class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-base font-normal text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
			>
				<img src={TelegramLogo} alt="Telegram" class="h-5 w-5" />
				<span>Telegram</span>
			</a>
		</div>
	</div>
</div>
