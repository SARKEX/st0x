<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		showDepositModal,
		closeDepositModal,
		depositModalInitialView,
		dynamicSession
	} from '$lib/stores/dynamicStore';
	import { currentNetwork } from '$lib/stores';

	type View = 'options' | 'deposit';

	let currentView: View = 'options';

	// Reset view when modal opens
	$: if ($showDepositModal) {
		currentView = $depositModalInitialView === 'buy' ? 'options' : ($depositModalInitialView as View);
	}

	function handleClose() {
		closeDepositModal();
		currentView = 'options';
	}

	function copyAddress() {
		if ($dynamicSession?.walletAddress) {
			navigator.clipboard.writeText($dynamicSession.walletAddress);
		}
	}

	// Get block explorer URL for the current network
	$: explorerUrl = $currentNetwork?.blockExplorerUrl ?? 'https://basescan.org';
</script>

<Modal show={$showDepositModal} title="Add Funds" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-4">
		{#if currentView === 'options'}
			<!-- Option: Deposit from another wallet -->
			<button
				type="button"
				on:click={() => (currentView = 'deposit')}
				class="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-left transition hover:border-gray-600 hover:bg-gray-800"
			>
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-green-500/20 p-2">
						<svg class="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
						</svg>
					</div>
					<div>
						<h3 class="font-semibold text-white">Deposit Crypto</h3>
						<p class="text-sm text-gray-400">Transfer from another wallet or exchange</p>
					</div>
				</div>
			</button>
		{:else if currentView === 'deposit'}
			<!-- Deposit instructions -->
			<div class="space-y-4">
				<button
					type="button"
					on:click={() => (currentView = 'options')}
					class="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
					Back
				</button>

				<div class="rounded-lg bg-gray-800/50 p-4">
					<h3 class="mb-2 font-semibold text-white">Your Wallet Address</h3>
					<p class="mb-3 text-sm text-gray-400">
						Send ETH or USDC on Base network to this address:
					</p>

					<div class="flex items-center gap-2 rounded-lg bg-gray-900 p-3">
						<code class="flex-1 break-all text-sm text-gray-300">
							{$dynamicSession?.walletAddress ?? 'Not connected'}
						</code>
						<button
							type="button"
							on:click={copyAddress}
							class="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
							title="Copy address"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
						</button>
					</div>

					<div class="mt-4 space-y-2 text-sm text-gray-400">
						<p class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
							Only send assets on the <strong class="text-white">Base</strong> network
						</p>
						<p class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							Deposits typically arrive within a few minutes
						</p>
					</div>
				</div>

				{#if $dynamicSession?.walletAddress}
					<a
						href={`${explorerUrl}/address/${$dynamicSession.walletAddress}`}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center justify-center gap-1 text-sm text-blue-400 hover:text-blue-300"
					>
						View on block explorer
						<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
						</svg>
					</a>
				{/if}

				<Button on:click={handleClose} variant="primary" fullWidth>
					Done
				</Button>
			</div>
		{/if}
	</div>
</Modal>
