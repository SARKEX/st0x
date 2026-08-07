<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';

	// Single source of truth for the FAQ. The visible page and the FAQPage
	// structured data both render from this array, so a copy edit can never leave
	// superseded wording circulating in search snippets and AI Overviews while the
	// visible page reads correctly. Answers are paragraph arrays; the JSON-LD
	// flattens them.
	const faqs: { q: string; a: string[] }[] = [
		{
			q: 'What is ST0x?',
			a: [
				'ST0x is infrastructure for trading tokenised securities on a public blockchain. Tokens issued by S01 Issuer GmbH can be held in a self-custodied wallet and traded through public smart contracts on Base, at any hour.'
			]
		},
		{
			q: 'Who issues the tokenised securities?',
			a: [
				'S01 Issuer GmbH, registered in Berlin under HRB 270925 B, issues them under a base prospectus approved by the Financial Market Authority Liechtenstein.'
			]
		},
		{
			q: 'Who operates the trading contracts?',
			a: [
				'The contracts are deployed on Base, a public blockchain, and execute autonomously. No group entity or affiliate operates order matching, controls execution, or exercises discretion over access to those contracts. This website is one of several possible interfaces to the same public contracts.'
			]
		},
		{
			q: 'What assets can I trade on ST0x?',
			a: [
				'Tokenised exposure to U.S.-listed stocks, exchange-traded funds and commodity trusts. ST0x markets trade wrapped vault shares whose exchange rate to the issued token can change over time.'
			]
		},
		{
			q: 'What do I own when I hold a token?',
			a: [
				'A token is a claim against S01 Issuer GmbH on the terms set out in the base prospectus. Holders are unsecured contractual creditors of the Issuer.',
				'The Issuer holds a corresponding position in the underlying security with a regulated U.S. broker-dealer, for its own account, as a hedge against its obligations. That position is held for the Issuer, not on trust for holders. It is not pledged or charged in favour of holders and it is not segregated from the Issuer’s estate. If the Issuer became insolvent, holders would rank alongside its other unsecured creditors.'
			]
		},
		{
			q: 'How is liquidity handled?',
			a: [
				'Liquidity is demand-driven. Arbitrageurs create or redeem tokens via the Core Bridge, aligning prices between off-chain markets and on-chain tokens.'
			]
		},
		{
			q: 'Is ST0x custodial?',
			a: [
				'No. ST0x is non-custodial. Users maintain control of their assets in smart contract vaults.'
			]
		},
		{
			q: 'How do I access ST0x?',
			a: [
				'Connect your DeFi wallet (e.g., MetaMask, WalletConnect). Access requirements and eligibility restrictions apply. See the Base Prospectus and Final Terms for the jurisdictions and investor categories in which the tokens may be offered.'
			]
		},
		{
			q: 'Are there trading fees?',
			a: [
				'Yes. Fees include trading fees, gas costs, and potential withdrawal fees, structured transparently.'
			]
		},
		{
			q: "What happens if I lose my wallet's private key?",
			a: [
				'ST0x is non-custodial. Users are solely responsible for safeguarding their private keys.'
			]
		}
	];

	const faqJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map(({ q, a }) => ({
			'@type': 'Question',
			name: q,
			acceptedAnswer: { '@type': 'Answer', text: a.join('\n\n') }
		}))
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static JSON-LD serialized from a local const; no user input -->
	{@html `<script type="application/ld+json">${faqJsonLd}</` + 'script>'}
</svelte:head>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-3xl">
			<h1 class="mb-12 text-4xl font-bold tracking-tight text-text sm:text-5xl">FAQs</h1>

			<div class="space-y-8">
				{#each faqs as faq, i (faq.q)}
					<div class={i === faqs.length - 1 ? 'pb-8' : 'border-b border-line pb-8'}>
						<h3 class="mb-3 text-xl font-semibold text-text">{faq.q}</h3>
						{#each faq.a as paragraph, j (j)}
							<p class="leading-relaxed text-text-2 {j > 0 ? 'mt-3' : ''}">{paragraph}</p>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<Footer />
</div>
