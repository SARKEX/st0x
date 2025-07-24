<script lang="ts">
	import { InfoCircleSolid } from 'flowbite-svelte-icons';
	import Footer from '$lib/components/Footer.svelte';
	import { sfts } from '$lib/stores';
	import MintReceiptInfoModal from './MintReceiptInfoModal.svelte';
	import { infoModalOpen } from '$lib/stores';
	import type { OffchainAssetReceiptVault, Deposit } from '$lib/types/OffchainAssetReceiptVault';
	import DepositChart from '$lib/components/charts/DepositChart.svelte';
	import CumulativeSupplyChart from '$lib/components/charts/CumulativeSupplyChart.svelte';
	import Header from '$lib/components/Header.svelte';
	import { currentNetwork } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let selectedSft: OffchainAssetReceiptVault | null = null;
	let selectedDeposit: Deposit | null = null;

	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	function truncateId(id: string, start: number = 6, end: number = 4) {
		if (!id) return '';
		if (id.length <= start + end + 3) return id;
		return `${id.slice(0, start)}....${id.slice(-end)}`;
	}
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..." />
	</div>
{:else if $sfts.length > 0}
	<div>
		<!-- Mint Content -->
		<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
			<div class="h-100 mb-4 w-full sm:mb-6">
				<DepositChart vaults={$sfts} />
			</div>
			<div class="h-100 mb-4 w-full sm:mb-6">
				<CumulativeSupplyChart vaults={$sfts} />
			</div>
			<!-- Mint Process -->
			<div class={SECTION_CLASSES}>
				<div class="space-y-4 sm:space-y-6">
					<div class="{CARD_BASE_CLASSES} p-4 sm:p-6">
						<div class="space-y-4 sm:space-y-6">
							<h2
								class="mb-4 bg-gradient-to-r from-yellow-500 to-green-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
							>
								Mint History
							</h2>
							{#each $sfts as sft}
								{#each sft.deposits.slice(0, 1) as deposit}
									<div
										class="relative mb-6 flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-lg sm:p-6"
									>
										<!-- Status Badge -->
										<div class="static flex flex-row gap-2 sm:absolute sm:right-4 sm:top-4">
											{#if deposit.id}
												<span
													class="rounded-full bg-gray-600 px-2 py-1 text-xs font-semibold text-green-300 sm:px-3"
													>Completed</span
												>
												<button
													class="info-button inline-block"
													aria-label="Show strategy information"
													on:click={() => {
														infoModalOpen.set(true);
														selectedSft = sft;
														selectedDeposit = deposit;
													}}
												>
													<InfoCircleSolid />
												</button>
											{:else}
												<span
													class="rounded-full bg-gray-600 px-2 py-1 text-xs font-semibold text-yellow-300 sm:px-3"
													>Processing</span
												>
											{/if}
										</div>
										<div class="flex items-center gap-3 sm:gap-4">
											<!-- Avatar -->
											<div
												class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-700 text-lg font-bold text-gray-200 sm:h-12 sm:w-12 sm:text-2xl"
											>
												{sft.symbol?.slice(0, 2) ?? '??'}
											</div>
											<div>
												<div class="text-base font-semibold text-white sm:text-lg">{sft.name}</div>
												<div class="text-xs text-gray-400">Transfer ID: {truncateId(deposit.id)}</div>
											</div>
										</div>
										<div
											class="mt-2 grid grid-cols-1 gap-4 text-xs sm:text-sm md:grid-cols-2 md:grid-cols-4"
										>
											<div>
												<div class="text-gray-400">From Brokerage</div>
												<div class="text-white">
													{deposit.emitter.address.slice(0, 6)}...{deposit.emitter.address.slice(-4)}
												</div>
											</div>
											<div>
												<div class="text-gray-400">Completed</div>
												<div class="text-white">
													{deposit.timestamp
														? new Date(Number(deposit.timestamp) * 1000).toLocaleString()
														: 'Pending'}
												</div>
											</div>
										</div>
										<!-- Message Bar -->
										{#if deposit.transaction.id}
											<div
												class="mt-4 overflow-x-auto rounded bg-green-900 px-4 py-2 text-xs text-green-200"
											>
												Tokens Minted TX: {truncateId(deposit.transaction.id)}
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
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">No SFTs available on {$currentNetwork?.displayName || 'this network'}.</p>
		</div>
	</div>
{/if}



<MintReceiptInfoModal
	bind:showModal={$infoModalOpen}
	on:close={() => infoModalOpen.set(false)}
	sft={selectedSft}
	deposit={selectedDeposit}
/>
