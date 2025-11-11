<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import transactionStore, { TransactionStatus } from '$lib/transactionStore';
	import { TransactionErrorMessage } from '$lib/types/errors';
	// currentNetwork not needed directly; TxLink uses it from store
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import { formatUnits } from 'viem';

	const handleClose = () => {
		return transactionStore.reset();
	};

	$: marketOrderSummary = $transactionStore.data?.marketOrderSummary;
</script>

<Modal
	show={$transactionStore.status !== TransactionStatus.IDLE}
	title="Transaction"
	onClose={() => handleClose()}
>
	{#if $transactionStore.status !== TransactionStatus.IDLE}
		<div class="flex flex-col items-center justify-center gap-2 p-4 text-white">
			{#if $transactionStore.status === TransactionStatus.ERROR}
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20"
					data-testid="error-icon"
				>
					<svg class="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</div>
				<p class="text-xl font-bold text-white" data-testid="error-status">
					{$transactionStore.status}
				</p>
				<p class="mt-2 text-base text-gray-300" data-testid="error-message">
					{$transactionStore.error}
				</p>
				{#if $transactionStore.error === TransactionErrorMessage.GENERIC}
					<a
						class="text-center text-white hover:text-yellow-500/50 hover:underline"
						href="https://platform.st0x.io/">platform.st0x.io</a
					>
				{/if}
				{#if $transactionStore.hash}
					<TxLink
						hash={$transactionStore.hash}
						label="View transaction on block explorer"
						head={30}
						tail={0}
						className="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button"
					>Dismiss</Button
				>
			{:else if $transactionStore.status === TransactionStatus.SUCCESS}
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-green-500/30 bg-green-500/20"
					data-testid="success-icon"
				>
					<svg
						class="h-10 w-10 text-green-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<div class="flex flex-col gap-4 text-center">
					<p class="text-xl font-bold text-white" data-testid="success-status">
						{$transactionStore.status}
					</p>
					{#if $transactionStore.message}
						<div class="text-base text-gray-300" data-testid="success-message">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html $transactionStore.message}
						</div>
					{/if}

					{#if marketOrderSummary}
						<div class="w-full rounded-md border border-white/10 bg-gray-900/50 p-4 text-left text-sm text-gray-200">
							<div class="mb-3 text-xs uppercase tracking-wide text-gray-500">
								Market Order Summary
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Side</span>
								<span class="font-medium">{marketOrderSummary.orderSide}</span>
							</div>
							<div class="mt-2 flex justify-between">
								<span class="text-gray-400">Quantity Filled</span>
								<span class="font-medium">
									{formatUnits(
										marketOrderSummary.quantityFilled,
										marketOrderSummary.outputTokenDecimals
									)}
									{marketOrderSummary.outputTokenSymbol}
								</span>
							</div>
							<div class="mt-2 flex justify-between">
								<span class="text-gray-400">Average Price</span>
								<span class="font-medium">
									{marketOrderSummary.averagePrice.toFixed(6)} {marketOrderSummary.paymentTokenSymbol}
								</span>
							</div>
							{#if marketOrderSummary.isPartialFill}
								<div class="mt-3 rounded-md bg-yellow-900/30 p-2 text-xs text-yellow-200">
									Partial fill: not all requested quantity was available within the selected slippage.
								</div>
							{/if}
						</div>
					{/if}

					{#if $transactionStore.hash}
						<div class="flex flex-col gap-2">
							<TxLink
								hash={$transactionStore.hash}
								label="View transaction"
								head={20}
								tail={0}
								className="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors justify-center"
								dataTestId="view-transaction-link"
							/>
						</div>
					{/if}
				</div>

				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button"
					>Dismiss</Button
				>
			{:else if $transactionStore.status === TransactionStatus.CHECKING_ALLOWANCE || $transactionStore.status === TransactionStatus.PENDING_WALLET || $transactionStore.status === TransactionStatus.PENDING_APPROVAL}
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gray-600/30 bg-gray-700/30"
					data-testid="spinner"
				>
					<LoadingSpinner variant="button" size="lg" text="" showText={false} />
				</div>
				<p class="text-lg font-medium text-gray-200" data-testid="pending-message">
					{$transactionStore.message || $transactionStore.status}
				</p>
			{/if}
		</div>
	{/if}
</Modal>
