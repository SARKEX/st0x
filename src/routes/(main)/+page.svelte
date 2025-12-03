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
	import Button from '$lib/components/ui/Button.svelte';
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
		const duration = 2000; // 2 seconds
		const frameRate = 50; // updates per second
		const totalFrames = (duration / 1000) * frameRate;
		let frame = 0;

		// Start from a random high number for slot machine effect
		displayedApy = Math.random() * 500;

		const interval = setInterval(() => {
			frame++;
			const progress = frame / totalFrames;

			if (progress >= 1) {
				displayedApy = targetApy;
				isAnimating = false;
				animationComplete = true;
				clearInterval(interval);
			} else {
				// Easing function for slot machine effect - fast then slow
				const easeOut = 1 - Math.pow(1 - progress, 3);

				if (progress < 0.7) {
					// Spinning phase - random numbers
					displayedApy = Math.random() * 500;
				} else {
					// Settling phase - approach target
					const settleProgress = (progress - 0.7) / 0.3;
					const easeSettle = 1 - Math.pow(1 - settleProgress, 2);
					displayedApy = displayedApy + (targetApy - displayedApy) * easeSettle * 0.3;
				}
			}
		}, 1000 / frameRate);
	}

	function formatApyDisplay(apy: number): string {
		if (apy >= 1000) {
			return (apy / 1000).toFixed(1) + 'K';
		}
		if (apy >= 100) {
			return Math.round(apy).toString();
		}
		return apy.toFixed(1);
	}

	function scrollToAssets() {
		document.getElementById('asset-table')?.scrollIntoView({ behavior: 'smooth' });
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
		{ alt: 'ICE', src: '/images/pioneers/ice.svg' },
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
				<div class="rewards-banner relative overflow-hidden rounded-full px-6 py-3">
					<span class="rewards-border"></span>
					<span class="absolute inset-[1px] z-0 rounded-full bg-gray-900/90"></span>
					<div class="relative z-10 flex items-center gap-3 text-base">
						<span class="relative flex h-2.5 w-2.5">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
							<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
						</span>
						<span class="text-gray-300">Limited time monthly rewards boost:</span>
						<span class="text-gray-500">·</span>
						<span class="text-gray-400">Current APY</span>
						<span
							class="font-bold tabular-nums text-white"
							class:animate-pulse={isAnimating}
						>
							{formatApyDisplay(displayedApy)}%
						</span>
					</div>
				</div>
			</div>

			<!-- QuickTrade widget centered below hero -->
			<div class="flex flex-col items-center gap-4">
				<QuickTrade />
				<button
					type="button"
					class="text-base text-gray-400 underline decoration-gray-600 underline-offset-4 transition hover:text-yellow-500 hover:decoration-yellow-500"
					on:click={startTour}
				>
					Limit Orders? Trading Terminals? Take the tour 👉
				</button>
			</div>

			<!-- Trust Indicators -->
			<div
				class="mt-16 grid grid-cols-1 gap-8 text-center sm:mt-20 sm:grid-cols-3 sm:gap-10 lg:mt-24 lg:gap-16"
			>
				<!-- Decentralised -->
				<div class="p-3 sm:p-5">
					<div class="mb-4 flex justify-center">
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-8 w-8 text-yellow-500 sm:h-10 sm:w-10"
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
					<h3 class="mb-2 text-lg font-semibold text-white sm:text-xl lg:text-2xl">
						Decentralised
					</h3>
					<p class="text-sm text-gray-400 sm:text-base">24/7 instant settlement. No fees.</p>
				</div>

				<!-- EU Regulated -->
				<div class="p-3 sm:p-5">
					<div class="mb-4 flex justify-center">
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-8 w-8 text-yellow-500 sm:h-10 sm:w-10"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
								/>
							</svg>
						</div>
					</div>
					<h3 class="mb-2 text-lg font-semibold text-white sm:text-xl lg:text-2xl">EU Compliant</h3>
					<p class="text-sm text-gray-400 sm:text-base">Regulated in Germany to global standards</p>
				</div>

				<!-- Fully Backed -->
				<div class="p-3 sm:p-5">
					<div class="mb-4 flex justify-center">
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20"
						>
							<svg
								class="h-8 w-8 text-yellow-500 sm:h-10 sm:w-10"
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
					<h3 class="mb-2 text-lg font-semibold text-white sm:text-xl lg:text-2xl">Fully Backed</h3>
					<p class="text-sm text-gray-400 sm:text-base">
						Every token fully backed and redeemable for shares held by a regulated custodian
					</p>
				</div>
			</div>

			<!-- Pioneer Logos -->
			<div class="mt-12 text-center sm:mt-16">
				<p class="mb-4 text-sm text-gray-500">Built by pioneers from</p>
				<div class="flex items-center justify-center gap-4 sm:gap-6">
					{#each pioneerLogos as logo}
						<img
							src={logo.src}
							alt={logo.alt}
							class="h-5 w-auto opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0 sm:h-6"
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
				<div
					class="overflow-hidden rounded-xl"
					data-tutorial="token-list"
				>
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
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-400 sm:px-5 sm:py-4"
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
										<td
											class="sticky left-0 z-10 px-3 py-3 sm:px-5 sm:py-4"
										>
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
										<td class="px-3 py-3 sm:px-5 sm:py-4">
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
		border-radius: 9999px;
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

	/* Subtle glow effect */
	.rewards-banner::before {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: 9999px;
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

	@keyframes rainbow-wave {
		0% {
			background-position: 0% 50%;
		}
		100% {
			background-position: 300% 50%;
		}
	}
</style>
