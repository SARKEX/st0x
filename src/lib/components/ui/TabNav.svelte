<script lang="ts">
	// Tabs: array of { id: string; label: string }
	export let tabs: { id: string; label: string }[] = [];
	export let activeId: string;
	// Emit change events
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{ change: { id: string } }>();

	function setActive(id: string) {
		if (id === activeId) return;
		activeId = id;
		dispatch('change', { id });
	}

	export let className: string = '';
</script>

<div class={"flex gap-2 border-b border-white/10 " + className}>
	{#each tabs as tab}
		<button
			on:click={() => setActive(tab.id)}
			class={"border-b-2 px-4 py-2 text-sm font-medium transition-colors " + (activeId === tab.id
				? 'border-yellow-500 text-yellow-500'
				: 'border-transparent text-gray-400 hover:text-white')}
		>
			{tab.label}
		</button>
	{/each}
</div>

