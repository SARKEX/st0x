<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let tabs: { id: string; label: string }[] = [];
	export let activeTab: string;

	const dispatch = createEventDispatcher<{ change: string }>();
</script>

<div class="flex border-b border-white/10" role="tablist">
	{#each tabs as tab}
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === tab.id}
			on:click={() => dispatch('change', tab.id)}
			class="flex-1 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-gold-500/30 {activeTab ===
			tab.id
				? 'border-b-2 border-brand-gold-400 text-brand-gold-400'
				: 'text-gray-400 hover:text-white'}"
		>
			{tab.label}
		</button>
	{/each}
</div>
