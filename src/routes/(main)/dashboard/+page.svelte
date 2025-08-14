<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	let PLATFORM_STATS: { label: string; value: string; change: string }[] = [];

	let searchTerm = '';
	let filteredSfts: OffchainAssetReceiptVault[] = [];
	let biggestMovers: OffchainAssetReceiptVault[] = [];
	let biggestVolume: OffchainAssetReceiptVault[] = [];
	let recentlyAdded: OffchainAssetReceiptVault[] = [];

	function getRandomItems<T>(arr: T[], count: number): T[] {
		const copy = [...arr];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy.slice(0, count);
	}

	$: filteredSfts =
		searchTerm.trim().length === 0
			? []
			: $sfts.filter(
					(s) =>
						s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
						s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
				);

	$: if ($sfts) {
		st0xVaults = $sfts;

		// Random selections for cards (placeholder until real metrics implemented)
		biggestMovers = getRandomItems(st0xVaults, 5);
		biggestVolume = getRandomItems(st0xVaults, 5);
		recentlyAdded = getRandomItems(st0xVaults, 5);

		// Calculate all metrics in a single pass
		const metrics = st0xVaults.reduce(
			(acc, sft) => {
				// Process deposits
				const depositAmount = sft.deposits.reduce(
					(sum, deposit) => sum + BigInt(deposit.amount),
					BigInt(0)
				);

				// Process withdraws
				const withdrawAmount = sft.withdraws.reduce(
					(sum, withdraw) => sum + BigInt(withdraw.amount),
					BigInt(0)
				);

				return {
					totalDeposits: acc.totalDeposits + depositAmount,
					totalRedeems: acc.totalRedeems + withdrawAmount,
					totalTokenHolders: acc.totalTokenHolders + sft.tokenHolders.length,
					totalAudits: acc.totalAudits + sft.certifications.length,
					totalTransfers: acc.totalTransfers + sft.shareTransfers.length,
					totalEvents:
						acc.totalEvents +
						sft.deposits.length +
						sft.withdraws.length +
						sft.shareTransfers.length +
						sft.certifications.length
				};
			},
			{
				totalDeposits: BigInt(0),
				totalRedeems: BigInt(0),
				totalTokenHolders: 0,
				totalAudits: 0,
				totalTransfers: 0,
				totalEvents: 0
			}
		);

		// Update platform stats
		PLATFORM_STATS = [
			{
				label: 'Total Assets',
				value: st0xVaults.length.toString(),
				change: 'Live on ' + $currentNetwork.name
			},
			{ label: 'Tokens Minted', value: formatUnits(metrics.totalDeposits, 18), change: 'ST0xs' },
			{
				label: 'Tokens Redeemed',
				value: formatUnits(metrics.totalRedeems, 18),
				change: 'Recent transfers'
			},
			{
				label: 'Tokens Circulating',
				value: formatUnits(metrics.totalDeposits - metrics.totalRedeems, 18),
				change: 'Total ST0xs'
			},
			{
				label: 'Token Holders',
				value: metrics.totalTokenHolders.toString(),
				change: 'Active addresses'
			},
			{ label: 'Total Audits', value: metrics.totalAudits.toString(), change: 'Verified proofs' },
			{
				label: 'Token Transfers',
				value: metrics.totalTransfers.toString(),
				change: 'Recent transfers'
			},
			{ label: 'Total Events', value: metrics.totalEvents.toString(), change: 'All transactions' }
		];
	}

	// Utility Classes
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES =
		'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10';
</script>

<!-- Main Content -->

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner
			variant="fullscreen"
			size="lg"
			text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..."
		/>
	</div>
{:else if $sfts.length > 0}
	<div>
		<!-- Dashboard Content -->
		<div class="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:space-y-8 lg:p-6">
			<!-- Central Search -->
			<div class={SECTION_CLASSES}>
				<div class="mx-auto max-w-3xl">
					<input
						type="text"
						class="w-full rounded-xl border border-white/10 bg-black/30 p-4 text-lg outline-none placeholder-gray-400 focus:border-yellow-500/50 focus:ring-0"
						placeholder="Search stocks by name or symbol..."
						bind:value={searchTerm}
					/>
					{#if filteredSfts.length > 0}
						<div class="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-gray-800/80">
							{#each filteredSfts.slice(0, 10) as sft}
								<a class="block px-4 py-3 hover:bg-white/5" href={`/tokens/${sft.id}`}>
									<div class="flex items-center justify-between">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold text-white sm:text-base">{sft.name}</div>
											<div class="text-xs text-gray-400">{sft.symbol}</div>
										</div>
										<div class="ml-3 text-xs text-yellow-500">View</div>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Discover Cards -->
			<div class={SECTION_CLASSES}>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Discover</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
					<div class="{CARD_BASE_CLASSES} p-3 sm:p-4 lg:p-5">
						<div class={GRADIENT_HOVER_CLASSES} />
						<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Biggest Movers</div>
						<ul class="space-y-2">
							{#each biggestMovers as sft}
								<li>
									<a class="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-2 hover:border-yellow-500/30" href={`/tokens/${sft.id}`}>
										<span class="truncate text-sm text-white">{sft.name}</span>
										<span class="ml-2 text-xs text-gray-400">{sft.symbol}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
					<div class="{CARD_BASE_CLASSES} p-3 sm:p-4 lg:p-5">
						<div class={GRADIENT_HOVER_CLASSES} />
						<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Biggest Volume</div>
						<ul class="space-y-2">
							{#each biggestVolume as sft}
								<li>
									<a class="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-2 hover:border-yellow-500/30" href={`/tokens/${sft.id}`}>
										<span class="truncate text-sm text-white">{sft.name}</span>
										<span class="ml-2 text-xs text-gray-400">{sft.symbol}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
					<div class="{CARD_BASE_CLASSES} p-3 sm:p-4 lg:p-5">
						<div class={GRADIENT_HOVER_CLASSES} />
						<div class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Most Recently Added</div>
						<ul class="space-y-2">
							{#each recentlyAdded as sft}
								<li>
									<a class="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-2 hover:border-yellow-500/30" href={`/tokens/${sft.id}`}>
										<span class="truncate text-sm text-white">{sft.name}</span>
										<span class="ml-2 text-xs text-gray-400">{sft.symbol}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>

			<!-- Platform Overview -->
			<div class={SECTION_CLASSES}>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Platform Overview</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
					{#each PLATFORM_STATS as metric}
						<!-- Metric Card -->
						<div class="{CARD_BASE_CLASSES} p-3 sm:p-4 lg:p-5">
							<div class={GRADIENT_HOVER_CLASSES} />
							<div class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
								{metric.label}
							</div>
							<div class="mb-2">
								<span class="block text-lg font-bold sm:text-xl lg:text-2xl">{metric.value}</span>
							</div>
							<div class="flex items-center gap-1 text-xs font-medium text-yellow-500 sm:text-sm">
								<span>↗</span>
								<span class="truncate">{metric.change}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">
				No SFTs available on {$currentNetwork?.displayName || 'this network'}.
			</p>
		</div>
	</div>
{/if}
