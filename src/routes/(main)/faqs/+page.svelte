<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';

	// FAQPage structured data. Answers mirror the visible copy below (Google
	// requires FAQ rich-result content to be present on the page) so this earns
	// expandable Q&A snippets in search results.
	const faqs = [
		{
			q: 'What is ST0x?',
			a: 'ST0x is a decentralized exchange (DEX) enabling 24/7 trading of tokenized real-world equities such as Nvidia, Tesla, and ETFs on-chain. It bridges traditional finance and DeFi.'
		},
		{
			q: 'How does ST0x work?',
			a: 'ST0x operates using a dual-entity structure: S1 Issuer GmbH issues tokenized equities, and SarkX BVI Ltd manages the decentralized matching and execution engine. Users place intent-based orders on-chain, executed via solvers when matched with liquidity.'
		},
		{
			q: 'What assets can I trade on ST0x?',
			a: 'Tokenized public equities, ETFs, and potentially other real-world assets (RWAs). The underlying issued asset tokens represent corresponding assets held with a regulated broker such as Charles Schwab. ST0x markets trade wrapped vault shares whose exchange rate to the issued token can change over time.'
		},
		{
			q: 'How is liquidity handled?',
			a: 'Liquidity is demand-driven. Arbitrageurs create or redeem tokens via the Core Bridge, aligning prices between off-chain markets and on-chain tokens.'
		},
		{
			q: 'Is ST0x custodial?',
			a: 'No. ST0x is non-custodial. Users maintain control of their assets in smart contract vaults. Custody of underlying equities is separately managed by S1 via a regulated broker.'
		},
		{
			q: 'How do I access ST0x?',
			a: 'Connect your DeFi wallet (e.g., MetaMask, WalletConnect). Regional restrictions apply at token issuance.'
		},
		{
			q: 'Are there trading fees?',
			a: 'Yes. Fees include trading fees, gas costs, and potential withdrawal fees, structured transparently.'
		},
		{
			q: "What happens if I lose my wallet's private key?",
			a: 'ST0x is non-custodial. Users are solely responsible for safeguarding their private keys.'
		}
	];

	const faqJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map(({ q, a }) => ({
			'@type': 'Question',
			name: q,
			acceptedAnswer: { '@type': 'Answer', text: a }
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
				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">What is ST0x?</h3>
					<p class="leading-relaxed text-text-2">
						ST0x is a decentralized exchange (DEX) enabling 24/7 trading of tokenized real-world
						equities such as Nvidia, Tesla, and ETFs on-chain. It bridges traditional finance and
						DeFi.
					</p>
				</div>

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">How does ST0x work?</h3>
					<p class="leading-relaxed text-text-2">ST0x operates using a dual-entity structure:</p>
					<ul class="ml-6 mt-3 list-disc space-y-2 text-text-2">
						<li>S1 Issuer GmbH issues tokenized equities.</li>
						<li>SarkX BVI Ltd manages the decentralized matching and execution engine.</li>
					</ul>
					<p class="mt-3 leading-relaxed text-text-2">
						Users place intent-based orders on-chain, executed via solvers when matched with
						liquidity.
					</p>
				</div>

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">What assets can I trade on ST0x?</h3>
					<p class="leading-relaxed text-text-2">
						Tokenized public equities, ETFs, and potentially other real-world assets (RWAs). The
						underlying issued asset tokens represent corresponding assets held with a regulated
						broker such as Charles Schwab. ST0x markets trade wrapped vault shares whose exchange
						rate to the issued token can change over time.
					</p>
				</div>

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">How is liquidity handled?</h3>
					<p class="leading-relaxed text-text-2">
						Liquidity is demand-driven. Arbitrageurs create or redeem tokens via the Core Bridge,
						aligning prices between off-chain markets and on-chain tokens.
					</p>
				</div>

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">Is ST0x custodial?</h3>
					<p class="leading-relaxed text-text-2">
						No. ST0x is non-custodial. Users maintain control of their assets in smart contract
						vaults. Custody of underlying equities is separately managed by S1 via a regulated
						broker.
					</p>
				</div>

				<!-- <div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">Is ST0x regulated?</h3>
					<p class="leading-relaxed text-text-2">
						ST0x is structured to avoid exchange or brokerage licensing by:
					</p>
					<ul class="ml-6 mt-3 list-disc space-y-2 text-text-2">
						<li>Keeping matching logic decentralized.</li>
						<li>Utilizing separate regulated issuers.</li>
						<li>Requiring KYC/KYB only during token issuance, not secondary trading.</li>
					</ul>
				</div> -->

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">How do I access ST0x?</h3>
					<p class="leading-relaxed text-text-2">
						Connect your DeFi wallet (e.g., MetaMask, WalletConnect). Regional restrictions apply at
						token issuance.
					</p>
				</div>

				<div class="border-b border-line pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">Are there trading fees?</h3>
					<p class="leading-relaxed text-text-2">
						Yes. Fees include trading fees, gas costs, and potential withdrawal fees, structured
						transparently.
					</p>
				</div>

				<div class="pb-8">
					<h3 class="mb-3 text-xl font-semibold text-text">
						What happens if I lose my wallet's private key?
					</h3>
					<p class="leading-relaxed text-text-2">
						ST0x is non-custodial. Users are solely responsible for safeguarding their private keys.
					</p>
				</div>
			</div>
		</div>
	</section>

	<Footer />
</div>
