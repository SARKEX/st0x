<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { currentNetwork, sfts, vaultsQuery } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { createApiTokensQuery, findApiTokenByAnyAddress } from '$lib/queries/tokens';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import Table from '$lib/components/ui/table/Table.svelte';
	import QuickTrade from '$lib/components/QuickTrade.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tutorialActive, tutorialStep } from '$lib/stores/tutorialStore';
	import Footer from '$lib/components/Footer.svelte';
	import { track, trackPageView } from '$lib/services/analytics';
	import { initScrollTracking } from '$lib/utils/scrollTracking';
	import { toBigInt } from '$lib/utils/tokenMath';

	function startTour() {
		tutorialActive.set(true);
		tutorialStep.set('welcome');
	}

	// Typewriter animation for hero text
	const typewriterWords = ['Global', 'Collateralised', 'DeFi-Ready', 'Transferable', 'Redeemable'];
	let currentWordIndex = 0;
	let displayedText = '';
	let isDeleting = false;
	let typewriterTimeout: ReturnType<typeof setTimeout> | null = null;

	const TYPING_SPEED = 80;
	const DELETING_SPEED = 50;
	const PAUSE_AFTER_TYPING = 2000;
	const PAUSE_AFTER_DELETING = 300;

	function typewriterTick() {
		const currentWord = typewriterWords[currentWordIndex];

		if (!isDeleting) {
			// Typing
			if (displayedText.length < currentWord.length) {
				displayedText = currentWord.slice(0, displayedText.length + 1);
				typewriterTimeout = setTimeout(typewriterTick, TYPING_SPEED);
			} else {
				// Finished typing, pause then start deleting
				typewriterTimeout = setTimeout(() => {
					isDeleting = true;
					typewriterTick();
				}, PAUSE_AFTER_TYPING);
			}
		} else {
			// Deleting
			if (displayedText.length > 0) {
				displayedText = displayedText.slice(0, -1);
				typewriterTimeout = setTimeout(typewriterTick, DELETING_SPEED);
			} else {
				// Finished deleting, move to next word
				isDeleting = false;
				currentWordIndex = (currentWordIndex + 1) % typewriterWords.length;
				typewriterTimeout = setTimeout(typewriterTick, PAUSE_AFTER_DELETING);
			}
		}
	}

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];

	// Displayed price is the bid/ask midpoint — same source the sidebar uses, keyed by address.
	let midpointPricesQuery = createMidpointPricesQuery($currentNetwork);
	$: midpointPricesQuery = createMidpointPricesQuery($currentNetwork);

	function formatBaseUnitAmount(value: string | null | undefined): string {
		const amount = toBigInt(value);
		return amount === null ? '0' : formatUnits(amount, 18);
	}

	let cleanupScrollTracking: (() => void) | null = null;

	onMount(() => {
		// Start typewriter animation
		typewriterTick();

		// Track page view
		trackPageView('landing_page');

		// Initialize scroll tracking
		cleanupScrollTracking = initScrollTracking('landing_page');
	});

	onDestroy(() => {
		if (typewriterTimeout) {
			clearTimeout(typewriterTimeout);
		}
		if (cleanupScrollTracking) {
			cleanupScrollTracking();
		}
	});

	type TokenRow = {
		id: string;
		address: string;
		name: string;
		symbol: string;
		price: number | null;
		totalHolders: string;
		totalSupply: string;
		totalTransfers: string;
		createdAt: string;
		isSft: boolean;
	};

	let processedTokens: TokenRow[] = [];
	let isVaultLoading = false;
	let vaultsError: string | null = null;
	let hasVaults = false;

	$: hasVaults = ($sfts?.length ?? 0) > 0;
	$: isVaultLoading = !hasVaults && ($vaultsQuery?.isPending || $vaultsQuery?.isFetching || false);
	$: vaultsError =
		!hasVaults && $vaultsQuery?.error instanceof Error
			? $vaultsQuery.error.message
			: !hasVaults && $vaultsQuery?.error
				? String($vaultsQuery.error)
				: null;

	const pioneerLogos = [
		{ alt: 'Holo', src: '/images/pioneers/holo.svg', scale: 0.8 },
		{ alt: 'Microsoft', src: '/images/pioneers/microsoft.svg', scale: 1.05 },
		{ alt: 'Nasdaq', src: '/images/pioneers/nasdaq.svg', scale: 1.05 },
		{ alt: 'NYSE', src: '/images/pioneers/nyse.svg', scale: 1 },
		{ alt: 'ICE', src: '/images/pioneers/ice.svg', scale: 1 }
		// { alt: 'University of Oxford', src: '/images/pioneers/oxford.svg' },
		// { alt: 'University of Sussex', src: '/images/pioneers/sussex.svg' }
	];

	$: {
		if ($sfts && $sfts.length) {
			const rows: TokenRow[] = [];
			const midpointPrices = $midpointPricesQuery?.data;
			for (const sft of $sfts) {
				// Displayed price is the bid/ask midpoint (falls back to last known, else N/A).
				// getMidpointPrice resolves wrapped/unwrapped/legacy address variants so home and
				// sidebar stay consistent. Market cap below is derived from this same price.
				const price = getMidpointPrice(midpointPrices, sft.address)?.price ?? null;

				rows.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price,
					totalHolders: String(sft.holderCount ?? 0),
					totalSupply: formatBaseUnitAmount(sft.bridgedSupply ?? sft.totalShares),
					totalTransfers: String(sft.transferCount ?? 0),
					createdAt: sft.deployTimestamp,
					isSft: true
				});
			}
			processedTokens = rows;
		} else {
			processedTokens = [];
		}
	}

	// Prices load from a separate query than the token metadata, so price/TVL cells
	// would flash a literal "N/A" (reads as broken, not loading) during the initial
	// fetch. Gate on whether the midpoint query has returned any prices yet so we can
	// show a loading skeleton until then — this also covers the case where the first
	// fetch comes back empty and prices only land on a later refetch.
	$: pricesLoaded = Object.keys($midpointPricesQuery?.data ?? {}).length > 0;

	// Holder counts come straight from the backend and are currently "1" across the
	// board, which adds no signal. Only surface the column once the data is
	// meaningful: at least 50 holders for 80%+ of listed assets.
	$: showHolders =
		processedTokens.length > 0 &&
		processedTokens.filter((t) => Number(t.totalHolders) >= 50).length / processedTokens.length >=
			0.8;
</script>

<div class="relative z-10 min-h-screen">
	<!-- Hero Section -->
	<section class="px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8 lg:pb-32 lg:pt-36">
		<div class="mx-auto max-w-5xl text-center">
			<h1
				class="mb-6 text-3xl font-bold tracking-tight text-text sm:mb-8 sm:text-4xl lg:text-5xl xl:text-6xl"
			>
				Tokenised Equities.<br class="sm:hidden" />
				<span class="text-accent">{displayedText}</span><span class="animate-blink text-accent"
					>|</span
				>
			</h1>

			<!-- Rewards APY Banner - temporarily hidden -->

			<div
				class="mx-auto flex w-full max-w-md flex-col items-stretch gap-5 px-2 text-left sm:px-0 md:max-w-none"
			>
				<QuickTrade />
			</div>

			<div class="mt-4 flex justify-center">
				<button
					type="button"
					class="hidden text-sm text-text-3 underline decoration-text-muted underline-offset-4 transition hover:text-accent hover:decoration-accent sm:inline-block"
					on:click={startTour}
				>
					New? Take the tour 👉
				</button>
			</div>

			<!-- Why st0x — trust pillars -->
			<div class="mt-16 sm:mt-24 lg:mt-28">
				<p class="text-accent/70 text-xs font-semibold uppercase tracking-[0.2em]">Why st0x</p>
				<h2 class="mt-3 text-2xl font-bold tracking-tight text-text sm:text-[32px]">
					Tokenised equities &amp; yield, done properly.
				</h2>
				<div class="mt-10 grid gap-8 sm:grid-cols-3">
					<!-- Decentralised -->
					<div class="icon-trigger flex flex-col items-center text-center">
						<div class="pillar-float">
							<div
								class="pillar-tile flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/[0.08] text-accent"
							>
								<Icon name="blocks" className="h-7 w-7" />
							</div>
						</div>
						<h3 class="mt-4 text-base font-semibold text-text">Decentralised</h3>
						<p class="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-text-2">
							Withdraw to your wallet. Compatible with DeFi protocols.
						</p>
					</div>

					<!-- Liquid -->
					<div class="icon-trigger flex flex-col items-center text-center">
						<div class="pillar-float" style="animation-delay: -2.3s">
							<div
								class="pillar-tile flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/[0.08] text-accent"
							>
								<Icon name="swap" className="h-7 w-7" />
							</div>
						</div>
						<h3 class="mt-4 text-base font-semibold text-text">Liquid</h3>
						<p class="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-text-2">
							Supply bridged real-time from stock markets. 24/7 trading.
						</p>
					</div>

					<!-- 1:1 Collateralised -->
					<div class="icon-trigger flex flex-col items-center text-center">
						<div class="pillar-float" style="animation-delay: -4.6s">
							<div
								class="pillar-tile flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/[0.08] text-accent"
							>
								<Icon name="shield" className="h-7 w-7" />
							</div>
						</div>
						<h3 class="mt-4 text-base font-semibold text-text">1:1 Collateralised</h3>
						<p class="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-text-2">
							Every token fully collateralised with a legal right of exchange.
						</p>
					</div>
				</div>
			</div>

			<!-- Pioneer Logos -->
			<div class="relative z-0 mt-8 text-center sm:mt-16">
				<p class="mb-5 text-[13px] font-medium text-text-2">Built by pioneers from</p>
				<div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
					{#each pioneerLogos as logo}
						<img
							src={logo.src}
							alt={logo.alt}
							class="pioneer-logo h-4 w-auto opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0 sm:h-6"
							style="transform: scale({logo.scale})"
							loading="lazy"
						/>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- Asset Table Section -->
	<section id="asset-table" class="px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8 lg:pb-16">
		<div class="mx-auto max-w-5xl">
			{#if isVaultLoading}
				<div class="flex w-full items-center justify-center py-16">
					<LoadingSpinner variant="inline" size="lg" text="Loading assets..." />
				</div>
			{:else if vaultsError}
				<div class="flex w-full items-center justify-center py-16 text-sm text-down">
					Failed to load assets: {vaultsError}
				</div>
			{:else if hasVaults}
				<div
					class="overflow-hidden rounded-xl border border-line bg-overlay-1"
					data-tutorial="token-list"
				>
					<Table>
						<thead>
							<tr>
								<th
									class="sticky left-0 z-10 px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-3 sm:px-5"
									>Token</th
								>
								<th
									class="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-3 sm:px-5"
									>Price</th
								>
								<th
									class="hidden px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-3 sm:table-cell sm:px-5"
									>TVL</th
								>
								<th
									class="hidden px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-3 sm:table-cell sm:px-5"
									>Bridged On-Chain</th
								>
								{#if showHolders}
									<th
										class="hidden px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-3 sm:table-cell sm:px-5"
										>Holders</th
									>
								{/if}
								<th class="w-10"></th>
							</tr>
						</thead>
						<tbody>
							{#if !processedTokens.length}
								<tr>
									<td
										colspan={showHolders ? 6 : 5}
										class="px-5 py-8 text-center text-sm text-text-3"
									>
										No assets available.
									</td>
								</tr>
							{:else}
								{#each processedTokens as token (token.id)}
									{@const bridgedSupply = Number(token.totalSupply)}
									{@const displayPrice =
										typeof token.price === 'number' ? token.price : Number(token.price ?? NaN)}
									{@const marketCap =
										displayPrice != null && Number.isFinite(displayPrice)
											? bridgedSupply * displayPrice
											: null}
									<tr
										class="icon-trigger cursor-pointer transition-all hover:bg-surface-2"
										on:click={() => {
											track('token_clicked', {
												token_symbol: token.symbol,
												token_id: token.id,
												source: 'landing_page_table'
											});
											goto(`/trade/${token.id}`);
										}}
									>
										<td class="sticky left-0 z-10 px-3 py-3 sm:px-5 sm:py-4">
											<div class="flex items-center gap-2">
												<TokenDisplay
													logoUrl={findApiTokenByAnyAddress(apiTokens, token.address)?.logoUrl}
													symbol={token.symbol}
													showName={false}
												/>
											</div>
										</td>
										<td class="px-3 py-3 sm:px-5 sm:py-4">
											{#if Number.isFinite(displayPrice)}
												<div class="font-mono font-medium text-text">
													{`$${displayPrice.toFixed(2)}`}
												</div>
											{:else if !pricesLoaded}
												<div class="h-4 w-14 animate-pulse rounded bg-line-strong"></div>
											{:else}
												<div class="font-mono font-medium text-text">N/A</div>
											{/if}
										</td>
										<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
											{#if marketCap != null}
												<div class="font-mono text-sm text-text-2">
													{marketCap >= 1_000_000
														? `$${(marketCap / 1_000_000).toFixed(2)}M`
														: marketCap >= 1_000
															? `$${(marketCap / 1_000).toFixed(1)}K`
															: `$${marketCap.toFixed(2)}`}
												</div>
											{:else if !pricesLoaded}
												<div class="h-4 w-16 animate-pulse rounded bg-line-strong"></div>
											{:else}
												<div class="font-mono text-sm text-text-2">N/A</div>
											{/if}
										</td>
										<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
											<div class="font-mono text-sm text-text-2">
												{bridgedSupply >= 1000
													? `${(bridgedSupply / 1000).toFixed(2)}K`
													: bridgedSupply.toFixed(2)}
											</div>
										</td>
										{#if showHolders}
											<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
												<div class="font-mono text-sm text-text-2">{token.totalHolders}</div>
											</td>
										{/if}
										<td class="px-3 py-3 sm:px-5 sm:py-4">
											<Icon name="arrowRight" className="icon-slide h-4 w-4 text-text-muted" />
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</Table>
				</div>

				<!-- More Coming Soon -->
				<p class="mt-5 text-center text-sm text-text-3">More equities coming soon</p>
			{:else}
				<div class="flex w-full items-center justify-center py-16">
					<EmptyState
						title="No Assets Found"
						description="No assets available on {$currentNetwork?.displayName || 'this network'}."
					/>
				</div>
			{/if}
		</div>
	</section>

	<Footer />
</div>

<style>
	/* Blinking cursor animation for typewriter */
	.animate-blink {
		animation: blink 1s step-end infinite;
	}

	/* Pioneer logos are light/white assets (drawn for the dark shell). In light mode
	   darken them to a legible silhouette instead of near-invisible light-grey. */
	:global([data-theme='light']) .pioneer-logo {
		filter: brightness(0);
		opacity: 0.55;
	}
	:global([data-theme='light']) .pioneer-logo:hover {
		filter: brightness(0);
		opacity: 0.85;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}
</style>
