<script lang="ts">
	import { onMount } from 'svelte';
	import Button from "$lib/components/Button.svelte";
	import Input from "$lib/components/Input.svelte";
	import Select from "$lib/components/Select.svelte";
	import { signerAddress } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { ARBITRUM_SFT_SUBGRAPH_URL, STOXs } from "$lib/network";

	let selectedStockSymbol = STOXs[0].symbol;
	let selectedName = '';
	let selectedEmailAddress = '';
	let selectedBrokerage = 'Interactive Brokers';
	let quantity: string = '0';

	// Utility Classes
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';
	const INPUT_CLASSES =
		'w-full bg-gray-700/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-500/50 focus:outline-none transition-colors';

	const sendBurn = () => {
		const subject = `Burn Request - ${selectedStockSymbol}`;
		const body = `
Please process my burn request with the following details:

Stock Symbol: ${selectedStockSymbol}
Quantity: ${quantity.toString()}
From Brokerage: ${selectedBrokerage}
Wallet Address: ${$signerAddress}
Full Name: ${selectedName}
Email Address: ${selectedEmailAddress}
		`.trim();

		const mailtoLink = `mailto:transfers@st0x.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
		window.location.href = mailtoLink;
	}
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Burn</h1>
					<p class="text-sm text-gray-400">Redeem tokens for underlying securities</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Burn Content -->
	<div class="space-y-8 p-6">
		<!-- Hero Section -->
		<div class="relative overflow-hidden rounded-2xl">
			<!-- Background with gradient and pattern -->
			<div
				class="absolute inset-0 bg-gradient-to-br from-red-600 via-orange-600 to-yellow-500 opacity-90"
			/>
			<div class="absolute inset-0 bg-gradient-to-r from-red-900/50 to-orange-900/50" />

			<!-- Content -->
			<div class="relative px-12 py-12 text-center">
				<h1 class="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl">
					Burn Tokenized Assets
				</h1>

				<p class="mx-auto mb-8 max-w-3xl text-lg leading-relaxed text-orange-100 md:text-xl">
					Redeem your tokenized assets for underlying securities. Burn your tokens and receive the
					corresponding stocks in your Charles Schwab brokerage account.
				</p>

				<div
					class="inline-block rounded-xl border border-white/30 bg-white/20 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm"
				>
					<span class="text-yellow-400">⚠️</span> Charles Schwab account required for redemption
				</div>
			</div>
		</div>

		<!-- Burn Address Notice -->
		<div
			class="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-900/40 via-gray-800/50 to-black/50 p-6 backdrop-blur-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500"
				>
					<span class="text-xl font-bold text-white">🔥</span>
				</div>
				<div>
					<h3 class="mb-3 text-xl font-semibold text-red-400">Burn Address</h3>
					<p class="mb-4 text-gray-300">To burn tokens, send them to the following address:</p>
					<div class="rounded-lg border border-red-500/30 bg-gray-800/80 p-4">
						<code class="break-all font-mono text-sm text-red-400">
							0x000000000000000000000000000000000000dEaD
						</code>
					</div>
					<p class="mt-2 text-sm text-gray-400">
						This is the standard burn address. Tokens sent here are permanently removed from
						circulation.
					</p>
				</div>
			</div>
		</div>

		<!-- Burn Process -->
		<div class={SECTION_CLASSES}>
			<div class="mb-8">
				<h2
					class="mb-4 bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					Burn Process
				</h2>
				<p class="text-gray-400">
					To burn assets and retrieve the underlying securities into your Charles Schwab brokerage
					account, you must first burn the corresponding tokenized amount of the asset you wish to
					redeem.
				</p>
			</div>

			<div class="space-y-6">
				<!-- Process Step 1 -->
				<div class="{CARD_BASE_CLASSES} p-6">
					<div class={GRADIENT_HOVER_CLASSES} />
					<div class="flex items-start gap-4">
						<div
							class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-orange-700 text-sm font-bold"
						>
							1
						</div>
						<div class="flex-1">
							<h3 class="mb-3 text-lg font-semibold text-orange-500">Burn your tokens</h3>
							<div class="space-y-3 text-gray-300">
								<p>Send the tokens you wish to redeem to the burn address:</p>

								<div class="mt-4 rounded-lg border border-red-500/30 bg-gray-800/50 p-4">
									<code class="break-all font-mono text-sm text-red-400">
										0x000000000000000000000000000000000000dEaD
									</code>
								</div>

								<div class="mt-4 rounded-lg border border-red-500/30 bg-red-900/20 p-4">
									<div class="flex items-start gap-3">
										<div
											class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500"
										>
											<span class="text-xs font-bold text-white">!</span>
										</div>
										<p class="text-sm text-red-100">
											<strong>Warning:</strong> This action is irreversible. Make sure you send the correct
											amount to the burn address.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Process Step 2 -->
				<div class="{CARD_BASE_CLASSES} p-6">
					<div class={GRADIENT_HOVER_CLASSES} />
					<div class="flex items-start gap-4">
						<div
							class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-orange-700 text-sm font-bold"
						>
							2
						</div>
						<div class="flex-1">
							<h3 class="mb-3 text-lg font-semibold text-orange-500">
								Provide burn transaction details
							</h3>
							<div class="space-y-3 text-gray-300">
								<p>In addition to burning, please provide the following details:</p>

								<div class="mt-4 space-y-2">
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">Please highlight this is a burn</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">The transaction hash of the burn</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">Your full name</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">Name on your Schwab account</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">Your Schwab account number</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">The ticker symbol of the asset you are burning</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
										<span class="text-sm">The amount you are redeeming</span>
									</div>
								</div>

								<div class="mt-4">
									<p>
										Please send this information to <span class="font-semibold text-orange-500"
											>transfers@st0x.io</span
										>
									</p>
									<p class="mt-1 text-sm text-gray-400">
										Once received, we will process the transfer into your Schwab account.
									</p>
								</div>

								<div class="mt-4 rounded-lg border border-orange-500/30 bg-orange-900/20 p-4">
									<div class="flex items-start gap-3">
										<div
											class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-orange-500"
										>
											<span class="text-xs font-bold text-gray-900">✓</span>
										</div>
										<p class="text-sm text-orange-100">
											Processing time may vary. You will receive confirmation once the securities
											have been transferred to your account.
										</p>
									</div>
								</div>
							</div>
							<div class="space-y-5 mt-4">
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">Stock Symbol</span>
									<Select
										options={STOXs.map(s => s.symbol)}
										bind:selected={selectedStockSymbol}
										getOptionLabel={(option) => option}
									/>
								</div>
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">Name</span>
									<input
										type="string"
										placeholder="Name"
										bind:value={selectedName}
										class="h-8 w-full p-2 border border-white bg-gray-800/95 text-white"
									/>
								</div>
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">Email Address</span>
									<input
										type="string"
										placeholder="Email Address"
										bind:value={selectedEmailAddress}
										class="h-8 w-full p-2 border border-white bg-gray-800/95 text-white"
									/>
								</div>
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">Quantity</span>
									<Input
										type="number"
										placeholder="0.0"
										bind:amount={quantity}
										class="h-8 w-full border-none bg-gray-800/95 text-white"
									/>
								</div>
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">From Brokerage</span>
									<Select
										options={['Interactive Brokers', 'Charles Schwab', 'Fidelity']}
										bind:selected={selectedBrokerage}
										getOptionLabel={(option) => option}
									/>
								</div>
								<div class="flex flex-col gap-2">
									<span class="block text-gray-300 text-sm mb-1">Your Wallet Address : {$signerAddress}</span>
								</div>
								<Button
									on:click={() => {
										sendBurn();
									}}
									class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded mt-2 transition-colors duration-200"
								>
									Send
								</Button>
							</div>
							
						</div>
						
					</div>
				</div>
			</div>
		</div>

		<!-- Important Warnings -->
		<div
			class="rounded-2xl border border-red-500/30 bg-gradient-to-br from-yellow-900/30 via-red-900/30 to-orange-900/20 p-6 backdrop-blur-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500"
				>
					<span class="text-xl font-bold text-white">⚠️</span>
				</div>
				<div>
					<h3 class="mb-3 text-xl font-semibold text-red-500">Important Warnings</h3>
					<div class="space-y-2 text-gray-300">
						<p>• Burning tokens is irreversible - ensure all details are correct</p>
						<p>• You must have a Charles Schwab account to receive underlying securities</p>
						<p>• Processing time may vary depending on market conditions</p>
						<p>• Always double-check the burn address before sending tokens</p>
						<p>• Keep your transaction hash for reference and support</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Terms and Conditions Placeholder -->
		<div class={SECTION_CLASSES}>
			<h2 class="mb-4 text-xl font-semibold">Terms and Conditions</h2>
			<div class="rounded-lg border border-white/10 bg-gray-700/30 p-6">
				<p class="py-8 text-center text-gray-400">
					Terms and Conditions content will be added here.
					<br />
					<span class="text-sm">Please check back later for detailed terms and conditions.</span>
				</p>
			</div>
		</div>

		<!-- Contact Information -->
		<div class={SECTION_CLASSES}>
			<h2 class="mb-4 text-xl font-semibold">Need Help?</h2>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="rounded-lg border border-white/10 bg-gray-700/30 p-6">
					<h3 class="mb-2 font-semibold text-orange-500">Burn Support</h3>
					<p class="mb-3 text-sm text-gray-400">
						For questions about burning tokens and redemptions
					</p>
					<a
						href="mailto:transfers@st0x.io"
						class="text-blue-400 transition-colors hover:text-blue-300"
					>
						transfers@st0x.io
					</a>
				</div>
				<div class="rounded-lg border border-white/10 bg-gray-700/30 p-6">
					<h3 class="mb-2 font-semibold text-orange-500">General Support</h3>
					<p class="mb-3 text-sm text-gray-400">For general questions and assistance</p>
					<a
						href="mailto:hello@st0x.com"
						class="text-blue-400 transition-colors hover:text-blue-300"
					>
						hello@st0x.com
					</a>
				</div>
			</div>
		</div>
	</div>

	<Footer />
</div>
