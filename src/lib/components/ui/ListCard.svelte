<script lang="ts">
	import Card from './Card.svelte';
	type Item = { name: string; symbol?: string; href: string };
	export let title: string;
	export let items: Item[] = [];
</script>

<Card>
	<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">{title}</div>
	<ul class="space-y-2">
		{#each items as item}
			<li>
				<a class="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-2 hover:border-yellow-500/30" href={item.href}>
					<span class="truncate text-sm text-white">{item.name}</span>
					{#if item.symbol}
						<span class="ml-2 text-xs text-gray-400">{item.symbol}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</Card>