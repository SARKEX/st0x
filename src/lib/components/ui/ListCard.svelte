<script lang="ts">
	import Card from './Card.svelte';

	type Item = {
		name: string;
		symbol?: string;
		href: string;
		metadata?: string;
		metadataClass?: string;
		logoUrl?: string;
		price?: string;
	};
	export let title: string;
	export let items: Item[] = [];
</script>

<Card>
	<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">{title}</div>
	<ul class="space-y-3">
		{#each items as item}
			<li>
				<a
					href={item.href}
					class="block rounded-lg border border-white/5 bg-black/20 p-3 transition-all hover:border-yellow-500/30 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-500/10"
				>
					<div class="flex items-center gap-3">
						{#if item.logoUrl}
							<img src={item.logoUrl} alt={item.symbol} class="h-8 w-8 rounded-full bg-gray-700" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between">
								<div>
									<span class="block truncate text-sm font-medium text-white">{item.name}</span>
									{#if item.symbol}
										<span class="text-xs text-gray-400">{item.symbol}</span>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<div class="text-right">
										{#if item.price}
											<div class="text-sm font-medium text-white">${item.price}</div>
										{/if}
										{#if item.metadata}
											{#each item.metadata.split('\n') as line}
												<div class="text-xs font-medium {item.metadataClass || 'text-gray-400'}">
													{line}
												</div>
											{/each}
										{/if}
									</div>
									<!-- Arrow icon to indicate clickable -->
									<svg
										class="h-4 w-4 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
								</div>
							</div>
						</div>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</Card>
