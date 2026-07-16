<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let tabs: { id: string; label: string }[] = [];
	export let activeTab: string;

	const dispatch = createEventDispatcher<{ change: string }>();
</script>

<div class="flex border-b border-line">
	{#each tabs as tab}
		<button
			type="button"
			on:click={() => dispatch('change', tab.id)}
			class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === tab.id
				? 'border-b-2 border-accent text-accent'
				: 'text-text-2 hover:text-text'}"
		>
			{tab.label}
		</button>
	{/each}
</div>
