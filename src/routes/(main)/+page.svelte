<script lang="ts">
	import { onMount } from 'svelte';
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
	import { globalPoolApy, fetchGlobalPoolApy } from '$lib/stores/rewardsStore';
	import { tutorialActive, tutorialStep } from '$lib/stores/tutorialStore';
	import Footer from '$lib/components/Footer.svelte';

	function startTour() {
		tutorialActive.set(true);
		tutorialStep.set('welcome');
	}

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// APY slot machine animation
	let displayedApy = 0;
	let isAnimating = false;
	let animationComplete = false;

	onMount(() => {
		fetchGlobalPoolApy();
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
		{ alt: 'Holo', src: '/images/pioneers/holo.svg' },
		{ alt: 'Microsoft', src: '/images/pioneers/microsoft.svg' },
		{ alt: 'Nasdaq', src: '/images/pioneers/nasdaq.svg' },
		{ alt: 'NYSE', src: '/images/pioneers/nyse.svg' },
		{ alt: 'ICE', src: '/images/pioneers/ice.svg' }
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
				class="mb-6 text-3xl font-bold tracking-tight text-white sm:mb-8 sm:text-4xl lg:text-5xl xl:text-6xl"
			>
				Global Equities. On-Chain
			</h1>

			<!-- Rewards APY Banner -->
			<div class="mb-8 flex justify-center sm:mb-10">
				<div class="rewards-banner relative overflow-hidden rounded-2xl px-4 py-2.5 sm:rounded-full sm:px-6 sm:py-3">
					<span class="rewards-border"></span>
					<span class="absolute inset-[1px] z-0 rounded-2xl bg-gray-900/90 sm:rounded-full"></span>
					<div class="relative z-10 flex flex-col items-center gap-1 text-sm sm:flex-row sm:gap-3 sm:text-base">
						<div class="flex items-center gap-2">
							<span class="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
								></span>
								<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500 sm:h-2.5 sm:w-2.5"></span>
							</span>
							<span class="text-gray-300">Rewards boost active</span>
						</div>
						<span class="hidden text-gray-500 sm:inline">·</span>
						<div class="flex items-center gap-2">
							<span class="text-gray-400">Current APY</span>
							<span class="font-bold tabular-nums text-white" class:animate-pulse={isAnimating}>
								{formatApyDisplay(displayedApy)}%
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- QuickTrade widget centered below hero -->
			<div class="flex w-full flex-col items-center gap-4 px-2 sm:px-0">
				<QuickTrade />
				<button
					type="button"
					class="w-full max-w-md rounded-lg bg-yellow-500 px-6 py-3 text-sm font-medium text-black transition hover:bg-yellow-400 sm:w-auto sm:py-2.5"
					on:click={() => goto('/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95')}
				>
					Launch Trading Terminal
				</button>
				<button
					type="button"
					class="text-sm text-gray-500 underline decoration-gray-600 underline-offset-4 transition hover:text-yellow-500 hover:decoration-yellow-500"
					on:click={startTour}
				>
					New? Take the tour 👉
				</button>
			</div>

			<!-- Trust Indicators -->
			<div
				class="mt-12 grid grid-cols-3 gap-3 text-center sm:mt-20 sm:gap-10 lg:mt-24 lg:gap-16"
			>
				<!-- Decentralised -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-6 w-6 text-yellow-500 sm:h-10 sm:w-10"
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
					<p class="hidden text-sm text-gray-400 sm:block sm:text-base">24/7 instant settlement. No fees.</p>
				</div>

				<!-- Exchange-Linked Liquidity -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-6 w-6 text-yellow-500 sm:h-10 sm:w-10"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<!-- Small lightning bolt in top-left -->
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M7 2L5 6h2L5 10"
								/>
								<!-- Arrow 1: diagonal pointing bottom-left -->
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M14 10L6 18m0 0v-5m0 5h5"
								/>
								<!-- Arrow 2: diagonal pointing top-right -->
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M10 14l8-8m0 0v5m0-5h-5"
								/>
							</svg>
						</div>
					</div>
					<h3 class="mb-1 text-sm font-semibold text-white sm:mb-2 sm:text-xl lg:text-2xl">
						<span class="hidden sm:inline">Exchange-Linked </span>Liquidity
					</h3>
					<p class="hidden text-sm text-gray-400 sm:block sm:text-base">
						Tap into primary exchange liquidity on the NYSE, Nasdaq, and more.
					</p>
				</div>

				<!-- Fully Backed -->
				<div class="p-2 sm:p-5">
					<div class="mb-2 flex justify-center sm:mb-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-6 w-6 text-yellow-500 sm:h-10 sm:w-10"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
					</div>
					<h3 class="mb-1 text-sm font-semibold text-white sm:mb-2 sm:text-xl lg:text-2xl">Fully Backed</h3>
					<p class="hidden text-sm text-gray-400 sm:block sm:text-base">
						Every token fully backed and legally redeemable for shares held by a regulated custodian
					</p>
				</div>
			</div>

			<!-- Pioneer Logos -->
			<div class="mt-8 text-center sm:mt-16">
				<p class="mb-3 text-xs text-gray-500 sm:mb-4 sm:text-sm">Built by pioneers from</p>
				<div class="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
					{#each pioneerLogos as logo}
						<img
							src={logo.src}
							alt={logo.alt}
							class="h-4 w-auto opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0 sm:h-6"
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
								<th class="hidden px-3 py-3 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-5 sm:py-4"
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
										class="cursor-pointer transition-all hover:bg-yellow-500/5"
										on:click={() => goto(`/trade/${token.id}`)}
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
				<p class="mt-6 text-center text-base text-gray-500">More equities coming soon!</p>
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
</style>
