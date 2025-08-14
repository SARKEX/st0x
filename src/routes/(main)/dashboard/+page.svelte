<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import ListCard from '$lib/components/ui/ListCard.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';

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
				const depositAmount = sft.deposits.reduce(
					(sum, deposit) => sum + BigInt(deposit.amount),
					BigInt(0)
				);
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

		PLATFORM_STATS = [
			{ label: 'Total Assets', value: st0xVaults.length.toString(), change: 'Live on ' + $currentNetwork.name },
			{ label: 'Tokens Minted', value: formatUnits(metrics.totalDeposits, 18), change: 'ST0xs' },
			{ label: 'Tokens Redeemed', value: formatUnits(metrics.totalRedeems, 18), change: 'Recent transfers' },
			{ label: 'Tokens Circulating', value: formatUnits(metrics.totalDeposits - metrics.totalRedeems, 18), change: 'Total ST0xs' },
			{ label: 'Token Holders', value: metrics.totalTokenHolders.toString(), change: 'Active addresses' },
			{ label: 'Total Audits', value: metrics.totalAudits.toString(), change: 'Verified proofs' },
			{ label: 'Token Transfers', value: metrics.totalTransfers.toString(), change: 'Recent transfers' },
			{ label: 'Total Events', value: metrics.totalEvents.toString(), change: 'All transactions' }
		];
	}
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..." />
	</div>
{:else if $sfts.length > 0}
	<div>
		<div class="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:space-y-8 lg:p-6">
			<Section>
				<div class="mx-auto max-w-3xl">
					<SearchBar bind:value={searchTerm} placeholder="Search stocks by name or symbol..." />
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
			</Section>

			<Section>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Discover</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
					<ListCard title="Biggest Movers" items={biggestMovers.map((s) => ({ name: s.name, symbol: s.symbol, href: `/tokens/${s.id}` }))} />
					<ListCard title="Biggest Volume" items={biggestVolume.map((s) => ({ name: s.name, symbol: s.symbol, href: `/tokens/${s.id}` }))} />
					<ListCard title="Most Recently Added" items={recentlyAdded.map((s) => ({ name: s.name, symbol: s.symbol, href: `/tokens/${s.id}` }))} />
				</div>
			</Section>

			<Section>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Platform Overview</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
					{#each PLATFORM_STATS as metric}
						<MetricCard label={metric.label} value={metric.value} change={metric.change} />
					{/each}
				</div>
			</Section>
		</div>

		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">No SFTs available on {$currentNetwork?.displayName || 'this network'}.</p>
		</div>
	</div>
{/if}
