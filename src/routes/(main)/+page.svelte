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
	import { globalPoolApy, fetchGlobalPoolApy } from '$lib/stores/rewardsStore';

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
	<section class="px-4 pb-28 pt-28 sm:px-6 sm:pb-36 sm:pt-36 lg:px-8 lg:pb-44 lg:pt-44">
		<div class="mx-auto max-w-5xl text-center">
			<h1
				class="mb-6 text-3xl font-bold tracking-tight text-white sm:mb-8 sm:text-4xl lg:text-5xl xl:text-6xl"
			>
				Global Equities On-Chain
			</h1>
			<p class="mb-12 text-lg text-gray-300 sm:mb-16 sm:text-xl lg:mb-20 lg:text-2xl">
				Earn yield on equity investing. Current APY
				<span class="inline-block min-w-[4ch] font-bold tabular-nums text-green-400" class:animate-pulse={isAnimating}>
					{formatApyDisplay(displayedApy)}%
				</span>
			</p>

			<!-- Trust Indicators -->
			<div class="mb-12 grid grid-cols-1 gap-8 sm:mb-16 sm:grid-cols-3 sm:gap-10 lg:gap-16">
				<!-- Decentralised -->
				<div class="p-3 sm:p-5">
					<div class="mb-4 flex justify-center">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20">
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
					<h3 class="mb-2 text-lg font-semibold text-white sm:text-xl lg:text-2xl">Decentralised</h3>
					<p class="text-sm text-gray-400 sm:text-base">24/7 instant settlement. No fees.</p>
				</div>

				<!-- EU Regulated -->
				<div class="p-3 sm:p-5">
					<div class="mb-4 flex justify-center">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20">
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
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 sm:h-20 sm:w-20">
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

			<!-- CTA Button -->
			<Button
				variant="primary"
				size="lg"
				className="px-8 py-3 text-base font-semibold sm:px-10 sm:py-4 sm:text-lg"
				on:click={scrollToAssets}
			>
				Start Trading
			</Button>
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
					class="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm"
					data-tutorial="token-list"
				>
					<Table>
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="sticky left-0 z-10 bg-gray-900/80 px-3 py-3 text-left text-xs font-medium text-gray-400 backdrop-blur-sm sm:px-5 sm:py-4"
									>Asset</th
								>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-400 sm:px-5 sm:py-4"
									>Price</th
								>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-400 sm:px-5 sm:py-4"
									>Market Cap</th
								>
								<th
									class="hidden px-3 py-3 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-5 sm:py-4"
									>Circulating Supply</th
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
										class="cursor-pointer border-b border-white/5 transition-all hover:bg-yellow-500/5"
										on:click={() => goto(`/trade/${token.id}`)}
									>
										<td
											class="sticky left-0 z-10 bg-gray-900/80 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4"
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
				<p class="mt-6 text-center text-sm text-gray-500">More equities coming soon!</p>
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

	<!-- Compact Footer -->
	<footer class="border-t border-white/5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
		<div class="mx-auto max-w-5xl">
			<!-- Links Row -->
			<div
				class="mb-6 flex flex-wrap items-center justify-center gap-4 text-xs text-gray-400 sm:gap-6 sm:text-sm"
			>
				<a href="/terms" class="transition-colors hover:text-yellow-500">Terms</a>
				<a href="/privacy-policy" class="transition-colors hover:text-yellow-500">Privacy</a>
				<a href="/compliance" class="transition-colors hover:text-yellow-500">Compliance</a>
				<a href="/docs" class="transition-colors hover:text-yellow-500">Docs</a>
				<a href="/audit" class="transition-colors hover:text-yellow-500">Audits</a>
				<a href="/faqs" class="transition-colors hover:text-yellow-500">FAQs</a>
			</div>

			<!-- Social Links -->
			<div class="mb-6 flex items-center justify-center gap-4">
				<a
					href="mailto:toby@st0x.io"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="Email"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 2v.01L12 13 4 6.01V6h16zM4 18V8.236l7.386 6.178a1 1 0 001.228 0L20 8.236V18H4z"
						/></svg
					>
				</a>
				<a
					href="https://x.com/st0x_io"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="X"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
						/></svg
					>
				</a>
				<a
					href="https://t.me/+oIzo_I9xi745ODU0"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="Telegram"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
						/></svg
					>
				</a>
				<a
					href="https://www.linkedin.com/company/st0x"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="LinkedIn"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
						/></svg
					>
				</a>
			</div>

			<!-- Copyright and Risk Warning -->
			<div class="text-center">
				<p class="mb-4 text-xs text-gray-500">
					© {new Date().getFullYear()} SARK X (BVI) Ltd. All rights reserved.
				</p>
				<p class="text-[10px] leading-relaxed text-gray-600 sm:text-xs">
					<span class="text-yellow-600">Risk Warning:</span> Trading tokenized assets involves substantial
					risk. Past performance does not guarantee future results.
				</p>
			</div>
		</div>
	</footer>
</div>
