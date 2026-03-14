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

	// Helper function to format quantity with max 2 decimals
	const formatQuantity = (quantity: bigint, decimals: number): string => {
		const formatted = parseFloat(formatUnits(quantity, decimals));
		// Round to 2 decimals (instead of truncating) to handle values like 0.999999...
		const result = Math.round(formatted * 100) / 100;
		return result.toString();
	};

	// Check if fill is complete (within 99.9% tolerance)
	const isFullFill = (filled: bigint, requested: bigint): boolean => {
		if (requested === 0n) return true;
		const fillPercentage = Number(filled) / Number(requested);
		return fillPercentage >= 0.999;
	};
</script>

<Modal
	show={$transactionStore.status !== TransactionStatus.IDLE}
	title="Transaction"
	onClose={() => handleClose()}
>
	{#if $transactionStore.status !== TransactionStatus.IDLE}
		<div class="flex flex-col items-center justify-center gap-2 p-4 text-white" aria-live="polite">
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
							class="h-10 w-10 text-amber-500"
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
				<p class="text-xl font-bold text-white" data-testid="error-status">
					{#if isUserRejection}
						Transaction Cancelled
					{:else if isTimeout}
						Transaction Timed Out
					{:else}
						{$transactionStore.status}
					{/if}
				</p>
				<p class="mt-2 text-center text-base text-gray-300" data-testid="error-message">
					{$transactionStore.error}
				</p>
				{#if $transactionStore.error === TransactionErrorMessage.GENERIC}
					<p class="mt-2 text-center text-sm text-gray-400">
						If this issue persists, please contact support on our
						<a
							class="text-brand-gold-500 hover:text-brand-gold-400 hover:underline"
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
						className="inline-flex items-center gap-1 text-sm text-brand-gold-500 hover:text-brand-gold-400 hover:underline transition-colors justify-center"
						dataTestId="view-transaction-link"
					/>
				{/if}
				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button">
					Close
				</Button>
			{:else if $transactionStore.status === TransactionStatus.SUCCESS}
				<div class="mb-6 flex h-20 w-20 items-center justify-center" data-testid="success-icon">
					<svg class="h-20 w-20" viewBox="0 0 52 52" fill="none">
						<circle
							class="checkmark-circle"
							cx="26"
							cy="26"
							r="25"
							stroke="#22c55e"
							stroke-width="2"
							fill="none"
						/>
						<path
							class="checkmark-check"
							d="M14.1 27.2l7.1 7.2 16.7-16.8"
							stroke="#22c55e"
							stroke-width="3"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<div class="flex flex-col gap-4 text-center">
					<p class="text-xl font-bold text-white" data-testid="success-status">
						{$transactionStore.status}
					</p>
					{#if marketOrderDisplay && !marketOrderDisplay.isNoFill}
						<p class="text-base font-medium text-white">
							{marketOrderDisplay.direction === 'Buy' ? 'You now hold' : 'You sold'}
							{formatQuantity(marketOrderDisplay.assetAmount, marketOrderDisplay.assetDecimals)}
							{marketOrderDisplay.assetSymbol}
						</p>
					{/if}
					{#if $transactionStore.message}
						<p class="text-base text-gray-300" data-testid="success-message">
							{$transactionStore.message}
						</p>
					{/if}
					{#if raindexLink}
						<a
							href={raindexLink.url}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center justify-center gap-1 text-sm text-brand-gold-500 transition-colors hover:text-brand-gold-400 hover:underline"
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
							class="w-full rounded-md border border-brand-gold-900/50 bg-brand-gold-900/20 p-4 text-left text-sm text-brand-gold-200"
						>
							<div class="mb-3 text-xs uppercase tracking-wide text-brand-gold-600">
								No Tokens Available
							</div>
							<p class="mb-3">
								Your order was not filled. Our price protection system prevented execution at an
								unfavorable price. Try again with a smaller amount, or use a limit order to specify
								your desired price.
							</p>
						</div>
					{:else if marketOrderDisplay}
						<div
							class="w-full rounded-md border border-white/10 bg-gray-900/50 p-4 text-left text-sm text-gray-200"
						>
							<div class="mb-3 text-xs uppercase tracking-wide text-gray-400">
								Market Order Summary
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Side</span>
								<span class="font-medium">{marketOrderDisplay.direction}</span>
							</div>
							<div class="mt-2 flex justify-between">
								<span class="text-gray-400">Quantity Filled</span>
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
								<span class="text-gray-400">Average Price</span>
								<span class="font-medium">
									{marketOrderDisplay.price.toFixed(6)}
									{marketOrderDisplay.paymentSymbol}
								</span>
							</div>
							{#if marketOrderDisplay.isPartialFill}
								<div class="mt-3 rounded-md bg-brand-gold-900/30 p-2 text-xs text-brand-gold-200">
									Partial fill: not all requested quantity was available within your slippage
									tolerance. Use a limit order to specify an exact price.
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
								class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300"
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
								className="inline-flex items-center gap-1 text-sm text-brand-gold-500 hover:text-brand-gold-400 hover:underline transition-colors justify-center"
								dataTestId="view-transaction-link"
							/>
						</div>
						<a
							href="/dashboard"
							class="inline-flex items-center gap-1 text-sm text-brand-gold-500 transition-colors hover:text-brand-gold-400 hover:underline"
						>
							View in Dashboard
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</a>
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
							class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300"
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
					{#if assetTokenInfo && !marketOrderDisplay}
						<p class="mt-2 text-xs text-gray-400">
							When your order fills, withdraw tokens from
							<a
								href="/dashboard"
								class="text-brand-gold-500 hover:text-brand-gold-400 hover:underline"
								>Dashboard &gt; Vaults</a
							>.
						</p>
					{/if}
				</div>

				<Button on:click={() => handleClose()} className="mt-6" dataTestId="dismiss-button"
					>Close</Button
				>
			{:else if $transactionStore.status === TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT}
				<!-- Multi-transaction acknowledgment state -->
				<div
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20"
					data-testid="multi-tx-icon"
				>
					<svg
						class="h-10 w-10 text-amber-500"
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
				<p class="text-xl font-bold text-white" data-testid="multi-tx-title">
					Multiple Transactions Required
				</p>
				<p class="mt-2 text-center text-sm text-gray-400">
					This action requires multiple transactions. You'll be prompted to approve each one.
				</p>
				<p class="mt-4 text-center text-base text-gray-300" data-testid="multi-tx-message">
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
					class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gray-600/30 bg-gray-700/30"
					data-testid="spinner"
				>
					<LoadingSpinner variant="button" size="lg" text="" showText={false} />
				</div>
				<p class="text-lg font-medium text-gray-200" data-testid="pending-message">
					{$transactionStore.message || $transactionStore.status}
				</p>
				{#if multiTxProgress && multiTxProgress.totalBatches > 1}
					<p class="mt-2 text-sm text-gray-400" data-testid="multi-tx-progress">
						Transaction {multiTxProgress.currentBatch} of {multiTxProgress.totalBatches}
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</Modal>

<style>
	.checkmark-circle {
		stroke-dasharray: 166;
		stroke-dashoffset: 166;
		animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
	}
	.checkmark-check {
		stroke-dasharray: 48;
		stroke-dashoffset: 48;
		animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
	}
	@keyframes stroke {
		100% {
			stroke-dashoffset: 0;
		}
	}
</style>
