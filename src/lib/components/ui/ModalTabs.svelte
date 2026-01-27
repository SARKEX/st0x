<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let tabs: { id: string; label: string }[] = [];
	export let activeTab: string;

	const dispatch = createEventDispatcher<{ change: string }>();
</script>

<div class="flex border-b border-gray-700">
	{#each tabs as tab}
		<button
			on:click={() => dispatch('change', tab.id)}
			class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === tab.id
				? 'border-b-2 border-yellow-400 text-yellow-400'
				: 'text-gray-400 hover:text-white'}"
		>
			{tab.label}
		</button>
	{/each}
</div>
