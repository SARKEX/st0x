<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import ProsePanel from '$lib/components/ui/ProsePanel.svelte';
</script>

<!-- Main Content -->
<div>
	<!-- FAQs Content -->
	<PageContainer>
		<ProsePanel>
			<h1 class="mb-8 text-4xl font-bold text-white">FAQs</h1>

			<div class="space-y-8">
				<!-- FAQ Item 1 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">What is ST0x?</h3>
					<p class="leading-relaxed text-gray-300">
						ST0x is a decentralized exchange (DEX) enabling 24/7 trading of tokenized real-world
						equities such as Apple, Tesla, and ETFs on-chain. It bridges traditional finance and
						DeFi.
					</p>
				</div>

				<!-- FAQ Item 2 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">How does ST0x work?</h3>
					<p class="leading-relaxed text-gray-300">ST0x operates using a dual-entity structure:</p>
					<p class="ml-6 mt-2 leading-relaxed text-gray-300">
						• S1 Issuer GmbH issues tokenized equities.<br />
						• SarkX BVI Ltd manages the decentralized matching and execution engine.
					</p>
					<p class="mt-3 leading-relaxed text-gray-300">
						Users place intent-based orders on-chain, executed via solvers when matched with
						liquidity.
					</p>
				</div>

				<!-- FAQ Item 3 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">What assets can I trade on ST0x?</h3>
					<p class="leading-relaxed text-gray-300">
						Tokenized public equities, ETFs, and potentially other real-world assets (RWAs). Each
						token is backed 1:1 by shares held with a regulated broker such as Charles Schwab.
					</p>
				</div>

				<!-- FAQ Item 4 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">How is liquidity handled?</h3>
					<p class="leading-relaxed text-gray-300">
						Liquidity is demand-driven. Arbitrageurs create or redeem tokens via the Core Bridge,
						aligning prices between off-chain markets and on-chain tokens.
					</p>
				</div>

				<!-- FAQ Item 5 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">Is ST0x custodial?</h3>
					<p class="leading-relaxed text-gray-300">
						No. ST0x is non-custodial. Users maintain control of their assets in smart contract
						vaults. Custody of underlying equities is separately managed by S1 via a regulated
						broker.
					</p>
				</div>

				<!-- FAQ Item 6 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">Is ST0x regulated?</h3>
					<p class="leading-relaxed text-gray-300">
						ST0x is structured to avoid exchange or brokerage licensing by:
					</p>
					<p class="ml-6 mt-2 leading-relaxed text-gray-300">
						• Keeping matching logic decentralized.<br />
						• Utilizing separate regulated issuers.<br />
						• Requiring KYC/KYB only during token issuance, not secondary trading.
					</p>
				</div>

				<!-- FAQ Item 7 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">How do I access ST0x?</h3>
					<p class="leading-relaxed text-gray-300">
						Connect your DeFi wallet (e.g., MetaMask, WalletConnect). Regional restrictions apply at
						token issuance.
					</p>
				</div>

				<!-- FAQ Item 8 -->
				<div class="border-b border-white/10 pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">Are there trading fees?</h3>
					<p class="leading-relaxed text-gray-300">
						Yes. Fees include trading fees, gas costs, and potential withdrawal fees, structured
						transparently.
					</p>
				</div>

				<!-- FAQ Item 9 -->
				<div class="pb-6">
					<h3 class="mb-3 text-xl font-semibold text-white">
						What happens if I lose my wallet's private key?
					</h3>
					<p class="leading-relaxed text-gray-300">
						ST0x is non-custodial. Users are solely responsible for safeguarding their private keys.
					</p>
				</div>
			</div>
		</ProsePanel>
	</PageContainer>

	<!-- Footer -->
	<Footer />
</div>
