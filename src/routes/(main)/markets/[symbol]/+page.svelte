<script lang="ts">
	import type { PageData } from './$types';
	import Footer from '$lib/components/Footer.svelte';
	export let data: PageData;

	$: asset = data.asset;

	// Breadcrumb structured data (Home › Markets › Ticker) — eligible for
	// breadcrumb rich results. No price/offer claims, so nothing to keep in sync
	// with live market data.
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
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static JSON-LD serialized from a local const; no user input -->
	{@html `<script type="application/ld+json">${breadcrumbJsonLd}</` + 'script>'}
</svelte:head>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-3xl">
			<!-- Breadcrumb -->
			<nav aria-label="Breadcrumb" class="mb-8 text-sm text-gray-500">
				<a href="/" class="transition-colors hover:text-yellow-500">ST0x</a>
				<span class="mx-2">/</span>
				<a href="/markets" class="transition-colors hover:text-yellow-500">Markets</a>
				<span class="mx-2">/</span>
				<span class="text-gray-300">{asset.ticker}</span>
			</nav>

			<div class="mb-6 flex items-center gap-4">
				{#if asset.logoUrl}
					<img src={asset.logoUrl} alt="" class="h-14 w-14 flex-shrink-0 rounded-full bg-white/5" />
				{/if}
				<div>
					<h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl">
						Tokenized {asset.companyName}
					</h1>
					<p class="mt-2 text-lg text-gray-400">
						{asset.ticker} · {asset.tokenSymbol} on Base
					</p>
				</div>
			</div>

			<div class="mb-10 flex flex-wrap gap-3">
				<a
					href="/markets"
					class="rounded-xl border border-white/10 px-6 py-3 font-semibold text-gray-200 transition-colors hover:bg-white/5"
				>
					All markets
				</a>
			</div>

			<div class="space-y-8 text-gray-300">
				<div>
					<h2 class="mb-3 text-2xl font-semibold text-white">
						What is tokenized {asset.ticker}?
					</h2>
					<p class="leading-relaxed">
						Tokenized {asset.companyName} ({asset.ticker}) provides on-chain exposure to the
						underlying listed {asset.instrumentLabel}. The issued asset token is a claim against S01
						Issuer GmbH on the terms set out in its base prospectus; holders are unsecured
						contractual creditors of the Issuer. On ST0x it is represented as
						<span class="font-mono text-gray-200">{asset.tokenSymbol}</span>, a vault wrapper on
						Base whose exchange rate to the issued token can change over time.
					</p>
				</div>

				<div>
					<h2 class="mb-3 text-2xl font-semibold text-white">About this token</h2>
					<ul class="ml-6 list-disc space-y-2 leading-relaxed">
						<li>
							<span class="font-medium text-white">On-chain representation.</span> Issued as a
							tokenized security claim on Base.
						</li>
						<li>
							<span class="font-medium text-white">Non-custodial wrappers.</span> Wrapped forms
							settle in smart-contract vaults you control.
						</li>
						<li>
							<span class="font-medium text-white">Composable.</span> Use tokenized {asset.ticker}
							across DeFi where supported.
						</li>
					</ul>
				</div>

				{#if asset.riskDisclosure}
					<div class="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
						<h2 class="mb-2 text-xl font-semibold text-amber-200">Product risk</h2>
						<p class="leading-relaxed text-amber-100/90">{asset.riskDisclosure}</p>
					</div>
				{/if}

				<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-6 backdrop-blur-sm">
					<h2 class="mb-2 text-xl font-semibold text-white">Learn more</h2>
					<p class="mb-4 leading-relaxed text-gray-400">
						New to tokenized assets? Read the
						<a href="/faqs" class="text-yellow-500 hover:underline">FAQs</a>.
					</p>
				</div>

				<p class="text-xs leading-relaxed text-gray-600">
					Tokenized assets involve substantial risk. Past performance does not guarantee future
					results. Access requirements and eligibility restrictions apply. See the Base Prospectus
					and Final Terms for the jurisdictions and investor categories in which the tokens may be
					offered.
				</p>
			</div>
		</div>
	</section>

	<Footer />
</div>
