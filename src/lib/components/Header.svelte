<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { goto } from '$app/navigation';

	export let title: string;
	export let description: string;
</script>

<div
	class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-4 py-3 backdrop-blur-lg sm:px-6 sm:py-4"
>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<div class="flex items-center gap-3 sm:gap-4">
			<div>
				<h1 class="text-lg font-bold sm:text-xl">{title}</h1>
				<p class="text-xs text-gray-400 sm:text-sm">{description}</p>
			</div>
		</div>

		<div class="flex items-center gap-2 sm:gap-4">
			<button
				class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-3 py-2 text-xs font-semibold text-white transition-transform hover:scale-105 sm:px-5 sm:py-2.5 sm:text-sm"
				on:click={() => goto('/neworder')}
			>
				Trade now
			</button>
			<WalletConnect />
		</div>
	</div>
</div>
