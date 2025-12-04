<script lang="ts">
	import { connected, signerAddress, web3Modal, wagmiConfig } from 'svelte-wagmi';
	import { currentNetwork, sfts } from '$lib/stores';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { goto } from '$app/navigation';
	import { readContract } from '@wagmi/core';
	import { erc20Abi, formatUnits, parseUnits } from 'viem';
	import { createQuery } from '@tanstack/svelte-query';
	import { createOrderbookQuotesQuery } from '$lib/queries/orderbook';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { normalizeAddress, parseFloatHex } from '$lib/utils/tokenMath';
	import type { ProcessedQuote } from '$lib/utils/orderbook';
	import Button from './ui/Button.svelte';

	// Get tokens for current network - filter to ST0x (tradable stocks)
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];
	$: tradableTokens = ALL_TOKENS.filter((t) => t.category === 'ST0x');

	// State
	let selectedTokenAddress: string | null = null;
	let topAmount = ''; // Top field (USDC when buying, token when selling)
	let bottomAmount = ''; // Bottom field (token when buying, USDC when selling)
	let isDropdownOpen = false;
	let isBuying = true; // true = USDC on top, token on bottom (buying token)
	let lastEditedField: 'top' | 'bottom' | null = null;

	// Auto-select first token
	$: if (tradableTokens.length > 0 && !selectedTokenAddress) {
		selectedTokenAddress = tradableTokens[0].address;
	}

	$: selectedToken = tradableTokens.find(
		(t) => t.address.toLowerCase() === selectedTokenAddress?.toLowerCase()
	);

	// Payment token (USDC)
	$: paymentToken = $currentNetwork?.defaultPaymentToken;

	// USDC balance query
	$: usdcBalanceQuery = createQuery({
		queryKey: ['usdcBalance', $currentNetwork?.id, paymentToken?.address, $signerAddress],
		queryFn: async () => {
			if (!paymentToken?.address || !$signerAddress || !$wagmiConfig) {
				return 0n;
			}
			const balance = await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$signerAddress as `0x${string}`]
			});
			return balance as bigint;
		},
		enabled: Boolean(paymentToken?.address && $signerAddress && $wagmiConfig)
	});

	$: usdcBalance = $usdcBalanceQuery.data ?? 0n;
	$: usdcDecimals = paymentToken?.decimals ?? 6;
	$: formattedUsdcBalance = Number(formatUnits(usdcBalance, usdcDecimals));

	// Global orderbook quotes
	$: orderbookQuery = createOrderbookQuotesQuery($currentNetwork, true);

	// Filter quotes for selected token
	$: askQuotes = (() => {
		if (!selectedToken || !paymentToken) return [];
		const allQuotes = $orderbookQuery.data?.quotes ?? [];
		const assetAddress = normalizeAddress(selectedToken.address);
		const quoteAddress = normalizeAddress(paymentToken.address);

		return allQuotes
			.filter((quote: ProcessedQuote) => {
				const inputAddr = normalizeAddress(quote.inputTokenAddress);
				const outputAddr = normalizeAddress(quote.outputTokenAddress);
				const price = quote.quotePerAsset;
				return (
					inputAddr === quoteAddress &&
					outputAddr === assetAddress &&
					quote.side === 'ask' &&
					price !== undefined &&
					Number.isFinite(price) &&
					price > 0
				);
			})
			.sort((a, b) => (a.quotePerAsset ?? Infinity) - (b.quotePerAsset ?? Infinity));
	})();

	$: bidQuotes = (() => {
		if (!selectedToken || !paymentToken) return [];
		const allQuotes = $orderbookQuery.data?.quotes ?? [];
		const assetAddress = normalizeAddress(selectedToken.address);
		const quoteAddress = normalizeAddress(paymentToken.address);

		return allQuotes
			.filter((quote: ProcessedQuote) => {
				const inputAddr = normalizeAddress(quote.inputTokenAddress);
				const outputAddr = normalizeAddress(quote.outputTokenAddress);
				const price = quote.quotePerAsset;
				return (
					inputAddr === assetAddress &&
					outputAddr === quoteAddress &&
					quote.side === 'bid' &&
					price !== undefined &&
					Number.isFinite(price) &&
					price > 0
				);
			})
			.sort((a, b) => (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0)); // Best bid first (highest)
	})();

	// Compute quote based on which field was edited
	$: quote = computeQuote(
		isBuying,
		lastEditedField,
		topAmount,
		bottomAmount,
		askQuotes,
		bidQuotes,
		selectedToken,
		paymentToken
	);

	function computeQuote(
		buying: boolean,
		editedField: 'top' | 'bottom' | null,
		top: string,
		bottom: string,
		asks: ProcessedQuote[],
		bids: ProcessedQuote[],
		asset: (typeof tradableTokens)[0] | undefined,
		payment: typeof paymentToken
	) {
		if (!asset || !payment || !editedField) return null;

		const assetDecimals = asset.decimals ?? 18;
		const paymentDecimals = payment.decimals ?? 6;

		// Top is always USDC, bottom is always token
		if (buying) {
			// Buying: give USDC (top), receive token (bottom)
			const quotes = asks;
			if (quotes.length === 0) return null;

			if (editedField === 'top') {
				// User entered USDC amount, calculate tokens out
				const usdcAmount = parseFloat(top);
				if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
				return walkUsdcToTokens(usdcAmount, quotes, assetDecimals, paymentDecimals);
			} else {
				// User entered token amount, calculate USDC cost
				const tokenAmount = parseFloat(bottom);
				if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
				return walkTokensToUsdc(tokenAmount, quotes, assetDecimals, paymentDecimals, 'buy');
			}
		} else {
			// Selling: give token (bottom), receive USDC (top)
			const quotes = bids;
			if (quotes.length === 0) return null;

			if (editedField === 'bottom') {
				// User entered token amount, calculate USDC received
				const tokenAmount = parseFloat(bottom);
				if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
				return walkTokensToUsdc(tokenAmount, quotes, assetDecimals, paymentDecimals, 'sell');
			} else {
				// User entered USDC amount, calculate tokens needed
				const usdcAmount = parseFloat(top);
				if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
				return walkUsdcToTokensSell(usdcAmount, quotes, assetDecimals, paymentDecimals);
			}
		}
	}

	// Walk orderbook: USDC input -> tokens output (for buying)
	function walkUsdcToTokens(
		usdcAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number
	) {
		let remainingUsdc = parseUnits(usdcAmount.toString(), paymentDecimals);
		let totalTokensOut = 0n;
		let weightedPriceSum = 0;

		for (const q of quotes) {
			if (remainingUsdc <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxAssetAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? assetDecimals;
				maxAssetAvailable = parseFloatHex(q.maxOutput, outputDecimals);
				if (outputDecimals !== assetDecimals) {
					const scale = 10n ** BigInt(Math.abs(assetDecimals - outputDecimals));
					maxAssetAvailable =
						outputDecimals < assetDecimals ? maxAssetAvailable * scale : maxAssetAvailable / scale;
				}
			}
			if (maxAssetAvailable <= 0n) continue;

			const maxUsdcForQuote = BigInt(
				Math.ceil((Number(maxAssetAvailable) / 10 ** assetDecimals) * price * 10 ** paymentDecimals)
			);
			const usdcToUse = remainingUsdc < maxUsdcForQuote ? remainingUsdc : maxUsdcForQuote;
			const tokensFromQuote = BigInt(
				Math.floor((Number(usdcToUse) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
			);
			if (tokensFromQuote <= 0n) continue;

			totalTokensOut += tokensFromQuote;
			remainingUsdc -= usdcToUse;
			weightedPriceSum += price * Number(tokensFromQuote);
		}

		if (totalTokensOut <= 0n) return null;

		return {
			calculatedAmount: Number(totalTokensOut) / 10 ** assetDecimals,
			avgPrice: weightedPriceSum / Number(totalTokensOut),
			hasLiquidity: remainingUsdc <= 0n
		};
	}

	// Walk orderbook: tokens input -> USDC output (for buying or selling)
	function walkTokensToUsdc(
		tokenAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number,
		direction: 'buy' | 'sell'
	) {
		let remainingTokens = parseUnits(tokenAmount.toString(), assetDecimals);
		let totalUsdc = 0n;
		let weightedPriceSum = 0;
		let tokensFilled = 0n;

		for (const q of quotes) {
			if (remainingTokens <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals =
					q.outputTokenDecimals ?? (direction === 'buy' ? assetDecimals : paymentDecimals);
				maxAvailable = parseFloatHex(q.maxOutput, outputDecimals);
			}
			if (maxAvailable <= 0n) continue;

			let tokensFromQuote: bigint;
			let usdcFromQuote: bigint;

			if (direction === 'buy') {
				// maxOutput is tokens available
				const maxTokens = maxAvailable;
				tokensFromQuote = remainingTokens < maxTokens ? remainingTokens : maxTokens;
				usdcFromQuote = BigInt(
					Math.ceil((Number(tokensFromQuote) / 10 ** assetDecimals) * price * 10 ** paymentDecimals)
				);
			} else {
				// maxOutput is USDC available from this bid
				const maxUsdcFromBid = maxAvailable;
				const maxTokensForBid = BigInt(
					Math.floor((Number(maxUsdcFromBid) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
				);
				tokensFromQuote = remainingTokens < maxTokensForBid ? remainingTokens : maxTokensForBid;
				usdcFromQuote = BigInt(
					Math.floor(
						(Number(tokensFromQuote) / 10 ** assetDecimals) * price * 10 ** paymentDecimals
					)
				);
			}

			if (tokensFromQuote <= 0n) continue;

			tokensFilled += tokensFromQuote;
			totalUsdc += usdcFromQuote;
			remainingTokens -= tokensFromQuote;
			weightedPriceSum += price * Number(tokensFromQuote);
		}

		if (tokensFilled <= 0n) return null;

		return {
			calculatedAmount: Number(totalUsdc) / 10 ** paymentDecimals,
			avgPrice: weightedPriceSum / Number(tokensFilled),
			hasLiquidity: remainingTokens <= 0n
		};
	}

	// Walk orderbook: USDC desired -> tokens needed (for selling)
	function walkUsdcToTokensSell(
		usdcAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number
	) {
		let remainingUsdc = parseUnits(usdcAmount.toString(), paymentDecimals);
		let totalTokensNeeded = 0n;
		let weightedPriceSum = 0;

		for (const q of quotes) {
			if (remainingUsdc <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxUsdcFromBid = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? paymentDecimals;
				maxUsdcFromBid = parseFloatHex(q.maxOutput, outputDecimals);
			}
			if (maxUsdcFromBid <= 0n) continue;

			const usdcToGet = remainingUsdc < maxUsdcFromBid ? remainingUsdc : maxUsdcFromBid;
			const tokensNeeded = BigInt(
				Math.ceil((Number(usdcToGet) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
			);
			if (tokensNeeded <= 0n) continue;

			totalTokensNeeded += tokensNeeded;
			remainingUsdc -= usdcToGet;
			weightedPriceSum += price * Number(tokensNeeded);
		}

		if (totalTokensNeeded <= 0n) return null;

		return {
			calculatedAmount: Number(totalTokensNeeded) / 10 ** assetDecimals,
			avgPrice: weightedPriceSum / Number(totalTokensNeeded),
			hasLiquidity: remainingUsdc <= 0n
		};
	}

	// Best prices for display
	$: bestAskPrice = askQuotes.length > 0 ? askQuotes[0].quotePerAsset : null;
	$: bestBidPrice = bidQuotes.length > 0 ? bidQuotes[0].quotePerAsset : null;
	$: relevantQuotes = isBuying ? askQuotes : bidQuotes;

	function handleTopInput(e: Event) {
		const target = e.target as HTMLInputElement;
		topAmount = target.value;
		lastEditedField = 'top';
		// Auto-fill bottom
		if (quote) {
			bottomAmount = formatTokenAmount(quote.calculatedAmount);
		}
	}

	function handleBottomInput(e: Event) {
		const target = e.target as HTMLInputElement;
		bottomAmount = target.value;
		lastEditedField = 'bottom';
		// Auto-fill top
		if (quote) {
			topAmount = formatTokenAmount(quote.calculatedAmount);
		}
	}

	function handleSwapDirection() {
		isBuying = !isBuying;
		// Keep amounts and positions, just recalculate with new direction
		// Reset to recalculate based on current input
		if (lastEditedField) {
			// Trigger recalculation by keeping the edited field
			// The quote will update reactively
		}
	}

	function handleTokenSelect(address: string) {
		selectedTokenAddress = address;
		isDropdownOpen = false;
	}

	function handleMaxClick() {
		if (isBuying) {
			topAmount = formattedUsdcBalance.toFixed(2);
			lastEditedField = 'top';
		} else {
			// For selling, would need token balance - skip for now
		}
	}

	function handleTrade() {
		if (!$connected) {
			promptWalletConnection();
			return;
		}
		if (!$walletRegistered) {
			promptLogin();
			return;
		}
		const sft = $sfts?.find((s) => s.address.toLowerCase() === selectedTokenAddress?.toLowerCase());
		if (sft) {
			goto(`/trade/${sft.id}`);
		}
	}

	function handleConnectWallet() {
		$web3Modal.open();
	}

	function formatTokenAmount(amount: number): string {
		if (amount >= 1000) return amount.toFixed(2);
		if (amount >= 1) return amount.toFixed(4);
		return amount.toFixed(6);
	}

	function formatPrice(price: number): string {
		if (price >= 1000) return '$' + price.toFixed(0);
		if (price >= 100) return '$' + price.toFixed(1);
		if (price >= 1) return '$' + price.toFixed(2);
		return '$' + price.toFixed(4);
	}
</script>

<div
	class="relative w-full max-w-md rounded-2xl border border-white/10 bg-gray-900/80 p-6 shadow-2xl backdrop-blur-xl"
>
	<!-- Subtle glow effect -->
	<div
		class="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-blue-500/20 via-transparent to-transparent opacity-50"
	></div>

	<div class="relative space-y-4">
		<!-- USDC section (always on top) -->
		<div class="space-y-2">
			<div class="flex items-center justify-between text-sm">
				{#if $connected}
					<span class="text-gray-500">
						Balance: {formattedUsdcBalance.toFixed(2)}
						{paymentToken?.symbol ?? 'USDC'}
					</span>
				{:else}
					<span></span>
				{/if}
				{#if quote && !quote.hasLiquidity}
					<span class="text-xs text-yellow-500">Partial fill</span>
				{/if}
			</div>
			<div
				class="flex items-center gap-3 rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3"
			>
				<!-- USDC token display -->
				<div class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5">
					{#if paymentToken?.logoUrl}
						<img
							src={paymentToken.logoUrl}
							alt={paymentToken.symbol}
							class="h-6 w-6 rounded-full"
						/>
					{/if}
					<span class="font-medium text-white">{paymentToken?.symbol ?? 'USDC'}</span>
				</div>

				<!-- USDC amount input -->
				<div class="flex-1 text-right">
					<input
						type="text"
						inputmode="decimal"
						placeholder="0"
						value={topAmount}
						on:input={handleTopInput}
						class="w-full bg-transparent text-right text-2xl font-medium text-white placeholder-gray-600 focus:outline-none"
					/>
					{#if $connected && formattedUsdcBalance > 0 && isBuying}
						<button
							type="button"
							on:click={handleMaxClick}
							class="text-xs text-blue-400 hover:text-blue-300"
						>
							Max
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Direction arrow (clickable) -->
		<div class="flex justify-center">
			<button
				type="button"
				on:click={handleSwapDirection}
				class="rounded-full border border-white/10 bg-gray-800 p-2 transition hover:border-white/20 hover:bg-gray-700"
			>
				<svg
					class="h-4 w-4 text-gray-400 transition-transform duration-200"
					class:rotate-180={!isBuying}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 14l-7 7m0 0l-7-7m7 7V3"
					/>
				</svg>
			</button>
		</div>

		<!-- Token section (always on bottom) -->
		<div class="space-y-2">
			<div
				class="flex items-center gap-3 rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3"
			>
				<!-- Token selector -->
				<div class="relative">
					<button
						type="button"
						on:click={() => (isDropdownOpen = !isDropdownOpen)}
						class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5 transition hover:bg-gray-700"
					>
						{#if selectedToken}
							<img
								src={selectedToken.logoUrl}
								alt={selectedToken.symbol}
								class="h-6 w-6 rounded-full"
							/>
							<span class="font-medium text-white">{selectedToken.symbol}</span>
						{:else}
							<span class="text-gray-400">Select</span>
						{/if}
						<svg
							class="h-4 w-4 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{#if isDropdownOpen}
						<div
							class="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-gray-800 py-2 shadow-xl"
						>
							{#each tradableTokens as token}
								<button
									type="button"
									on:click={() => handleTokenSelect(token.address)}
									class="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-white/5"
								>
									<img src={token.logoUrl} alt={token.symbol} class="h-6 w-6 rounded-full" />
									<div>
										<div class="font-medium text-white">{token.symbol}</div>
										<div class="text-xs text-gray-500">{token.name}</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Token amount input -->
				<div class="flex-1 text-right">
					<input
						type="text"
						inputmode="decimal"
						placeholder="0"
						value={bottomAmount}
						on:input={handleBottomInput}
						class="w-full bg-transparent text-right text-2xl font-medium text-white placeholder-gray-600 focus:outline-none"
					/>
					{#if quote?.avgPrice}
						<div class="text-xs text-gray-500">
							~{formatPrice(quote.avgPrice)} per token
						</div>
					{:else if isBuying ? bestAskPrice : bestBidPrice}
						<div class="text-xs text-gray-500">
							Best: {formatPrice((isBuying ? bestAskPrice : bestBidPrice) ?? 0)}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Network info -->
		<div class="flex items-center justify-center gap-2 text-xs text-gray-500">
			<span>Trading on</span>
			<img src="/images/BASE.svg" alt="Base" class="h-4 w-4" />
			<span class="text-gray-400">{$currentNetwork?.displayName ?? 'Base'}</span>
		</div>

		<!-- Action button -->
		{#if $connected}
			<Button
				variant="primary"
				size="lg"
				className="w-full rounded-xl py-4 text-base font-semibold"
				disabled={!quote || (!topAmount && !bottomAmount)}
				on:click={handleTrade}
			>
				{#if !topAmount && !bottomAmount}
					Enter amount
				{:else if relevantQuotes.length === 0}
					No liquidity
				{:else if !quote}
					No liquidity
				{:else if isBuying}
					Buy {selectedToken?.symbol}
				{:else}
					Sell {selectedToken?.symbol}
				{/if}
			</Button>
		{:else}
			<Button
				variant="primary"
				size="lg"
				className="w-full rounded-xl py-4 text-base font-semibold"
				on:click={handleConnectWallet}
			>
				Connect wallet
			</Button>
		{/if}
	</div>
</div>

<!-- Click outside to close dropdown -->
{#if isDropdownOpen}
	<button
		type="button"
		class="fixed inset-0 z-40"
		on:click={() => (isDropdownOpen = false)}
		aria-label="Close dropdown"
	></button>
{/if}
