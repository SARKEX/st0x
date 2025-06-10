<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { signerAddress } from 'svelte-wagmi';
	import { getSfts } from '$lib/query';
	import { ARBITRUM_SFT_SUBGRAPH_URL, STOXs } from '$lib/network';

	let selectedStockSymbol = STOXs[0].symbol;
	let selectedBrokerage = 'Interactive Brokers';
	let selectedName = '';
	let selectedEmailAddress = '';
	let quantity: string = '0';

	$: vaultQuery = createQuery({
		queryKey: ['getSfts'],
		queryFn: () => {
			return getSfts();
		}
	});

	const sendSft = () => {
		const subject = `Mint Request - ${selectedStockSymbol}`;
		const body = `
Please process my mint request with the following details:

Stock Symbol: ${selectedStockSymbol}
Quantity: ${quantity.toString()}
From Brokerage: ${selectedBrokerage}
Wallet Address: ${$signerAddress}
Full Name: ${selectedName}
Email Address: ${selectedEmailAddress}

This is a mint request.
		`.trim();

		const mailtoLink = `mailto:transfers@st0x.io?subject=${encodeURIComponent(
			subject
		)}&body=${encodeURIComponent(body)}`;
		window.location.href = mailtoLink;
	};

	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';
	const INPUT_CLASSES =
		'w-full bg-gray-700/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-500/50 focus:outline-none transition-colors';
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Mint</h1>
					<p class="text-sm text-gray-400">Convert U.S. equities to tokenized assets</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Mint Content -->
	<div class="space-y-8 p-6">
		<!-- Hero Section -->
		<div class="relative overflow-hidden rounded-2xl">
			<!-- Background with gradient and pattern -->
			<div
				class="absolute inset-0 bg-gradient-to-br from-green-600 via-blue-600 to-yellow-500 opacity-90"
			/>
			<div class="absolute inset-0 bg-gradient-to-r from-green-900/50 to-blue-900/50" />

			<!-- Content -->
			<div class="relative px-12 py-12 text-center">
				<h1 class="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl">
					Mint Tokenized Assets
				</h1>

				<p class="mx-auto mb-8 max-w-3xl text-lg leading-relaxed text-green-100 md:text-xl">
					Convert your U.S. equities into tokenized assets on-chain. Transfer your stocks from
					Charles Schwab and receive corresponding tokens in your wallet.
				</p>

				<div
					class="inline-block rounded-xl border border-white/30 bg-white/20 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm"
				>
					<span class="text-yellow-400">⚠️</span> U.S. equities only • Charles Schwab required
				</div>
			</div>
		</div>

		<!-- Mint Process -->
		<div class={SECTION_CLASSES}>
			<div class="mb-8">
				<h2
					class="mb-4 bg-gradient-to-r from-yellow-500 to-green-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					Mint Process
				</h2>
				<p class="text-gray-400">
					To mint, you must be able to transfer <strong class="text-white"
						>U.S. equities only</strong
					> to our Charles Schwab account. The quickest and easiest way to do this is by having a Charles
					Schwab account yourself.
				</p>
				<p class="mt-2 text-gray-400">
					Please follow the steps below for transferring assets via Charles Schwab.
				</p>
			</div>

			<div class="space-y-6">
				<!-- Process Step 1 -->
				<div class="{CARD_BASE_CLASSES} p-6">
					<div class={GRADIENT_HOVER_CLASSES} />
					<div class="flex items-start gap-4">
						<div
							class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-700 text-sm font-bold"
						>
							1
						</div>
						<div class="flex-1">
							<h3 class="mb-3 text-lg font-semibold text-yellow-500">
								Provide the following information to us
							</h3>
							<div class="space-y-3 text-gray-300">
								<p>Regardless of the account type, please send us the following details:</p>

								<div class="mt-4 space-y-2">
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">Please highlight this is a mint</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">Your wallet address</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">Your full name</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">Name on the Schwab account</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">Your Schwab account number</span>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm"
											>The ticker symbol(s) of the asset(s) you are transferring</span
										>
									</div>
									<div class="flex items-start gap-3">
										<div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
										<span class="text-sm">The amount of each asset</span>
									</div>
								</div>

								<div class="mt-4 rounded-lg border border-white/10 bg-gray-800/50 p-4">
									<p class="text-sm italic text-gray-400">
										You may include multiple ticker/amount combinations.
									</p>
								</div>

								<div class="mt-4">
									<p>
										Please send this information to <span class="font-semibold text-yellow-500"
											>transfers@st0x.io</span
										>
									</p>
									<p class="mt-1 text-sm text-gray-400">
										Once we receive this information, we will monitor your transfer.
									</p>
								</div>

								<div class="space-y-5">
									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300">Stock Symbol</span>
										<Select
											options={STOXs.map((s) => s.symbol)}
											bind:selected={selectedStockSymbol}
											getOptionLabel={(option) => `${option} - ${STOXs.find((s) => s.symbol === option)?.name}`}
										/>
									</div>
									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300">Name</span>
										<input
											type="string"
											placeholder="Name"
											bind:value={selectedName}
											class="h-8 w-full border border-white bg-gray-800/95 p-2 text-white"
										/>
									</div>
									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300">Email Address</span>
										<input
											type="string"
											placeholder="Email Address"
											bind:value={selectedEmailAddress}
											class="h-8 w-full border border-white bg-gray-800/95 p-2 text-white"
										/>
									</div>

									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300">Quantity</span>
										<Input
											type="number"
											placeholder="0.0"
											bind:amount={quantity}
											class="h-8 w-full border-none bg-gray-800/95 text-white"
										/>
									</div>
									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300">From Brokerage</span>
										<Select
											options={['Interactive Brokers', 'Charles Schwab', 'Fidelity']}
											bind:selected={selectedBrokerage}
											getOptionLabel={(option) => option}
										/>
									</div>
									<div class="flex flex-col gap-2">
										<span class="mb-1 block text-sm text-gray-300"
											>Your Wallet Address : {$signerAddress}</span
										>
									</div>
									<Button
										on:click={() => {
											sendSft();
										}}
										class="mt-2 w-full rounded bg-yellow-400 py-3 font-semibold text-gray-900 transition-colors duration-200 hover:bg-yellow-500"
									>
										Send
									</Button>
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
							class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-700 text-sm font-bold"
						>
							2
						</div>
						<div class="flex-1">
							<h3 class="mb-3 text-lg font-semibold text-yellow-500">
								Submit the Charles Schwab transfer form
							</h3>
							<div class="space-y-3 text-gray-300">
								<p>
									Next, fill out the <strong class="text-white"
										>Move Assets from My Schwab Brokerage Account</strong
									> form with your details.
								</p>

								<p class="mt-3">
									Submit the completed form via the <strong class="text-white"
										>Charles Schwab Message Center</strong
									>.
								</p>

								<div class="mt-4 rounded-lg border border-green-500/30 bg-green-900/20 p-4">
									<div class="flex items-start gap-3">
										<div
											class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500"
										>
											<span class="text-xs font-bold text-gray-900">✓</span>
										</div>
										<p class="text-sm text-green-100">
											Once the assets are received in our account, we will mint the corresponding
											tokens and send them to your provided wallet address.
										</p>
									</div>
								</div>

								<div class="mt-4 rounded-lg border border-blue-500/30 bg-blue-900/20 p-4">
									<p class="text-sm text-blue-100">
										<strong>Using another brokerage?</strong> If you are using another brokerage firm,
										please contact us for specific instructions on how to complete the transfer.
									</p>
								</div>
								<div class="space-y-6">
									<h1 class="mb-6 text-3xl font-bold text-white">Transfer History</h1>
									{#if $vaultQuery.isLoading}
										<div class="text-white">Loading...</div>
									{:else if $vaultQuery.isError}
										<div class="text-red-500">Error: {$vaultQuery.error.message}</div>
									{:else}
										{#each $vaultQuery.data as sft}
											{#each sft.shareTransfers.slice(0, 1) as transfer}
												<div
													class="relative mb-6 flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-lg"
												>
													<!-- Status Badge -->
													<div class="absolute right-4 top-4">
														{#if transfer.id}
															<span
																class="rounded-full bg-gray-600 px-3 py-1 text-xs font-semibold text-green-300"
																>Completed</span
															>
														{:else}
															<span
																class="rounded-full bg-gray-600 px-3 py-1 text-xs font-semibold text-yellow-300"
																>Processing</span
															>
														{/if}
													</div>
													<div class="flex items-center gap-4">
														<!-- Avatar -->
														<div
															class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-700 text-2xl font-bold text-gray-200"
														>
															{sft.symbol?.slice(0, 2) ?? '??'}
														</div>
														<div>
															<div class="text-lg font-semibold text-white">{sft.name}</div>
															<div class="text-xs text-gray-400">Transfer ID: {transfer.id}</div>
														</div>
													</div>
													<div class="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
														<div>
															<div class="text-gray-400">From Brokerage</div>
															<div class="text-white">
																{transfer.from.address.slice(0, 6)}...{transfer.from.address.slice(
																	-4
																)}
															</div>
														</div>
														<div>
															<div class="text-gray-400">Wallet Address</div>
															<div class="text-white">
																{transfer.to.address.slice(0, 6)}...{transfer.to.address.slice(-4)}
															</div>
														</div>
														<div>
															<div class="text-gray-400">Completed</div>
															<div class="text-white">
																{transfer.timestamp
																	? new Date(transfer.timestamp * 1000).toLocaleString()
																	: 'Pending'}
															</div>
														</div>
													</div>
													<!-- Message Bar -->
													{#if transfer.id}
														<div class="mt-4 rounded bg-green-900 px-4 py-2 text-xs text-green-200">
															Tokens Transferred TX: {transfer.id}
														</div>
													{:else}
														<div class="mt-4 rounded bg-blue-900 px-4 py-2 text-xs text-blue-200">
															Transfer in progress. Tokens will be automatically sent to your wallet
															once shares are received.
														</div>
													{/if}
												</div>
											{/each}
										{/each}
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Important Notice -->
		<div
			class="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/30 via-orange-900/30 to-red-900/20 p-6 backdrop-blur-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500"
				>
					<span class="text-xl font-bold text-gray-900">!</span>
				</div>
				<div>
					<h3 class="mb-3 text-xl font-semibold text-yellow-500">Important Requirements</h3>
					<div class="space-y-2 text-gray-300">
						<p>• Only U.S. equities are accepted for minting</p>
						<p>• Charles Schwab account strongly recommended for fastest processing</p>
						<p>• All transfers must be completed through official brokerage channels</p>
						<p>• Processing time may vary depending on your brokerage firm</p>
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
					<h3 class="mb-2 font-semibold text-yellow-500">Transfer Support</h3>
					<p class="mb-3 text-sm text-gray-400">For questions about asset transfers and minting</p>
					<a
						href="mailto:transfers@st0x.io"
						class="text-blue-400 transition-colors hover:text-blue-300"
					>
						transfers@st0x.io
					</a>
				</div>
				<div class="rounded-lg border border-white/10 bg-gray-700/30 p-6">
					<h3 class="mb-2 font-semibold text-yellow-500">General Support</h3>
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
