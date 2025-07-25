<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { OffchainAssetReceiptVault, Withdraw } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork } from '$lib/stores';

	export let showModal: boolean;
	export let sft: OffchainAssetReceiptVault | null = null;
	export let withdraw: Withdraw | null = null;

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
	}

	function handleOverlayClick(event: MouseEvent | KeyboardEvent) {
		if (
			event instanceof MouseEvent &&
			(event.target as HTMLElement).classList.contains('modal-overlay')
		) {
			closeModal();
		} else if (event instanceof KeyboardEvent && event.key === 'Escape') {
			closeModal();
		}
	}

	$: if (showModal) {
		document.addEventListener('click', handleOverlayClick);
	} else {
		document.removeEventListener('click', handleOverlayClick);
	}
</script>

{#if showModal}
	<!-- Overlay -->
	<div
		class="modal-overlay fixed inset-0 z-40 bg-black/60"
		on:click={handleOverlayClick}
		on:keydown={handleOverlayClick}
		role="button"
		tabindex="0"
	/>
	<!-- Modal -->
	<div
		class="modal-content pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
		role="dialog"
		aria-label="Strategy information"
	>
		<div
			class="pointer-events-auto relative max-h-[80vh] w-full overflow-y-auto rounded-xl border border-white/5 bg-gray-900/95 p-8 shadow-2xl backdrop-blur-md sm:w-[50rem]"
		>
			<div
				class="absolute left-0 right-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500"
			/>
			<h3
				class="mb-6 bg-gradient-to-r from-yellow-500 to-green-500 bg-clip-text text-2xl font-bold text-transparent"
			>
				Burn Information
			</h3>

			<div class="space-y-6">
				<!-- Asset Info -->
				<div
					class="relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
				>
					<div
						class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
					/>
					<div class="flex items-center gap-4">
						<div
							class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-700/20 text-2xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm"
						>
							{sft?.symbol?.slice(0, 2) ?? '??'}
						</div>
						<div>
							<h2 class="text-xl font-semibold text-white">{sft?.name}</h2>
						</div>
					</div>
				</div>

				<!-- Deposit Details -->
				<div class="grid gap-4 md:grid-cols-2">
					<div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
						<div class="text-sm text-gray-400">Burner Address</div>
						<div class="font-mono text-white">
							{withdraw?.emitter.address.slice(0, 6)}...{withdraw?.emitter.address.slice(-4)}
						</div>
					</div>
					<div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
						<div class="text-sm text-gray-400">Burn Timestamp</div>
						<div class="text-white">
							{withdraw?.timestamp
								? new Date(Number(withdraw.timestamp) * 1000).toLocaleString()
								: 'Pending'}
						</div>
					</div>
					<div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
						<div class="text-sm text-gray-400">Transaction ID</div>
						<div class="font-mono text-white">
							<a
								href={`${$currentNetwork.blockExplorer}/tx/${withdraw?.transaction.id}`}
								target="_blank"
								rel="noopener noreferrer"
								class="text-blue-500 underline hover:text-blue-400"
							>
								{withdraw?.transaction.id.slice(0, 6)}...{withdraw?.transaction.id.slice(-4)}
							</a>
						</div>
					</div>
					<div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
						<div class="text-sm text-gray-400">Receipt ID</div>
						<div class="font-mono text-white">
							<a
								href={`${$currentNetwork.sftExplorer}/token/${sft?.id}/withdraw/${withdraw?.id}`}
								target="_blank"
								rel="noopener noreferrer"
								class="text-blue-500 underline hover:text-blue-400"
							>
								{withdraw?.receipt.id.slice(0, 6)}...{withdraw?.receipt.id.slice(-4)}
							</a>
						</div>
					</div>
				</div>

				<!-- Receipt ID -->
				<div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
					<div class="text-sm text-gray-400">Receipt Receipt ID</div>
					<div class="font-mono text-white">{withdraw?.receipt.receiptId}</div>
				</div>
			</div>
		</div>
	</div>
{/if}
