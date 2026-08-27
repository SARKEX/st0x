<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import transactionStore, { TransactionStatus } from '$lib/stores/wrapTransactionStore';
	import { TransactionErrorMessage } from '$lib/types/errors';

	const handleClose = () => transactionStore.reset();
</script>

<Modal
	show={$transactionStore.status !== TransactionStatus.IDLE}
	title="Transaction"
	onClose={handleClose}
>
	{#if $transactionStore.status !== TransactionStatus.IDLE}
		<div class="flex flex-col items-center justify-center gap-3 p-4 text-text">
			{#if $transactionStore.status === TransactionStatus.ERROR}
				{@const isUserRejection =
					$transactionStore.error === TransactionErrorMessage.USER_REJECTED_APPROVAL}
				<div
					class="mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20"
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
				<p class="text-xl font-bold" data-testid="error-status">
					{isUserRejection ? 'Transaction cancelled' : 'Transaction failed'}
				</p>
				<p class="text-center text-base text-text-2" data-testid="error-message">
					{$transactionStore.error}
				</p>
				{#if $transactionStore.hash}
					<TxLink
						hash={$transactionStore.hash}
						label="View transaction"
						head={30}
						tail={0}
						className="text-sm text-accent hover:underline"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={handleClose} className="mt-4" dataTestId="dismiss-button">Close</Button>
			{:else if $transactionStore.status === TransactionStatus.SUCCESS}
				<div
					class="mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-green-500/30 bg-green-500/20"
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
				<p class="text-xl font-bold" data-testid="success-status">Transaction confirmed</p>
				{#if $transactionStore.message}
					<p class="text-center text-base text-text-2" data-testid="success-message">
						{$transactionStore.message}
					</p>
				{/if}
				{#if $transactionStore.hash}
					<TxLink
						hash={$transactionStore.hash}
						label="View transaction"
						head={20}
						tail={0}
						className="text-sm text-accent hover:underline"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={handleClose} className="mt-4" dataTestId="dismiss-button">Done</Button>
			{:else}
				<div
					class="mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-line bg-surface-3"
					data-testid="spinner"
				>
					<LoadingSpinner variant="button" size="lg" text="" showText={false} />
				</div>
				<p class="text-center text-lg font-medium text-text-2" data-testid="pending-message">
					{$transactionStore.message || $transactionStore.status}
				</p>
			{/if}
		</div>
	{/if}
</Modal>
