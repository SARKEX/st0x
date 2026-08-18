<script lang="ts">
	// Save & Earn deposit/withdraw modal. Deposit = Buy wtSGOV by spending USDC
	// (inputMode:'spend'); Withdraw = Sell wtSGOV for USDC. Executes through the
	// existing REST-backed market-order path (executeMarketOrder) — the same flow
	// QuickTrade uses. Driven by saveEarnStore;
	// mounted once globally in (main)/+layout.svelte.
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { derived } from 'svelte/store';
	import { currentNetwork } from '$lib/stores';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import { promptWalletConnection } from '$lib/stores/accessStore';
	import {
		showSaveEarnModal,
		saveEarnMode,
		saveEarnPrefillUsdc,
		closeSaveEarn,
		type SaveEarnMode
	} from '$lib/stores/saveEarnStore';
	import { setSheetOpen } from '$lib/stores/uiStore';
	import { SGOV_CHAIN_ID, SGOV_WRAPPED_ADDRESS, formatApy } from '$lib/config/earn';
	import {
		buildSaveEarnOrder,
		normalizeSaveEarnDeposit,
		projectedYearlyYield
	} from '$lib/services/saveEarn';
	import { getNetworkByChainId, getTokenByAnyAddress } from '$lib/config/network';
	import { createQuery } from '@tanstack/svelte-query';
	import { wagmiConfig } from 'svelte-wagmi';
	import { readContract } from '@wagmi/core';
	import { erc20Abi, formatUnits } from 'viem';
	import {
		apiGetSwapQuoteV2,
		type ApiSwapQuoteV2Request,
		type ApiSwapQuoteV2Response
	} from '$lib/api/st0xApi';
	import {
		buildMarketSwapQuoteRequest,
		DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
		toReferenceIoRatio
	} from '$lib/services/marketOrderExecution';
	import { createDebouncedRequest } from '$lib/stores/debouncedValue';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { track } from '$lib/services/analytics';
	import TokenDisc from './TokenDisc.svelte';
	import ApyChip from './ApyChip.svelte';
	import EarnIcon from './EarnIcon.svelte';

	function fmt(n: number, d = 2): string {
		return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
	}
	// Save & Earn is a Base-only product because both SGOV variants are deployed there.
	const configuredSaveEarnNetwork = getNetworkByChainId(SGOV_CHAIN_ID);
	if (!configuredSaveEarnNetwork) {
		throw new Error('Save & Earn network configuration is missing');
	}
	const saveEarnNetwork = configuredSaveEarnNetwork;
	const sgovToken = getTokenByAnyAddress(SGOV_WRAPPED_ADDRESS);
	const paymentToken = saveEarnNetwork.defaultPaymentToken;
	const sgovAddress = sgovToken?.address ?? SGOV_WRAPPED_ADDRESS;
	const sgovDecimals = sgovToken?.decimals ?? 18;
	$: isSaveEarnNetwork = $currentNetwork?.id === saveEarnNetwork.id;

	// ── State ───────────────────────────────────────────────────────────────
	// Two steps only: 0 = amount entry (executes directly), 1 = success.
	let step: 0 | 1 = 0;
	let mode: SaveEarnMode = 'deposit';
	let depositUsdc = 0; // USDC to spend
	let withdrawWtsgov = 0; // wtSGOV to redeem
	let isExecuting = false;
	let errorMessage: string | null = null;
	let wasOpen = false;
	let depositInitialized = false;
	let withdrawInitialized = false;
	let marketClock = Date.now();

	const midpointPricesQuery = createMidpointPricesQuery(saveEarnNetwork);
	$: referencePrice = getMidpointPrice($midpointPricesQuery?.data, sgovAddress)?.price;
	$: referenceIoRatio = toReferenceIoRatio(mode === 'deposit' ? 'Buy' : 'Sell', referencePrice);

	// ── Authoritative REST quote used for both display and execution guard ────
	$: orderParams = buildSaveEarnOrder({
		mode,
		depositUsdc,
		withdrawWtsgov,
		sgovToken: { address: sgovAddress, decimals: sgovDecimals, symbol: 'wtSGOV' },
		paymentToken: {
			address: paymentToken.address,
			decimals: paymentToken.decimals,
			symbol: paymentToken.symbol
		}
	});
	let marketQuoteRequest: ApiSwapQuoteV2Request | null = null;
	$: marketQuoteRequest =
		orderParams.amount > 0n && referenceIoRatio && isSaveEarnNetwork
			? buildMarketSwapQuoteRequest(
					{
						...orderParams,
						slippageBps: DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
						referenceIoRatio,
						network: saveEarnNetwork
					},
					$walletAddress ?? undefined
				)
			: null;
	const debouncedMarketQuoteRequest = createDebouncedRequest<ApiSwapQuoteV2Request>(300);
	$: debouncedMarketQuoteRequest.set(marketQuoteRequest);
	const marketQuoteOptions = derived(
		[showSaveEarnModal, currentNetwork, debouncedMarketQuoteRequest],
		([$showModal, $network, $request]) => ({
			queryKey: ['saveEarnSwapQuoteV2', saveEarnNetwork.id, $request.fingerprint],
			enabled:
				browser && $showModal && $network?.id === saveEarnNetwork.id && Boolean($request.request),
			staleTime: 5_000,
			queryFn: ({ signal }: { signal: AbortSignal }) => {
				if (!$request.request) throw new Error('Missing Save & Earn quote request');
				return apiGetSwapQuoteV2($request.request, signal);
			}
		})
	);
	const marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>(marketQuoteOptions);
	$: marketQuote = $debouncedMarketQuoteRequest.request ? $marketQuoteQuery.data : undefined;

	// ── Balances ──────────────────────────────────────────────────────────────
	const usdcBalanceOptions = derived(
		[walletAddress, wagmiConfig, showSaveEarnModal, currentNetwork],
		([$address, $config, $showModal, $network]) => ({
			queryKey: ['usdcBalance', saveEarnNetwork.id, paymentToken.address, $address],
			enabled: Boolean($showModal && $network?.id === saveEarnNetwork.id && $address && $config),
			queryFn: async () => {
				if (!$address || !$config) return 0n;
				return (await readContract($config, {
					abi: erc20Abi,
					address: paymentToken.address as `0x${string}`,
					functionName: 'balanceOf',
					args: [$address as `0x${string}`],
					chainId: saveEarnNetwork.chainId
				})) as bigint;
			}
		})
	);
	const usdcBalanceQuery = createQuery<bigint>(usdcBalanceOptions);
	const wtsgovBalanceOptions = derived(
		[walletAddress, wagmiConfig, showSaveEarnModal, currentNetwork],
		([$address, $config, $showModal, $network]) => ({
			queryKey: ['tokenBalance', saveEarnNetwork.id, sgovAddress, $address],
			enabled: Boolean($showModal && $network?.id === saveEarnNetwork.id && $address && $config),
			queryFn: async () => {
				if (!$address || !$config) return 0n;
				return (await readContract($config, {
					abi: erc20Abi,
					address: sgovAddress as `0x${string}`,
					functionName: 'balanceOf',
					args: [$address as `0x${string}`],
					chainId: saveEarnNetwork.chainId
				})) as bigint;
			}
		})
	);
	const wtsgovBalanceQuery = createQuery<bigint>(wtsgovBalanceOptions);
	$: usdcBalance = Number(formatUnits($usdcBalanceQuery.data ?? 0n, paymentToken.decimals));
	$: wtsgovBalance = Number(formatUnits($wtsgovBalanceQuery.data ?? 0n, sgovDecimals));

	// ── Derived figures ───────────────────────────────────────────────────────
	$: projectedYearly = projectedYearlyYield(depositUsdc);
	$: quotedReceive = marketQuote?.fullyFilled ? Number(marketQuote.estimatedOutput) : null;
	$: receiveWtsgov = mode === 'deposit' && Number.isFinite(quotedReceive) ? quotedReceive : null;
	$: receiveUsdc = mode === 'withdraw' && Number.isFinite(quotedReceive) ? quotedReceive : null;
	$: maxUsdc = usdcBalance;
	$: maxWtsgov = wtsgovBalance;
	$: marketClosed = checkMarketClosed(marketClock);
	$: quoteReady = Boolean(marketQuote?.fullyFilled && quotedReceive && quotedReceive > 0);
	$: canSubmit =
		isSaveEarnNetwork &&
		!marketClosed &&
		quoteReady &&
		(mode === 'deposit'
			? depositUsdc > 0 && depositUsdc <= maxUsdc + 1e-9
			: withdrawWtsgov > 0 && withdrawWtsgov <= maxWtsgov + 1e-9);

	// Reset + prefill when the modal opens.
	$: {
		if ($showSaveEarnModal && !wasOpen) {
			step = 0;
			errorMessage = null;
			mode = $saveEarnMode;
			depositInitialized = $saveEarnPrefillUsdc !== null;
			withdrawInitialized = false;
			depositUsdc = normalizeSaveEarnDeposit($saveEarnPrefillUsdc ?? 0);
			withdrawWtsgov = 0;
		}
		wasOpen = $showSaveEarnModal;
	}
	$: if ($showSaveEarnModal && !depositInitialized && $usdcBalanceQuery.isSuccess) {
		depositUsdc = normalizeSaveEarnDeposit(usdcBalance);
		depositInitialized = true;
	}
	$: if ($showSaveEarnModal && !withdrawInitialized && $wtsgovBalanceQuery.isSuccess) {
		withdrawWtsgov = wtsgovBalance;
		withdrawInitialized = true;
	}

	function setDepositFromInput(raw: string): void {
		const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
		depositUsdc = normalizeSaveEarnDeposit(Number.isFinite(n) ? n : 0);
		depositInitialized = true;
	}
	function setWithdrawFromInput(raw: string): void {
		const cleaned = raw.replace(/[^0-9.]/g, '');
		const n = parseFloat(cleaned);
		withdrawWtsgov = Math.max(0, Number.isFinite(n) ? n : 0);
		withdrawInitialized = true;
	}
	function useMaxDeposit(): void {
		depositUsdc = normalizeSaveEarnDeposit(maxUsdc);
		depositInitialized = true;
	}
	function useMaxWithdrawal(): void {
		withdrawWtsgov = maxWtsgov;
		withdrawInitialized = true;
	}
	function checkMarketClosed(_clock: number): boolean {
		return isOutsideMarketHours();
	}

	async function confirm(): Promise<void> {
		if (!$isAuthenticated) {
			promptWalletConnection();
			return;
		}
		if (!isSaveEarnNetwork) {
			errorMessage = 'Save & Earn is only available on Base Mainnet.';
			return;
		}
		if (isOutsideMarketHours()) {
			errorMessage = 'This market is currently closed. Try again during NYSE market hours.';
			return;
		}
		if (!marketQuote?.fullyFilled || !referenceIoRatio) {
			errorMessage = 'Wait for a complete price quote before submitting.';
			return;
		}
		if (isExecuting || !canSubmit) return;

		isExecuting = true;
		errorMessage = null;
		const params = orderParams;
		track('save_earn_confirm', { mode, usdc: depositUsdc, wtsgov: withdrawWtsgov });

		try {
			const { executeMarketOrder } = await import('$lib/services/marketOrderExecution');
			const result = await executeMarketOrder({
				...params,
				slippageBps: DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
				referenceIoRatio,
				network: saveEarnNetwork
			});

			if (!result.success) {
				errorMessage = result.tradeError?.message || result.error || 'Transaction failed';
				track('save_earn_failed', { mode, error: errorMessage });
				return;
			}
			step = 1;
			track('save_earn_completed', { mode, usdc: depositUsdc, wtsgov: withdrawWtsgov });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Transaction failed';
			track('save_earn_failed', { mode, error: errorMessage });
		} finally {
			isExecuting = false;
		}
	}

	function goToPortfolio(): void {
		closeSaveEarn();
		goto('/dashboard');
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && $showSaveEarnModal) closeSaveEarn();
	}

	onMount(() => {
		const clock = setInterval(() => (marketClock = Date.now()), 60_000);
		return () => {
			clearInterval(clock);
			debouncedMarketQuoteRequest.destroy();
		};
	});

	$: isDeposit = mode === 'deposit';
	$: title = isDeposit ? 'Start earning' : 'Withdraw savings';

	// Hide the bottom tab bar while this sheet is open (mobile).
	$: setSheetOpen('saveEarn', $showSaveEarnModal);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showSaveEarnModal}
	<div
		class="fixed inset-0 z-[2200] flex items-end justify-center p-0 sm:items-center sm:p-4"
		role="presentation"
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			aria-label="Close"
			on:click={closeSaveEarn}
		></button>
		<div
			data-sheet
			class="relative max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-emerald-400/25 bg-surface-1 shadow-2xl sm:rounded-2xl"
			style="padding-bottom: env(safe-area-inset-bottom);"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			data-testid="save-earn-modal"
			data-mode={mode}
			data-step={step}
		>
			<!-- grab handle (mobile bottom-sheet affordance) -->
			<div class="bg-text/15 mx-auto mt-2.5 h-1 w-10 rounded-full sm:hidden"></div>
			<div
				class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl"
			></div>

			<!-- header -->
			<div class="relative flex items-center justify-between border-b border-line px-5 py-4">
				<div class="flex items-center gap-2.5">
					<TokenDisc token="wtsgov" size={32} ring />
					<div>
						<div class="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-text">
							{title}
							{#if isDeposit}<ApyChip />{/if}
						</div>
						<div class="text-[11px] text-text-2">
							{isDeposit ? 'Move USDC into Savings · SGOV' : 'Redeem wtSGOV back to USDC'}
						</div>
					</div>
				</div>
				<button
					type="button"
					on:click={closeSaveEarn}
					class="rounded-lg p-1.5 text-text-2 hover:bg-overlay-hover hover:text-text"
					aria-label="Close"
				>
					<EarnIcon name="close" className="h-4 w-4" />
				</button>
			</div>

			<div class="relative p-5">
				{#if step === 0}
					<!-- amount entry -->
					<div class="rounded-xl border border-line-strong bg-overlay-strong px-4 py-3">
						<div class="flex items-center justify-between text-xs text-text-2">
							<span class="whitespace-nowrap">{isDeposit ? 'You save' : 'You withdraw'}</span>
							{#if isDeposit}
								<button
									type="button"
									on:click={useMaxDeposit}
									class="whitespace-nowrap text-accent hover:underline"
								>
									Max {fmt(maxUsdc)} USDC
								</button>
							{:else}
								<button
									type="button"
									on:click={useMaxWithdrawal}
									class="whitespace-nowrap text-accent hover:underline"
								>
									Wallet max {fmt(maxWtsgov, 3)} wtSGOV
								</button>
							{/if}
						</div>
						<div class="mt-1 flex items-center gap-2">
							{#if isDeposit}
								<span class="text-2xl font-bold text-text-3">$</span>
								<input
									type="text"
									inputmode="numeric"
									data-testid="save-earn-amount"
									value={depositUsdc.toLocaleString('en-US')}
									on:input={(e) => setDepositFromInput(e.currentTarget.value)}
									class="w-full bg-transparent text-2xl font-bold text-text outline-none"
								/>
								<div class="flex items-center gap-1.5 rounded-lg bg-overlay-2 px-2 py-1">
									<TokenDisc token="usdc" size={20} /><span class="text-sm text-text-2">USDC</span>
								</div>
							{:else}
								<input
									type="text"
									inputmode="decimal"
									value={withdrawWtsgov ? String(withdrawWtsgov) : ''}
									on:input={(e) => setWithdrawFromInput(e.currentTarget.value)}
									class="w-full bg-transparent text-2xl font-bold text-text outline-none"
									placeholder="0"
								/>
								<div class="flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-2 py-1">
									<TokenDisc token="wtsgov" size={20} /><span class="text-sm text-accent"
										>wtSGOV</span
									>
								</div>
							{/if}
						</div>
					</div>

					<div class="my-3 flex justify-center">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-overlay-strong text-accent"
						>
							<EarnIcon name="arrowRight" className="h-4 w-4 rotate-90" />
						</span>
					</div>

					<div class="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
						<div class="text-xs text-text-2">You receive</div>
						<div class="mt-1 flex items-center gap-2">
							{#if isDeposit}
								<span class="w-full text-2xl font-bold text-text" data-testid="save-earn-receive"
									>{receiveWtsgov === null ? '—' : fmt(receiveWtsgov, 3)}</span
								>
								<div class="flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-2 py-1">
									<TokenDisc token="wtsgov" size={20} /><span class="text-sm text-accent"
										>wtSGOV</span
									>
								</div>
							{:else}
								<span class="w-full text-2xl font-bold text-text"
									>{receiveUsdc === null ? '—' : `$${fmt(receiveUsdc)}`}</span
								>
								<div class="flex items-center gap-1.5 rounded-lg bg-overlay-2 px-2 py-1">
									<TokenDisc token="usdc" size={20} /><span class="text-sm text-text-2">USDC</span>
								</div>
							{/if}
						</div>
						{#if isDeposit}
							<div class="mt-2 flex items-center gap-1.5 text-[11px] text-accent">
								<EarnIcon name="sprout" className="h-3.5 w-3.5" />Auto-compounding — your balance
								grows on its own.
							</div>
						{/if}
					</div>
					{#if !isSaveEarnNetwork}
						<p class="mt-2 text-center text-[11px] text-down">
							Save &amp; Earn is only available on Base Mainnet.
						</p>
					{:else if marketClosed}
						<p class="mt-2 text-center text-[11px] text-text-2">
							SGOV swaps are available during NYSE market hours.
						</p>
					{:else if orderParams.amount > 0n && $marketQuoteQuery.isFetching}
						<p class="mt-2 text-center text-[11px] text-text-2">Fetching executable quote…</p>
					{:else if orderParams.amount > 0n && $marketQuoteQuery.isError}
						<p class="mt-2 text-center text-[11px] text-down">
							A price quote is unavailable right now. Try again shortly.
						</p>
					{:else if marketQuote && !marketQuote.fullyFilled}
						<p class="mt-2 text-center text-[11px] text-down">
							There is not enough liquidity for this amount.
						</p>
					{/if}

					{#if isDeposit}
						<div class="mt-4 flex items-center justify-between rounded-lg bg-overlay-1 px-4 py-3">
							<span class="text-sm text-text-2">Projected growth</span>
							<span class="whitespace-nowrap font-mono text-sm font-bold text-accent"
								>+${fmt(projectedYearly)} / yr</span
							>
						</div>
					{/if}

					{#if errorMessage}
						<p class="mt-3 text-center text-[12px] text-down">{errorMessage}</p>
					{/if}

					{#if !$isAuthenticated}
						<button
							type="button"
							on:click={promptWalletConnection}
							class="mt-4 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"
						>
							Connect wallet
						</button>
					{:else}
						<button
							type="button"
							data-testid="save-earn-confirm"
							on:click={confirm}
							disabled={!canSubmit || isExecuting}
							class="mt-4 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400 disabled:opacity-40"
						>
							{#if isExecuting}
								Processing…
							{:else if isDeposit}
								Start earning
							{:else}
								Withdraw
							{/if}
						</button>
					{/if}
					<p class="mt-2 text-center text-[11px] text-text-3">
						No KYC · no lockup · DEX swaps during NYSE hours
					</p>
					{#if !isDeposit}
						<p class="mx-auto mt-1.5 max-w-xs text-center text-[10px] text-text-muted">
							Only wtSGOV held in your wallet can be sold here. Withdraw vaulted wtSGOV to your
							wallet first.
						</p>
					{/if}
					{#if isDeposit}
						<p
							class="mx-auto mt-1.5 max-w-xs text-center text-[10px] leading-relaxed text-text-muted"
						>
							wtSGOV is tokenised SGOV (BlackRock's T-bill ETF), not a bank deposit — very low risk
							but not FDIC-insured.
						</p>
					{/if}
				{:else}
					<!-- success -->
					<div class="py-4 text-center">
						<div
							class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-accent"
						>
							<EarnIcon name="check" className="h-8 w-8" stroke={2.2} />
						</div>
						<h3 class="mt-4 text-lg font-bold text-text">
							{#if isDeposit}You're earning {formatApy()}%{:else}Withdrawal submitted{/if}
						</h3>
						<p class="mx-auto mt-1.5 max-w-xs text-sm text-text-2">
							{#if isDeposit}
								{fmt(depositUsdc)} USDC is now wtSGOV and compounding monthly. Track it in your portfolio.
							{:else}
								Your wtSGOV is being redeemed to USDC. Track it in your portfolio.
							{/if}
						</p>
						{#if isDeposit}
							<div
								class="mt-4 inline-flex items-center gap-2 rounded-lg bg-overlay-2 px-4 py-2 text-sm"
							>
								<span class="text-text-2">Earning</span>
								<span class="font-mono font-bold text-accent">+${fmt(projectedYearly)}/yr</span>
							</div>
						{/if}
						<button
							type="button"
							on:click={goToPortfolio}
							class="mt-5 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"
						>
							View in portfolio
						</button>
					</div>
				{/if}
			</div>

			<!-- progress dots -->
			<div class="flex justify-center gap-1.5 pb-4">
				{#each [0, 1] as i}
					<span
						class="h-1.5 rounded-full transition-all {i === step
							? 'w-5 bg-emerald-400'
							: 'w-1.5 bg-line-strong'}"
					></span>
				{/each}
			</div>
		</div>
	</div>
{/if}
