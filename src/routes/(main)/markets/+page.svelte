<script lang="ts">
	import type { PageData } from './$types';
	import Footer from '$lib/components/Footer.svelte';
	export let data: PageData;
</script>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-5xl">
			<h1 class="mb-4 text-4xl font-bold tracking-tight text-text sm:text-5xl">
				Tokenized markets
			</h1>
			<p class="mb-12 max-w-2xl text-lg leading-relaxed text-text-2">
				Browse tokens issued for on-chain exposure to listed instruments. The programme covers
				single-name equities, exchange-traded funds and commodity trusts.
			</p>

			<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.assets as asset (asset.slug)}
					<li>
						<a
							href={`/markets/${asset.slug}`}
							class="bg-surface-1/80 flex h-full items-center gap-4 rounded-2xl border border-line p-5 shadow-[var(--shadow-1)] backdrop-blur-sm transition hover:border-accent-line hover:bg-surface-2 hover:shadow-[var(--shadow-2)]"
						>
							{#if asset.logoUrl}
								<img
									src={asset.logoUrl}
									alt=""
									class="h-10 w-10 flex-shrink-0 rounded-full bg-overlay-2"
									loading="lazy"
								/>
							{/if}
							<span class="min-w-0">
								<span class="block truncate font-semibold text-text">{asset.ticker}</span>
								<span class="block truncate text-sm text-text-2">{asset.companyName}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<Footer />
</div>
