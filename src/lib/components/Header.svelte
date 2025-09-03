<script lang="ts">
	import TickerTape from './TickerTape.svelte';
	import WalletConnect from './WalletConnect.svelte';
	import NetworkSelector from './NetworkSelector.svelte';
	import { goto } from '$app/navigation';
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
	<div class="px-4 py-1 sm:px-6 sm:py-2">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
			<div class="flex items-center gap-3 sm:gap-4">
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
				<a href="/trade-list" aria-label="Go to trade list" class="hidden md:flex items-center gap-2">
					<img
						src="https://st0x.io/_next/image?url=%2Fimages%2Flogo-circle.png&w=256&q=75"
						alt="ST0x Logo"
						class="h-8 w-8 rounded-full"
					/>
					<span
						class="bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
					>
						ST0x
					</span>
				</a>
				<div>
					<h1 class="text-base font-bold sm:text-lg">{title}</h1>
					<p class="text-xs text-gray-400">{description}</p>
				</div>
			</div>

			<div class="flex w-full flex-wrap gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
				<NetworkSelector />
				<Button
					variant="primary"
					size="md"
					fullWidth={true}
					className="inline-flex w-full shrink-0 sm:w-auto sm:px-5 sm:py-2.5"
					on:click={() => goto('/trade-list')}
				>
					Trade Now
				</Button>
				<WalletConnect />
			</div>
		</div>
	</div>
</div>
