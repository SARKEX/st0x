<script lang="ts">
	import Card from './Card.svelte';
	export let label: string;
	export let value: string;
	export let change: string = '';
</script>

<Card>
	<div class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
	<div class="mb-2">
		<span class="block text-lg font-bold sm:text-xl lg:text-2xl">{value}</span>
	</div>
	{#if change}
		<div class="flex items-center gap-1 text-xs font-medium text-yellow-500 sm:text-sm">
			<span>↗</span>
			<span class="truncate">{change}</span>
		</div>
	{/if}
</Card>