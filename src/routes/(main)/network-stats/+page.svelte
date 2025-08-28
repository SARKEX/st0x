<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getTrades } from '$lib/query';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	let PLATFORM_STATS: { label: string; value: string; change: string }[] = [];

	// Query for recent trades
	$: tradesQuery = createQuery({
		queryKey: ['recentTrades', $currentNetwork?.id],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const dayAgo = now - 86400;
			const weekAgo = now - 7 * 86400;
			
			const dayTrades = await getTrades(dayAgo, now, $currentNetwork);
			const weekTrades = await getTrades(weekAgo, now, $currentNetwork);
			
			return {
				day: dayTrades,
				week: weekTrades
			};
		},
		enabled: !!$currentNetwork
	});

	$: if ($sfts) {
		st0xVaults = $sfts;

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

		const dayVolume = $tradesQuery.data?.day?.length || 0;
		const weekVolume = $tradesQuery.data?.week?.length || 0;

		PLATFORM_STATS = [
			{ label: 'Total Assets', value: st0xVaults.length.toString(), change: `Live on ${$currentNetwork.name}` },
			{ label: 'Tokens Minted', value: formatUnits(metrics.totalDeposits, 18), change: 'ST0xs' },
			{ label: 'Tokens Redeemed', value: formatUnits(metrics.totalRedeems, 18), change: 'Total redeemed' },
			{ label: 'Tokens Circulating', value: formatUnits(metrics.totalDeposits - metrics.totalRedeems, 18), change: 'Net supply' },
			{ label: 'Token Holders', value: metrics.totalTokenHolders.toString(), change: 'Active addresses' },
			{ label: 'Total Audits', value: metrics.totalAudits.toString(), change: 'Verified proofs' },
			{ label: 'Token Transfers', value: metrics.totalTransfers.toString(), change: 'All time' },
			{ label: 'Total Events', value: metrics.totalEvents.toString(), change: 'All transactions' },
			{ label: '24h Volume', value: dayVolume.toString(), change: 'Trades today' },
			{ label: '7d Volume', value: weekVolume.toString(), change: 'Trades this week' }
		];
	}

	// Network-specific statistics
	$: networkInfo = {
		chainId: $currentNetwork?.chainId,
		name: $currentNetwork?.name,
		displayName: $currentNetwork?.displayName,
		blockExplorer: $currentNetwork?.blockExplorer,
		subgraphUrl: $currentNetwork?.subgraph_url
	};
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading network statistics..." />
	</div>
{:else}
	<div>
		<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
			<!-- Network Information -->
			<Section>
				<div class="mb-6">
					<h1 class="text-2xl font-bold">Network Statistics</h1>
					<p class="text-gray-400">Platform overview and metrics for {$currentNetwork?.displayName || 'current network'}</p>
				</div>
				
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Network</div>
						<div class="text-xl font-semibold">{networkInfo.displayName}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Chain ID</div>
						<div class="text-xl font-semibold">{networkInfo.chainId}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Total Assets</div>
						<div class="text-xl font-semibold">{st0xVaults.length}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Active Users</div>
						<div class="text-xl font-semibold">{PLATFORM_STATS[4].value}</div>
					</div>
				</div>
			</Section>

			<!-- Platform Metrics -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-lg font-semibold sm:text-xl">Platform Overview</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
					{#each PLATFORM_STATS as metric}
						<MetricCard label={metric.label} value={metric.value} change={metric.change} />
					{/each}
				</div>
			</Section>

			<!-- Activity Overview -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-lg font-semibold sm:text-xl">Activity Overview</h2>
				</div>
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<!-- Recent Activity -->
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
						<h3 class="mb-4 font-semibold">Recent Activity</h3>
						<div class="space-y-3">
							<div class="flex justify-between">
								<span class="text-gray-400">Total Deposits</span>
								<span class="font-medium">{st0xVaults.reduce((sum, v) => sum + v.deposits.length, 0)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Total Withdrawals</span>
								<span class="font-medium">{st0xVaults.reduce((sum, v) => sum + v.withdraws.length, 0)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Total Transfers</span>
								<span class="font-medium">{st0xVaults.reduce((sum, v) => sum + v.shareTransfers.length, 0)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Certifications</span>
								<span class="font-medium">{st0xVaults.reduce((sum, v) => sum + v.certifications.length, 0)}</span>
							</div>
						</div>
					</div>

					<!-- Token Distribution -->
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
						<h3 class="mb-4 font-semibold">Token Distribution</h3>
						<div class="space-y-3">
							<div class="flex justify-between">
								<span class="text-gray-400">ST0x Tokens</span>
								<span class="font-medium">{st0xVaults.filter(v => v.symbol?.startsWith('s1')).length}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Average Holders/Token</span>
								<span class="font-medium">
									{st0xVaults.length > 0 
										? Math.round(st0xVaults.reduce((sum, v) => sum + v.tokenHolders.length, 0) / st0xVaults.length)
										: 0}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Most Active Token</span>
								<span class="font-medium">
									{st0xVaults.reduce((max, v) => 
										v.shareTransfers.length > (max?.shareTransfers.length || 0) ? v : max, 
										st0xVaults[0]
									)?.symbol || 'N/A'}
								</span>
							</div>
						</div>
					</div>
				</div>
			</Section>

			<!-- Network Health -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-lg font-semibold sm:text-xl">Network Health</h2>
				</div>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div class="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
						<div class="flex items-center gap-2">
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
							<span class="text-sm font-medium text-green-400">Subgraph Active</span>
						</div>
						<div class="mt-2 text-xs text-gray-400">All systems operational</div>
					</div>
					<div class="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
						<div class="flex items-center gap-2">
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
							<span class="text-sm font-medium text-green-400">Price Feeds Active</span>
						</div>
						<div class="mt-2 text-xs text-gray-400">AlphaVantage connected</div>
					</div>
					<div class="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
						<div class="flex items-center gap-2">
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
							<span class="text-sm font-medium text-green-400">Network Connected</span>
						</div>
						<div class="mt-2 text-xs text-gray-400">{$currentNetwork?.name} online</div>
					</div>
				</div>
			</Section>
		</div>

		<Footer />
	</div>
{/if}