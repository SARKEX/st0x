<script lang="ts">
	import type { PageData } from './$types';
	import Footer from '$lib/components/Footer.svelte';
	export let data: PageData;
</script>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-5xl">
			<h1 class="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
				Tokenized markets
			</h1>
			<p class="mb-12 max-w-2xl text-lg leading-relaxed text-gray-400">
				Every asset on ST0x is a DeFi-native token backed 1:1 by the underlying security and
				tradable 24/7, fully on-chain and non-custodial. Explore the tokenized stocks, ETFs and
				commodities available to trade.
			</p>

			<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.assets as asset (asset.slug)}
					<li>
						<a
							href={`/markets/${asset.slug}`}
							class="flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-gray-800/50 p-5 backdrop-blur-sm transition-colors hover:border-yellow-500/40 hover:bg-gray-800/80"
						>
							{#if asset.logoUrl}
								<img
									src={asset.logoUrl}
									alt=""
									class="h-10 w-10 flex-shrink-0 rounded-full bg-white/5"
									loading="lazy"
								/>
							{/if}
							<span class="min-w-0">
								<span class="block truncate font-semibold text-white">{asset.ticker}</span>
								<span class="block truncate text-sm text-gray-400">{asset.companyName}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<Footer />
</div>
