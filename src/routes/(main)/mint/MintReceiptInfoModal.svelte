<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { OffchainAssetReceiptVault, Deposit } from '$lib/types/OffchainAssetReceiptVault';
	import { SFT_EXPLORER_URL, TARGET_NETWORK_EXPLORER_URL } from '$lib/network';

	export let showModal: boolean;
	export let sft: OffchainAssetReceiptVault | null = null;
	export let deposit: Deposit | null = null;
    
	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
	}

	function handleOverlayClick(event: MouseEvent | KeyboardEvent) {
		if (event instanceof MouseEvent && (event.target as HTMLElement).classList.contains('modal-overlay')) {
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
	<div class="fixed inset-0 z-40 bg-black/60 modal-overlay" on:click={handleOverlayClick} on:keydown={handleOverlayClick} role="button" tabindex="0" />
	<!-- Modal -->
	<div
		class="modal-content fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
		role="dialog"
		aria-label="Strategy information"
	>
		<div class="w-full sm:w-[50rem] max-h-[80vh] overflow-y-auto rounded-xl border border-white/5 bg-gray-900/95 p-8 shadow-2xl backdrop-blur-md relative pointer-events-auto">
			<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 rounded-t-xl" />
			<h3 class="mb-6 text-2xl font-bold bg-gradient-to-r from-yellow-500 to-green-500 bg-clip-text text-transparent">Deposit Information</h3>
            
            <div class="space-y-6">
                <!-- Asset Info -->
                <div class="relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30">
                    <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div class="flex items-center gap-4">
                        <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-700/20 text-2xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm">
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
                        <div class="text-sm text-gray-400">Depositor Address</div>
                        <div class="text-white font-mono">{deposit?.emitter.address.slice(0, 6)}...{deposit?.emitter.address.slice(-4)}</div>
                    </div>
                    <div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
                        <div class="text-sm text-gray-400">Deposit Timestamp</div>
                        <div class="text-white">
                            {deposit?.timestamp ? new Date(Number(deposit.timestamp) * 1000).toLocaleString() : 'Pending'}
                        </div>
                    </div>
                    <div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
                        <div class="text-sm text-gray-400">Transaction ID</div>
                        <div class="text-white font-mono">
                            <a 
                                href={`${TARGET_NETWORK_EXPLORER_URL}tx/${deposit?.transaction.id}`} 
                                target="_blank" rel="noopener noreferrer"
                                class="text-blue-500 hover:text-blue-400 underline"
                            >
                                {deposit?.transaction.id.slice(0, 6)}...{deposit?.transaction.id.slice(-4)}
                            </a>
                        </div>
                    </div>
                    <div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
                        <div class="text-sm text-gray-400">Receipt ID</div>
                        <div class="text-white font-mono">
                            <a 
                                href={`${SFT_EXPLORER_URL}/token/${sft?.id}/ERC1155s#receipt-${deposit?.receipt.receiptId}`} 
                                target="_blank" rel="noopener noreferrer"
                                class="text-blue-500 hover:text-blue-400 underline"
                            >
                                {deposit?.receipt.id.slice(0, 6)}...{deposit?.receipt.id.slice(-4)}
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Receipt ID -->
                <div class="rounded-xl border border-white/5 bg-gray-700/30 p-4">
                    <div class="text-sm text-gray-400">Receipt Receipt ID</div>
                    <div class="text-white font-mono">{deposit?.receipt.receiptId}</div>
                </div>
            </div>
		</div>
	</div>
{/if}