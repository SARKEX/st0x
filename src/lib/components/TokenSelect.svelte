<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import type { Token } from 'sushi/currency';

	export let options: Token[] = [];
	export let selected: Token;
	export let placeholder: string = 'Select a token';

	const dispatch = createEventDispatcher();

	let isOpen = false;
	let dropdownElement: HTMLElement;

	// Close dropdown when clicking outside
	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
				isOpen = false;
			}
		};

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function handleSelect(token: Token) {
		selected = token;
		isOpen = false;
		dispatch('change', { token });
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}
</script>

<div class="relative" bind:this={dropdownElement}>
	<!-- Selected value display -->
	<button
		type="button"
		class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors hover:border-yellow-500/50 focus:border-yellow-500/50 focus:outline-none"
		on:click={toggleDropdown}
	>
		<div class="flex items-center gap-3">
			{#if selected?.logoUrl}
				<img src={selected.logoUrl} alt={selected.symbol} class="h-6 w-6 rounded-full" />
			{/if}
			<span class="font-medium">{selected?.symbol || placeholder}</span>
		</div>
		<svg
			class="h-5 w-5 transform transition-transform {isOpen ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Dropdown options -->
	{#if isOpen}
		<div
			class="absolute left-0 z-50 mt-1 w-full rounded-lg border border-white/10 bg-gray-800/90 shadow-xl"
		>
			<div class="max-h-60 overflow-y-auto py-1">
				{#each options as token (token.address)}
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-white transition-colors
							hover:bg-gray-700/70 focus:outline-none {selected?.address === token.address
							? 'bg-gradient-to-r from-blue-600/20 to-purple-700/20'
							: ''}"
						on:click={() => handleSelect(token)}
					>
						{#if token.logoUrl}
							<img src={token.logoUrl} alt={token.symbol} class="h-6 w-6 rounded-full" />
						{/if}
						<span class="font-medium">{token.symbol}</span>
						{#if token.name && token.name !== token.symbol}
							<span class="text-sm text-gray-400">({token.name})</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
