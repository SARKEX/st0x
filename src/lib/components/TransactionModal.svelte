<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import transactionStore, { TransactionStatus } from '$lib/stores/transaction';
	import { TransactionErrorMessage } from '$lib/types/errors';
	// currentNetwork not needed directly; TxLink uses it from store
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import { formatUnits } from 'viem';
	import { translateMarketOrderForDisplay } from '$lib/utils/transactionDisplay';
	import { addTokenToWallet } from '$lib/utils/walletUtils';
	import { authMethod } from '$lib/stores/authStore';
	import { dynamicSession } from '$lib/stores/dynamicStore';

	// Hide track in wallet buttons for embedded wallets
	$: isEmbeddedWallet = $authMethod === 'dynamic' && $dynamicSession?.walletType === 'embedded';

	const handleClose = () => {
		return transactionStore.reset();
	};

	const handleMultiTxAcknowledge = () => {
		transactionStore.acknowledgeMultiTx();
	};

	$: marketOrderSummary = $transactionStore.data?.marketOrderSummary;
	$: marketOrderDisplay = marketOrderSummary
		? translateMarketOrderForDisplay(marketOrderSummary)
		: null;

	// Asset token info for limit/DCA order deployments
	$: assetTokenInfo = $transactionStore.data?.assetTokenInfo;

	// Multi-transaction progress
	$: multiTxProgress = $transactionStore.data?.multiTxProgress;

	// Raindex link (safe, no @html needed)
	$: raindexLink = $transactionStore.data?.raindexLink;

	// Enough precision that small underfills (e.g. 0.01985 vs 0.02) are visible — 2 decimals rounded away that gap.
	const formatQuantity = (quantity: bigint, decimals: number): string => {
		const s = formatUnits(quantity, decimals);
		const n = parseFloat(s);
		if (!Number.isFinite(n)) return s;
		return n.toLocaleString('en-US', {
			useGrouping: false,
			minimumFractionDigits: 0,
			maximumFractionDigits: 8
		});
	};

	/** Match `pollAndFinalizeTakeOrders` partial-fill threshold. */
	const FULL_FILL_BPS = 9970n;
	const isFullFill = (filled: bigint, requested: bigint): boolean => {
		if (requested === 0n) return true;
		return filled * 10_000n >= requested * FULL_FILL_BPS;
	};
</script>

<Modal
	show={$transactionStore.status !== TransactionStatus.IDLE}
	title="Transaction"
	onClose={() => handleClose()}
>
	{#if $transactionStore.status !== TransactionStatus.IDLE}
		<div class="flex flex-col items-center justify-center gap-2 p-4 text-text">
			{#if $transactionStore.status === TransactionStatus.ERROR}
				{@const isUserRejection =
					$transactionStore.error === TransactionErrorMessage.USER_REJECTED_APPROVAL}
				{@const isTimeout = $transactionStore.error === TransactionErrorMessage.TIMEOUT}
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border {isUserRejection
						? 'border-amber-500/30 bg-amber-500/20'
						: 'border-red-500/30 bg-red-500/20'}"
					data-testid="error-icon"
				>
					{#if isUserRejection}
						<!-- Hand/stop icon for user rejection -->
						<svg
							class="h-10 w-10 text-amber-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
							/>
						</svg>
					{:else if isTimeout}
						<!-- Clock icon for timeout -->
						<svg
							class="h-10 w-10 text-red-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{:else}
						<svg
							class="h-10 w-10 text-red-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{/if}
				</div>
				<p class="text-xl font-bold text-text" data-testid="error-status">
					{#if isUserRejection}
						Transaction Cancelled
					{:else if isTimeout}
						Transaction Timeout
					{:else}
						{$transactionStore.status}
					{/if}
				</p>
				<p class="mt-2 text-center text-base text-text-2" data-testid="error-message">
					{$transactionStore.error}
				</p>
				{#if $transactionStore.error === TransactionErrorMessage.GENERIC}
					<p class="mt-2 text-center text-sm text-text-2">
						If this issue persists, please contact support on our
						<a
							class="text-accent hover:text-accent-bright hover:underline"
							href="https://t.me/st0xio"
							target="_blank"
							rel="noopener noreferrer">Telegram group</a
						>.
					</p>
				{/if}
				{#if $transactionStore.hash}
					<TxLink
						hash={$transactionStore.hash}
						label="View transaction on block explorer"
						head={30}
						tail={0}
						className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-bright hover:underline transition-colors justify-center"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button">
					{isUserRejection ? 'Close' : 'Dismiss'}
				</Button>
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
					<p class="text-xl font-bold text-text" data-testid="success-status">
						{$transactionStore.status}
					</p>
					{#if $transactionStore.message}
						<p class="text-base text-text-2" data-testid="success-message">
							{$transactionStore.message}
						</p>
					{/if}
					{#if raindexLink}
						<a
							href={raindexLink.url}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center justify-center gap-1 text-sm text-accent transition-colors hover:text-accent-bright hover:underline"
							data-testid="raindex-link"
						>
							{raindexLink.text}
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
								/>
							</svg>
						</a>
					{/if}

					<!-- Market order summary or no-fill message -->
					{#if marketOrderDisplay?.isNoFill}
						<div
							class="w-full rounded-md border border-amber-900/50 bg-amber-900/20 p-4 text-left text-sm text-amber-200"
						>
							<div class="mb-3 text-xs uppercase tracking-wide text-amber-600">
								No Tokens Available
							</div>
							<p class="mb-3">
								No tokens available within 10% of oracle prices. During testing we have a guardrail
								to avoid unfavourable prices. If you still want to make this purchase, use a limit
								order and specify the desired price.
							</p>
						</div>
					{:else if marketOrderDisplay}
						<div
							class="w-full rounded-md border border-line bg-surface-1 p-4 text-left text-sm text-text-2"
						>
							<div class="mb-3 text-xs uppercase tracking-wide text-text-3">
								Market Order Summary
							</div>
							<div class="flex justify-between">
								<span class="text-text-2">Side</span>
								<span class="font-medium">{marketOrderDisplay.direction}</span>
							</div>
							<div class="mt-2 flex justify-between">
								<span class="text-text-2">Quantity Filled</span>
								<span class="font-medium">
									{formatQuantity(marketOrderDisplay.assetAmount, marketOrderDisplay.assetDecimals)}
									{!isFullFill(marketOrderDisplay.assetAmount, marketOrderDisplay.requestedAmount)
										? `/ ${formatQuantity(
												marketOrderDisplay.requestedAmount,
												marketOrderDisplay.assetDecimals
											)}`
										: ''}
									{marketOrderDisplay.assetSymbol}
								</span>
							</div>
							<div class="mt-2 flex justify-between">
								<span class="text-text-2">Average Price</span>
								<span class="font-medium">
									{marketOrderDisplay.price.toFixed(6)}
									{marketOrderDisplay.paymentSymbol}
								</span>
							</div>
							{#if marketOrderDisplay.isPartialFill}
								<div class="mt-3 rounded-md bg-amber-900/30 p-2 text-xs text-amber-200">
									Partial fill: not all requested quantity was available within slippage tolerance.
									We currently have a guardrail to avoid unfavourable prices. To ignore guardrails,
									use a limit order.
								</div>
							{/if}
						</div>
						<!-- Track in Wallet button - only for Buy orders with non-zero fill, hidden for embedded wallets -->
						{#if marketOrderDisplay.direction === 'Buy' && !marketOrderDisplay.isNoFill && marketOrderDisplay.assetAddress && !isEmbeddedWallet}
							<button
								type="button"
								on:click={() =>
									addTokenToWallet({
										address: marketOrderDisplay.assetAddress,
										symbol: marketOrderDisplay.assetSymbol,
										decimals: marketOrderDisplay.assetDecimals
									})}
								class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-text-2 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-300"
							>
								<svg
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								Track {marketOrderDisplay.assetSymbol} in Wallet
							</button>
						{/if}
					{/if}

					{#if $transactionStore.hash}
						<div class="flex flex-col gap-2">
							<TxLink
								hash={$transactionStore.hash}
								label="View transaction"
								head={20}
								tail={0}
								className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-bright hover:underline transition-colors justify-center"
								dataTestId="view-transaction-link"
							/>
						</div>
					{/if}

					<!-- Track in Wallet button for limit/DCA order deployments (not market orders), hidden for embedded wallets -->
					{#if assetTokenInfo && !marketOrderDisplay && !isEmbeddedWallet}
						<button
							type="button"
							on:click={() =>
								addTokenToWallet({
									address: assetTokenInfo.address,
									symbol: assetTokenInfo.symbol,
									decimals: assetTokenInfo.decimals
								})}
							class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-text-2 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300"
						>
							<svg
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							Track {assetTokenInfo.symbol} in Wallet
						</button>
					{/if}
				</div>

				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button"
					>Dismiss</Button
				>
			{:else if $transactionStore.status === TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT}
				<!-- Multi-transaction acknowledgment state -->
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20"
					data-testid="multi-tx-icon"
				>
					<svg
						class="h-10 w-10 text-amber-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<p class="text-xl font-bold text-text" data-testid="multi-tx-title">
					Multiple Transactions Required
				</p>
				<p class="mt-4 text-center text-base text-text-2" data-testid="multi-tx-message">
					{$transactionStore.message}
				</p>
				<Button
					on:click={handleMultiTxAcknowledge}
					className="mt-6"
					dataTestId="multi-tx-ok-button"
				>
					OK
				</Button>
			{:else if $transactionStore.status === TransactionStatus.CHECKING_ALLOWANCE || $transactionStore.status === TransactionStatus.PENDING_WALLET || $transactionStore.status === TransactionStatus.PENDING_APPROVAL}
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-line bg-surface-3"
					data-testid="spinner"
				>
					<LoadingSpinner variant="button" size="lg" text="" showText={false} />
				</div>
				<p class="text-lg font-medium text-text-2" data-testid="pending-message">
					{$transactionStore.message || $transactionStore.status}
				</p>
				{#if multiTxProgress && multiTxProgress.totalBatches > 1}
					<p class="mt-2 text-sm text-text-2" data-testid="multi-tx-progress">
						Transaction {multiTxProgress.currentBatch} of {multiTxProgress.totalBatches}
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</Modal>
