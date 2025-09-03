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
					class="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-400 bg-red-900/50"
					data-testid="error-icon"
				>
					<h1 class="text-lg md:text-2xl">❌</h1>
				</div>
				<p
					class="w-full whitespace-pre-wrap break-words text-center text-lg font-semibold"
					data-testid="error-status"
				>
					{$transactionStore.status}
				</p>
				<p
					class="w-full whitespace-pre-wrap break-words text-center font-normal"
					data-testid="error-message"
				>
					{$transactionStore.error}
				</p>
				{#if $transactionStore.error === TransactionErrorMessage.GENERIC}
					<a
						class="text-center text-white hover:text-yellow-500/50 hover:underline"
						href="https://q2i2qetuwucfyfgcamqsi2h33fgmlz26o4jlt3hlndyd5xk3xo2a.arweave.net/hpGoEnS1BFwUwgMhJGj72UzF5153Erns62jwPt1bu7Q"
						>Sarcophagus.io</a
					>
				{/if}
				{#if $transactionStore.hash}
					<TxLink
						hash={$transactionStore.hash}
						label="View transaction on block explorer"
						className="whitespace-pre-wrap break-words text-center text-sm text-white hover:text-yellow-500/50 hover:underline"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={() => handleClose()} className="mt-4" dataTestId="dismiss-button"
					>DISMISS</Button
				>
			{:else if $transactionStore.status === TransactionStatus.SUCCESS}
				<div
					class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-900/50"
					data-testid="success-icon"
				>
					<h1 class="text-lg md:text-2xl">✅</h1>
				</div>
				<div class="flex flex-col gap-4 text-center">
					<p
						class="w-full whitespace-pre-wrap break-words text-center text-lg font-semibold"
						data-testid="success-status"
					>
						{$transactionStore.status}
					</p>
					{#if $transactionStore.message}
						<p
							class="w-full break-words text-center text-sm font-normal"
							data-testid="success-message"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html $transactionStore.message}
						</p>
					{/if}

					{#if $transactionStore.hash}
						<div class="flex flex-col gap-2">
							<TxLink
								hash={$transactionStore.hash}
								label="View transaction"
								className="whitespace-pre-wrap break-words text-center text-white hover:text-yellow-500/50 hover:underline"
								dataTestId="view-transaction-link"
							/>
						</div>
					{/if}
				</div>

				<Button on:click={() => handleClose()} className="mt-4" dataTestId="dismiss-button"
					>DISMISS</Button
				>
			{:else if $transactionStore.status === TransactionStatus.CHECKING_ALLOWANCE || $transactionStore.status === TransactionStatus.PENDING_WALLET || $transactionStore.status === TransactionStatus.PENDING_APPROVAL}
				<div
					class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-600/50"
					data-testid="spinner"
				>
					<LoadingSpinner variant="button" size="lg" text="" showText={false} />
				</div>
				<p
					class="w-full whitespace-pre-wrap break-words text-center text-lg font-semibold"
					data-testid="pending-message"
				>
					{$transactionStore.message || $transactionStore.status}
				</p>
			{/if}
		</div>
	{/if}
</Modal>
