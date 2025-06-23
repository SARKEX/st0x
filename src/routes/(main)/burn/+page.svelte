<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { infoModalOpen } from '$lib/stores';
	import Footer from '$lib/components/Footer.svelte';
	import WithdrawChart from '$lib/components/charts/WithdrawChart.svelte';
	import CumulativeSupplyChart from '$lib/components/charts/CumulativeSupplyChart.svelte';
	import { sfts } from '$lib/stores';
	import { ArrowRightToBracketOutline, InfoCircleSolid } from 'flowbite-svelte-icons';
	import type { OffchainAssetReceiptVault, Withdraw } from '$lib/types/OffchainAssetReceiptVault';
	import BurnReceiptInfoModal from './BurnReceiptInfoModal.svelte';
	import Header from '$lib/components/Header.svelte';

	let selectedSft: OffchainAssetReceiptVault | null = null;
	let selectedDeposit: Withdraw | null = null;

	const BURN_ISSUERS = [
		{
			issuerName: 'Charles Schwab',
			issuerInfo:
				'lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
			issuerLink: 'https://st0x.io/'
		}
	];

	// Utility Classes
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<Header title="Burn" description="Redeem tokens for underlying securities" />

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
					Redeem your tokenized assets for underlying securities.
				</p>
			</div>
		</div>
		<div class="h-100 mb-4 sm:mb-6">
			<WithdrawChart vaults={$sfts} />
		</div>
		<div class="h-100 mb-4 sm:mb-6">
			<CumulativeSupplyChart vaults={$sfts} />
		</div>
		<!-- Burn Process -->
		<div class={SECTION_CLASSES}>
			<div class="mb-8">
				<h2
					class="mb-4 bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					Burn Partners
				</h2>
			</div>
			<div class="space-y-6">
				<div class="{CARD_BASE_CLASSES} p-6">
					<div class="space-y-6">
						{#each BURN_ISSUERS as issuer}
							<div
								class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-orange-500/30 hover:bg-gray-700/40"
							>
								<div
									class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-orange-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
								/>
								<div class="flex items-start gap-6">
									<div
										class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600/20 to-orange-700/20 text-2xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm"
									>
										{issuer.issuerName.slice(0, 2).toUpperCase() ?? '??'}
									</div>
									<div class="flex-1 space-y-2">
										<div class="flex items-center justify-between">
											<h3 class="text-xl font-semibold text-white">{issuer.issuerName}</h3>
											<a
												href={issuer.issuerLink}
												target="_blank"
												rel="noopener noreferrer"
												class="text-sm text-orange-500 transition-colors hover:text-orange-400"
											>
												<div class="flex items-center justify-center gap-2">
													Link to Issuer
													<ArrowRightToBracketOutline />
												</div>
											</a>
										</div>
										<p class="text-sm leading-relaxed text-gray-400">{issuer.issuerInfo}</p>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="{CARD_BASE_CLASSES} p-6">
					<div class="space-y-6">
						<h2
							class="mb-4 bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-2xl font-bold text-transparent"
						>
							Burn History
						</h2>
						{#each $sfts as sft}
							{#each sft.withdraws.slice(0, 10) as withdraw}
								<div
									class="group relative mb-6 flex flex-col gap-4 rounded-lg border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-orange-500/30 hover:bg-gray-700/40"
								>
									<div
										class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-orange-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
									/>
									<!-- Status Badge -->
									<div class="absolute right-4 top-4 flex items-center gap-2">
										{#if withdraw.id}
											<span
												class="rounded-full bg-gray-600 px-3 py-1 text-xs font-semibold text-orange-300"
												>Completed</span
											>
											<button
												class="info-button inline-block text-orange-500 transition-colors hover:text-orange-400"
												aria-label="Show strategy information"
												on:click={() => {
													infoModalOpen.set(true);
													selectedSft = sft;
													selectedDeposit = withdraw;
												}}
											>
												<InfoCircleSolid />
											</button>
										{:else}
											<span
												class="rounded-full bg-gray-600 px-3 py-1 text-xs font-semibold text-orange-300"
												>Processing</span
											>
										{/if}
									</div>
									<div class="flex items-center gap-4">
										<!-- Avatar -->
										<div
											class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-600/20 to-orange-700/20 text-2xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm"
										>
											{sft.symbol?.slice(0, 2) ?? '??'}
										</div>
										<div>
											<div class="text-lg font-semibold text-white">{sft.name}</div>
											<div class="text-xs text-gray-400">Transfer ID: {withdraw.id}</div>
										</div>
									</div>
									<div class="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
										<div>
											<div class="text-gray-400">From Brokerage</div>
											<div class="text-white">
												{withdraw.emitter.address.slice(0, 6)}...{withdraw.emitter.address.slice(
													-4
												)}
											</div>
										</div>
										<div>
											<div class="text-gray-400">Completed</div>
											<div class="text-white">
												{withdraw.timestamp
													? new Date(Number(withdraw.timestamp) * 1000).toLocaleString()
													: 'Pending'}
											</div>
										</div>
									</div>
									<!-- Message Bar -->
									{#if withdraw.transaction.id}
										<div class="mt-4 rounded bg-red-900/50 px-4 py-2 text-xs text-orange-200">
											Tokens Burned TX: {withdraw.transaction.id}
										</div>
									{/if}
								</div>
							{/each}
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
	<Footer />
</div>

<BurnReceiptInfoModal
	bind:showModal={$infoModalOpen}
	on:close={() => infoModalOpen.set(false)}
	sft={selectedSft}
	withdraw={selectedDeposit}
/>
