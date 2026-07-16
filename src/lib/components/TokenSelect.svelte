<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import Icon from '$lib/components/ui/Icon.svelte';
	import AssetDisc from '$lib/components/ui/AssetDisc.svelte';

	export let options: CategorizedToken[] = [];
	export let selected: CategorizedToken | undefined;
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

	function handleSelect(token: CategorizedToken) {
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
		class="flex w-full items-center justify-between rounded-lg border border-line bg-surface-3 px-4 py-3 text-text transition-colors hover:border-accent-line focus:border-accent-line focus:outline-none"
		on:click={toggleDropdown}
	>
		<div class="flex items-center gap-3">
			{#if selected?.logoUrl}
				<img src={selected.logoUrl} alt={selected.symbol} class="h-6 w-6 rounded-full" />
			{:else if selected?.symbol}
				<AssetDisc sym={selected.symbol} size={24} />
			{/if}
			<span class="font-medium">{selected?.symbol || placeholder}</span>
		</div>
		<Icon
			name="chevronDown"
			className="h-5 w-5 transform transition-transform {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Dropdown options -->
	{#if isOpen}
		<div
			class="absolute left-0 z-50 mt-1 w-full rounded-lg border border-line bg-surface-3 shadow-xl"
		>
			<div class="max-h-60 overflow-y-auto py-1">
				{#each options as token (token.address)}
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-text transition-colors
							hover:bg-overlay-hover focus:outline-none {selected?.address === token.address
							? 'bg-accent-soft text-accent'
							: ''}"
						on:click={() => handleSelect(token)}
					>
						{#if token.logoUrl}
							<img src={token.logoUrl} alt={token.symbol} class="h-6 w-6 rounded-full" />
						{:else}
							<AssetDisc sym={token.symbol} size={24} />
						{/if}
						<span class="font-medium">{token.symbol}</span>
						{#if token.name && token.name !== token.symbol}
							<span class="text-sm text-text-2">({token.name})</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
