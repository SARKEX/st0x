<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { currentNetwork, sfts, vaultsQuery, oracleQuotes } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import Table from '$lib/components/ui/table/Table.svelte';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import QuickTrade from '$lib/components/QuickTrade.svelte';
	import { globalPoolApy, fetchGlobalRewards } from '$lib/stores/rewardsStore';
	import { tutorialActive, tutorialStep } from '$lib/stores/tutorialStore';
	import Footer from '$lib/components/Footer.svelte';
	import { track, trackPageView } from '$lib/services/analytics';
	import { initScrollTracking } from '$lib/utils/scrollTracking';

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

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// APY slot machine animation
	let displayedApy = 0;
	let isAnimating = false;
	let animationComplete = false;

	let cleanupScrollTracking: (() => void) | null = null;

	onMount(() => {
		fetchGlobalRewards();
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

	// Animate APY when it becomes available
	$: if ($globalPoolApy !== null && !isAnimating && !animationComplete) {
		animateApy($globalPoolApy);
	}

	function animateApy(targetApy: number) {
		isAnimating = true;
		const duration = 1500; // 1.5 seconds
		const frameRate = 30; // updates per second
		const totalFrames = (duration / 1000) * frameRate;
		let frame = 0;
		const targetRounded = Math.round(targetApy);

		// Start from 0
		displayedApy = 0;

		const interval = setInterval(() => {
			frame++;
			const progress = frame / totalFrames;

			if (progress >= 1) {
				displayedApy = targetRounded;
				isAnimating = false;
				animationComplete = true;
				clearInterval(interval);
			} else {
				// Ease out - fast at start, slow at end
				const easeOut = 1 - Math.pow(1 - progress, 3);
				displayedApy = Math.round(easeOut * targetRounded);
			}
		}, 1000 / frameRate);
	}

	function formatApyDisplay(apy: number): string {
		const rounded = Math.round(apy);
		if (rounded >= 1000) {
			return (rounded / 1000).toFixed(1) + 'K';
		}
		return rounded.toString();
	}

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
	let sftLookup = new Map<string, OffchainAssetReceiptVault>();
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
	$: sftLookup = new Map<string, OffchainAssetReceiptVault>(
		($sfts ?? []).map((vault: OffchainAssetReceiptVault) => [vault.id, vault])
	);

	function sumAmounts(entries?: Array<{ amount: string }>): bigint {
		return (entries ?? []).reduce((sum: bigint, entry) => sum + BigInt(entry.amount), 0n);
	}

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
			for (const sft of $sfts) {
				const lookupAddress = sft.address.toLowerCase();
				// Get oracle price for this token
				const oracleData = $oracleQuotes[lookupAddress];
				const price = oracleData?.price ?? null;

				rows.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price,
					totalHolders: sft.tokenHolders
						.filter((holder: { balance: string }) => BigInt(holder.balance) > BigInt(0))
						.length.toString(),
					totalSupply: formatUnits(BigInt(sft.totalShares), 18),
					totalTransfers: sft.shareTransfers.length.toString(),
					createdAt: sft.deployTimestamp,
					isSft: true
				});
			}
			processedTokens = rows;
		} else {
			processedTokens = [];
		}
	}
</script>

<div class="relative z-10 min-h-screen">
	<!-- Hero Section -->
	<section class="px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8 lg:pb-32 lg:pt-36">
		<div class="mx-auto max-w-5xl text-center">
			<h1
				class="mb-8 font-serif text-4xl font-normal leading-[1.05] tracking-tight text-white sm:mb-10 sm:text-5xl lg:text-6xl xl:text-7xl"
			>
				Tokenised Equities.<br class="sm:hidden" />
				<span class="bg-gradient-to-r from-brand-gold-300 to-brand-gold-500 bg-clip-text text-transparent">{displayedText}</span><span
					class="animate-blink text-brand-gold-400">|</span
				>
			</h1>

			<!-- Rewards APY Banner - temporarily hidden -->

			<!-- QuickTrade widget centered below hero -->
			<div class="flex w-full flex-col items-center gap-4 px-2 sm:px-0">
				<QuickTrade />
				<button
					type="button"
					class="w-full max-w-md rounded-lg bg-brand-gold-500 px-6 py-3 text-sm font-medium text-black transition hover:bg-brand-gold-400 sm:w-auto sm:py-2.5"
					on:click={() => goto('/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95')}
				>
					Launch Trading Terminal
				</button>
				<button
					type="button"
					class="hidden text-sm text-gray-400 underline decoration-gray-500 underline-offset-4 transition hover:text-brand-gold-500 hover:decoration-brand-gold-500 sm:inline-block"
					on:click={startTour}
				>
					New? Take the tour 👉
				</button>
			</div>

			<!-- Trust Indicators -->
			<div class="mt-12 grid grid-cols-3 gap-3 text-center sm:mt-20 sm:gap-10 lg:mt-24 lg:gap-16">
				<!-- Decentralised -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-6 w-6 text-brand-gold-500 sm:h-10 sm:w-10"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
								/>
							</svg>
						</div>
					</div>
					<h3 class="mb-1 text-sm font-semibold text-white sm:mb-2 sm:text-xl lg:text-2xl">
						Decentralised
					</h3>
					<p class="hidden text-sm text-gray-300 sm:block sm:text-base">
						Withdraw to your wallet. Compatible with DeFi protocols
					</p>
				</div>

				<!-- Exchange-Linked Liquidity -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-8 w-8 text-brand-gold-500 sm:h-12 sm:w-12"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 36 24"
							>
								<!-- Swap arrows in center -->
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M21 5l3 3-3 3"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M24 8H16a4 4 0 00-4 4"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M15 19l-3-3 3-3"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M12 16h8a4 4 0 004-4"
								/>
								<!-- Institution building (top-left) -->
								<g transform="translate(1, 1)" stroke-width="1.2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M0 4l4.5-3 4.5 3" />
									<path d="M1 4v4" />
									<path d="M4.5 4v4" />
									<path d="M8 4v4" />
									<path stroke-linecap="round" d="M0 8h9" />
								</g>
								<!-- Ethereum diamond (bottom-right) -->
								<g transform="translate(28, 14)" stroke-width="1.2">
									<path d="M3.5 0L7 5L3.5 6.5L0 5L3.5 0Z" />
									<path d="M0 5L3.5 4L7 5" />
									<path d="M3.5 6.5L7 5L3.5 9.5L0 5L3.5 6.5Z" />
								</g>
							</svg>
						</div>
					</div>
					<h3 class="mb-1 text-sm font-semibold text-white sm:mb-2 sm:text-xl lg:text-2xl">
						Liquid
					</h3>
					<p class="hidden text-sm text-gray-300 sm:block sm:text-base">
						Supply bridged real-time from stock markets. 24/7 trading.
					</p>
				</div>

				<!-- Fully Backed -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-6 w-6 text-brand-gold-500 sm:h-10 sm:w-10"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<!-- Layered security circles with $ -->
								<circle cx="12" cy="12" r="10" stroke-width="1.5" />
								<circle cx="12" cy="12" r="7" stroke-dasharray="3 2" stroke-width="1.5" />
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M12 9c-1.1 0-2 .6-2 1.3s.9 1.3 2 1.3 2 .6 2 1.3-.9 1.3-2 1.3m0-5.2c.7 0 1.4.3 1.7.6M12 9v-.5m0 .5v5.2m0 0v.5m0-.5c-.7 0-1.4-.3-1.7-.6"
								/>
							</svg>
						</div>
					</div>
					<h3 class="mb-1 text-sm font-semibold text-white sm:mb-2 sm:text-xl lg:text-2xl">
						1:1 Collateralised
					</h3>
					<p class="hidden text-sm text-gray-300 sm:block sm:text-base">
						Every token fully collateralised with a legal right of exchange.
					</p>
				</div>
			</div>

			<!-- Pioneer Logos -->
			<div class="relative z-0 mt-8 text-center sm:mt-16">
				<p class="mb-3 text-xs text-gray-400 sm:mb-4 sm:text-sm">Built by pioneers from</p>
				<div class="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
					{#each pioneerLogos as logo}
						<img
							src={logo.src}
							alt={logo.alt}
							class="h-4 w-auto opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0 sm:h-6"
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
					<LoadingSpinner variant="fullscreen" size="lg" text="Loading assets..." />
				</div>
			{:else if vaultsError}
				<div class="flex w-full items-center justify-center py-16 text-sm text-red-400">
					Failed to load assets: {vaultsError}
				</div>
			{:else if hasVaults}
				<div class="overflow-hidden rounded-xl" data-tutorial="token-list">
					<Table>
						<thead>
							<tr>
								<th
									class="sticky left-0 z-10 px-3 py-3 text-left text-xs font-medium text-gray-400 sm:px-5 sm:py-4"
									>Token</th
								>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-400 sm:px-5 sm:py-4"
									>Price</th
								>
								<th
									class="hidden px-3 py-3 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-5 sm:py-4"
									>TVL</th
								>
								<th
									class="hidden px-3 py-3 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-5 sm:py-4"
									>Bridged On-Chain</th
								>
								<th
									class="hidden px-3 py-3 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-5 sm:py-4"
									>Holders</th
								>
								<th class="w-10"></th>
							</tr>
						</thead>
						<tbody>
							{#if !processedTokens.length}
								<tr>
									<td colspan="6" class="px-5 py-8 text-center text-sm text-gray-400">
										No assets available.
									</td>
								</tr>
							{:else}
								{#each processedTokens as token (token.id)}
									{@const sft = sftLookup.get(token.id)}
									{@const deposits = sumAmounts(sft?.deposits)}
									{@const withdraws = sumAmounts(sft?.withdraws)}
									{@const circulating = deposits - withdraws}
									{@const circulatingSupply = parseFloat(formatUnits(circulating, 18))}
									{@const displayPrice =
										typeof token.price === 'number' ? token.price : Number(token.price ?? NaN)}
									{@const marketCap =
										displayPrice != null && Number.isFinite(displayPrice)
											? circulatingSupply * displayPrice
											: null}
									<tr
										class="cursor-pointer transition-all hover:bg-brand-gold-500/5"
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
											<TokenDisplay
												logoUrl={ALL_TOKENS.find(
													(s) => s.address.toLowerCase() === token.address.toLowerCase()
												)?.logoUrl}
												symbol={token.symbol}
												name={token.name}
											/>
										</td>
										<td class="px-3 py-3 sm:px-5 sm:py-4">
											<div class="font-medium text-white">
												{Number.isFinite(displayPrice) ? `$${displayPrice.toFixed(2)}` : 'N/A'}
											</div>
										</td>
										<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
											<div class="text-sm text-gray-300">
												{#if marketCap != null}
													{marketCap >= 1_000_000
														? `$${(marketCap / 1_000_000).toFixed(2)}M`
														: marketCap >= 1_000
															? `$${(marketCap / 1_000).toFixed(1)}K`
															: `$${marketCap.toFixed(2)}`}
												{:else}
													N/A
												{/if}
											</div>
										</td>
										<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
											<div class="text-sm text-gray-300">
												{circulatingSupply >= 1000
													? `${(circulatingSupply / 1000).toFixed(2)}K`
													: circulatingSupply.toFixed(2)}
											</div>
										</td>
										<td class="hidden px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
											<div class="text-sm text-gray-300">{token.totalHolders}</div>
										</td>
										<td class="px-3 py-3 sm:px-5 sm:py-4">
											<svg
												class="h-4 w-4 text-gray-500"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</Table>
				</div>

				<!-- More Coming Soon -->
				<p class="mt-6 text-center text-base text-gray-400">More equities coming soon!</p>
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
	/* Rainbow wave animation for the rewards banner */
	.rewards-banner {
		position: relative;
		background: transparent;
	}

	.rewards-border {
		position: absolute;
		inset: 0;
		border-radius: 1rem;
		padding: 1px;
		background: linear-gradient(
			90deg,
			#ff6b6b,
			#feca57,
			#48dbfb,
			#ff9ff3,
			#54a0ff,
			#5f27cd,
			#ff6b6b
		);
		background-size: 300% 100%;
		animation: rainbow-wave 3s linear infinite;
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	@media (min-width: 640px) {
		.rewards-border {
			border-radius: 9999px;
		}
	}

	/* Subtle glow effect */
	.rewards-banner::before {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: 1rem;
		background: linear-gradient(
			90deg,
			#ff6b6b40,
			#feca5740,
			#48dbfb40,
			#ff9ff340,
			#54a0ff40,
			#5f27cd40,
			#ff6b6b40
		);
		background-size: 300% 100%;
		animation: rainbow-wave 3s linear infinite;
		filter: blur(8px);
		opacity: 0.5;
		z-index: -1;
	}

	@media (min-width: 640px) {
		.rewards-banner::before {
			border-radius: 9999px;
		}
	}

	@keyframes rainbow-wave {
		0% {
			background-position: 0% 50%;
		}
		100% {
			background-position: 300% 50%;
		}
	}

	/* Blinking cursor animation for typewriter */
	.animate-blink {
		animation: blink 1s step-end infinite;
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
