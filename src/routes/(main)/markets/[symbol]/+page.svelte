<script lang="ts">
	import type { PageData } from './$types';
	import Footer from '$lib/components/Footer.svelte';
	export let data: PageData;

	$: asset = data.asset;
	$: breadcrumbJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'ST0x', item: 'https://www.st0x.io/' },
			{ '@type': 'ListItem', position: 2, name: 'Markets', item: 'https://www.st0x.io/markets' },
			{
				'@type': 'ListItem',
				position: 3,
				name: `${asset.companyName} (${asset.ticker})`,
				item: `https://www.st0x.io/markets/${asset.slug}`
			}
		]
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- local structured data -->
	{@html `<script type="application/ld+json">${breadcrumbJsonLd}</` + 'script>'}
</svelte:head>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-3xl">
			<nav aria-label="Breadcrumb" class="mb-8 text-sm text-text-3">
				<a href="/" class="transition-colors hover:text-yellow-500">ST0x</a>
				<span class="mx-2">/</span>
				<a href="/markets" class="transition-colors hover:text-yellow-500">Markets</a>
				<span class="mx-2">/</span>
				<span class="text-text-2">{asset.ticker}</span>
			</nav>

			<div class="mb-8 flex items-center gap-4">
				{#if asset.logoUrl}
					<img
						src={asset.logoUrl}
						alt=""
						class="h-14 w-14 flex-shrink-0 rounded-full bg-overlay-2"
					/>
				{/if}
				<div>
					<h1 class="text-4xl font-bold tracking-tight text-text sm:text-5xl">
						Tokenized {asset.companyName}
					</h1>
					<p class="mt-2 text-lg text-text-2">
						{asset.ticker} · {asset.tokenSymbol} on Base
					</p>
				</div>
			</div>

			<div class="space-y-8 text-text-2">
				<section>
					<h2 class="mb-3 text-2xl font-semibold text-text">About this token</h2>
					<p class="leading-relaxed">
						Tokenized {asset.companyName} ({asset.ticker}) provides on-chain exposure to the
						underlying {asset.instrumentLabel}. The issued asset token is a claim against S01 Issuer
						GmbH on the terms set out in its Base Prospectus and Final Terms. Holders are unsecured
						contractual creditors of the Issuer.
					</p>
				</section>

				<section>
					<h2 class="mb-3 text-2xl font-semibold text-text">On-chain wrapper</h2>
					<p class="leading-relaxed">
						<span class="font-mono text-text">{asset.tokenSymbol}</span> is an ERC-4626 vault share on
						Base. Its exchange rate to the issued token can change over time. Issued tokens can be wrapped
						into vault shares and vault shares can be unwrapped back into issued tokens from the wallet
						dashboard.
					</p>
				</section>

				<section
					class="bg-surface-1/80 rounded-2xl border border-line p-6 shadow-[var(--shadow-1)] backdrop-blur-sm"
				>
					<h2 class="mb-2 text-xl font-semibold text-text">Token information</h2>
					<dl class="space-y-3 text-sm">
						<div class="flex flex-wrap justify-between gap-2">
							<dt class="text-text-2">Underlying</dt>
							<dd>{asset.companyName} ({asset.ticker})</dd>
						</div>
						<div class="flex flex-wrap justify-between gap-2">
							<dt class="text-text-2">Token</dt>
							<dd class="font-mono">{asset.tokenSymbol}</dd>
						</div>
						<div class="flex flex-wrap justify-between gap-2">
							<dt class="text-text-2">Network</dt>
							<dd>Base</dd>
						</div>
						<div class="flex flex-wrap justify-between gap-2">
							<dt class="text-text-2">Token address</dt>
							<dd class="break-all font-mono text-xs">{asset.address}</dd>
						</div>
					</dl>
				</section>

				{#if asset.riskDisclosure}
					<section class="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
						<h2 class="mb-2 text-xl font-semibold text-text">Product risk</h2>
						<p class="leading-relaxed text-text-2">{asset.riskDisclosure}</p>
					</section>
				{/if}

				<p class="text-xs leading-relaxed text-text-3">
					Tokenized securities involve substantial risk. Past performance does not guarantee future
					results. Eligibility restrictions apply. Consult the Base Prospectus and Final Terms for
					the applicable jurisdictions and investor categories.
				</p>
			</div>
		</div>
	</section>

	<Footer />
</div>
