<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import transactionStore from '$lib/transactionStore';
	import { TransactionStatus } from '$lib/transactionStore';
	import { TransactionErrorMessage } from '$lib/types/errors';
	// currentNetwork not needed directly; TxLink uses it from store
	import TxLink from '$lib/components/ui/TxLink.svelte';

	const handleClose = () => {
		return transactionStore.reset();
	};
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
						href="https://platform.st0x.io/"
						>platform.st0x.io</a
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
