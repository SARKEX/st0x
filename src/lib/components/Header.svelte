<script lang="ts">
	import TickerTape from './TickerTape.svelte';
	import WalletConnect from './WalletConnect.svelte';
	import NetworkSelector from './NetworkSelector.svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let title: string;
	export let description: string;

	const dispatch = createEventDispatcher();

	function openMobileMenu() {
		dispatch('openMenu');
	}
</script>

<div class="sticky top-0 z-[100] border-b border-white/10 bg-gray-800/95 backdrop-blur-lg">
	<div class="hidden sm:block"><TickerTape /></div>
	<div class="px-4 py-2 sm:px-6 sm:py-3">
		<!-- Mobile layout -->
		<div class="flex items-center justify-between gap-3 sm:hidden">
			<!-- Left: Menu button -->
			<Button
				variant="ghost"
				size="sm"
				className="p-2"
				aria-label="Open menu"
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

			<!-- Center: Logo -->
			<a href="/" aria-label="Go to home" class="absolute left-1/2 -translate-x-1/2">
				<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-8 w-auto" />
			</a>

			<!-- Right: Network and Wallet -->
			<div class="flex items-center gap-2">
				<NetworkSelector />
				<WalletConnect />
			</div>
		</div>

		<!-- Desktop layout -->
		<div class="hidden items-center justify-between gap-3 sm:flex">
			<!-- Left side: Menu button and title/description -->
			<div class="flex items-center gap-3">
				<Button
					variant="ghost"
					size="sm"
					className="p-2 lg:hidden"
					aria-label="Open menu"
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
				<div>
					<h1 class="text-base font-bold sm:text-lg">{title}</h1>
					<p class="text-xs text-gray-400">{description}</p>
				</div>
			</div>

			<!-- Center: Logo -->
			<a href="/" aria-label="Go to home" class="absolute left-1/2 -translate-x-1/2">
				<img src="/images/logo-sidebar.svg" alt="ST0x Logo" class="h-10 w-auto" />
			</a>

			<!-- Right side: Controls -->
			<div class="flex items-center gap-4">
				<NetworkSelector />
				<WalletConnect />
			</div>
		</div>
	</div>
</div>
