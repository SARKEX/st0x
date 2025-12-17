<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="relative z-10 min-h-screen">
	<section class="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
		<div class="mx-auto max-w-3xl">
			<h1 class="mb-12 text-4xl font-bold tracking-tight text-white sm:text-5xl">FAQs</h1>

			<div class="space-y-8">
				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">What is ST0x?</h3>
					<p class="leading-relaxed text-gray-400">
						ST0x is a decentralized exchange (DEX) enabling 24/7 trading of tokenized real-world
						equities such as Nvidia, Tesla, and ETFs on-chain. It bridges traditional finance and
						DeFi.
					</p>
				</div>

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">How does ST0x work?</h3>
					<p class="leading-relaxed text-gray-400">ST0x operates using a dual-entity structure:</p>
					<ul class="ml-6 mt-3 list-disc space-y-2 text-gray-400">
						<li>S1 Issuer GmbH issues tokenized equities.</li>
						<li>SarkX BVI Ltd manages the decentralized matching and execution engine.</li>
					</ul>
					<p class="mt-3 leading-relaxed text-gray-400">
						Users place intent-based orders on-chain, executed via solvers when matched with
						liquidity.
					</p>
				</div>

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">What assets can I trade on ST0x?</h3>
					<p class="leading-relaxed text-gray-400">
						Tokenized public equities, ETFs, and potentially other real-world assets (RWAs). Each
						token is backed 1:1 by shares held with a regulated broker such as Charles Schwab.
					</p>
				</div>

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">How is liquidity handled?</h3>
					<p class="leading-relaxed text-gray-400">
						Liquidity is demand-driven. Arbitrageurs create or redeem tokens via the Core Bridge,
						aligning prices between off-chain markets and on-chain tokens.
					</p>
				</div>

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">Is ST0x custodial?</h3>
					<p class="leading-relaxed text-gray-400">
						No. ST0x is non-custodial. Users maintain control of their assets in smart contract
						vaults. Custody of underlying equities is separately managed by S1 via a regulated
						broker.
					</p>
				</div>

				<!-- <div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">Is ST0x regulated?</h3>
					<p class="leading-relaxed text-gray-400">
						ST0x is structured to avoid exchange or brokerage licensing by:
					</p>
					<ul class="ml-6 mt-3 list-disc space-y-2 text-gray-400">
						<li>Keeping matching logic decentralized.</li>
						<li>Utilizing separate regulated issuers.</li>
						<li>Requiring KYC/KYB only during token issuance, not secondary trading.</li>
					</ul>
				</div> -->

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">How do I access ST0x?</h3>
					<p class="leading-relaxed text-gray-400">
						Connect your DeFi wallet (e.g., MetaMask, WalletConnect). Regional restrictions apply at
						token issuance.
					</p>
				</div>

				<div class="border-b border-white/10 pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">Are there trading fees?</h3>
					<p class="leading-relaxed text-gray-400">
						Yes. Fees include trading fees, gas costs, and potential withdrawal fees, structured
						transparently.
					</p>
				</div>

				<div class="pb-8">
					<h3 class="mb-3 text-xl font-semibold text-white">
						What happens if I lose my wallet's private key?
					</h3>
					<p class="leading-relaxed text-gray-400">
						ST0x is non-custodial. Users are solely responsible for safeguarding their private keys.
					</p>
				</div>
			</div>
		</div>
	</section>

	<Footer />
</div>
