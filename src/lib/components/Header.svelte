<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { goto } from '$app/navigation';

	export let title: string;
	export let description: string;
</script>

<div
	class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-4 py-1 backdrop-blur-lg sm:px-6 sm:py-2"
>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<div class="flex items-center gap-3 sm:gap-4">
			<div>
				<h1 class="text-base font-bold sm:text-lg">{title}</h1>
				<p class="text-xs text-gray-400">{description}</p>
			</div>
		</div>

		<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
			<button
				class="hidden w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 sm:inline-flex sm:w-auto sm:px-5 sm:py-2.5"
				on:click={() => goto('/neworder')}
			>
				Trade now
			</button>
			<WalletConnect />
		</div>
	</div>
</div>
