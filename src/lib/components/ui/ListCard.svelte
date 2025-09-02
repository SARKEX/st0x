<script lang="ts">
	import Card from './Card.svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	
	type Item = { 
		name: string; 
		symbol?: string; 
		href: string; 
		metadata?: string; 
		metadataClass?: string;
		logoUrl?: string;
		price?: string;
		showTradeButton?: boolean;
	};
	export let title: string;
	export let items: Item[] = [];
</script>

<Card>
	<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">{title}</div>
	<ul class="space-y-3">
		{#each items as item}
			<li>
				<div class="rounded-lg border border-white/5 bg-black/20 p-3 hover:border-yellow-500/30">
					<div class="flex items-center gap-3">
						{#if item.logoUrl}
							<img 
								src={item.logoUrl} 
								alt={item.symbol} 
								class="h-8 w-8 rounded-full bg-gray-700"
							/>
						{/if}
						<a class="min-w-0 flex-1" href={item.href}>
							<div class="flex items-center justify-between">
								<div>
									<span class="block truncate text-sm font-medium text-white">{item.name}</span>
									{#if item.symbol}
										<span class="text-xs text-gray-400">{item.symbol}</span>
									{/if}
								</div>
								<div class="text-right">
									{#if item.price}
										<div class="text-sm font-medium text-white">${item.price}</div>
									{/if}
									{#if item.metadata}
										{#each item.metadata.split('\n') as line}
											<div class="text-xs font-medium {item.metadataClass || 'text-gray-400'}">{line}</div>
										{/each}
									{/if}
								</div>
							</div>
						</a>
					{#if item.showTradeButton}
						<Button size="sm" variant="primary" on:click={() => goto(item.href)}>
							Trade
						</Button>
					{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>
</Card>
