<script lang="ts">
	import VolumeChart from '$lib/components/charts/VolumeChart.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { Deposit, OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { sfts } from '$lib/stores';
	import { TARGET_NETWORK_EXPLORER_URL } from '$lib/network';
	import { getTrades } from '$lib/query';
	import StoxPages from '$lib/components/StoxPages.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Header from '$lib/components/Header.svelte';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	let PLATFORM_STATS: { label: string; value: string; change: string }[] = [];
	let recentDeposits: Deposit[] = [];

	$: tradesQuery = createQuery({
		queryKey: ['getTrades'],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const monthAgo = now - 30 * 86400;
			const trades = await getTrades(monthAgo, now);
			return trades;
		},
		retry: 3,
		retryDelay: 1000
	});

	// Use the query data instead of the store
	$: tradesData = $tradesQuery?.data || [];

	$: if ($sfts) {
		st0xVaults = $sfts;

		// Memoize deposits and transfers
		recentDeposits = st0xVaults.map((sft) => sft.deposits).flat();

		// Calculate all metrics in a single pass
		const metrics = st0xVaults.reduce(
			(acc, sft) => {
				// Process deposits
				const depositAmount = sft.deposits.reduce(
					(sum, deposit) => sum + BigInt(formatUnits(BigInt(deposit.amount), 18)),
					BigInt(0)
				);

				// Process withdraws
				const withdrawAmount = sft.withdraws.reduce(
					(sum, withdraw) => sum + BigInt(formatUnits(BigInt(withdraw.amount), 18)),
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
			{ label: 'Total Assets', value: st0xVaults.length.toString(), change: 'Live on arbitrum' },
			{ label: 'Tokens Minted', value: metrics.totalDeposits.toString(), change: 'ST0Xs' },
			{
				label: 'Tokens Redeemed',
				value: metrics.totalRedeems.toString(),
				change: 'Recent transfers'
			},
			{
				label: 'Tokens Circulating',
				value: (metrics.totalDeposits - metrics.totalRedeems).toString(),
				change: 'Total ST0Xs'
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

	const DOCUMENTATION_ITEMS = [
		{
			question: 'What is ST0x?',
			answer: 'ST0x is an onchain equities platform that tokenizes real-world assets.',
			link: '/docs/what-is-st0x',
			isOpen: false
		},
		{
			question: 'How does proof of reserves work?',
			answer: 'All tokens are backed by verifiable real-world assets with immutable proofs.',
			link: '/docs/proof-of-reserves',
			isOpen: false
		},
		{
			question: 'How to mint tokens?',
			answer: 'Use our mint interface to create new tokens backed by verified deposits.',
			link: '/docs/how-to-mint',
			isOpen: false
		},
		{
			question: 'What are the risks?',
			answer: 'Review our comprehensive risk disclosures and legal framework.',
			link: '/docs/risks',
			isOpen: false
		}
	];

	// Utility Classes
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES =
		'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10';

	function toggleDocumentation(index: number) {
		DOCUMENTATION_ITEMS[index].isOpen = !DOCUMENTATION_ITEMS[index].isOpen;
	}
</script>

<!-- Main Content -->

{#if $sfts.length > 0}
	<div>
		<!-- Header -->
		<Header title="Dashboard" description="Welcome to ST0x" />
		<div class="mx-6 mt-4 flex max-w-full justify-center">
			<div
				class="flex w-full max-w-full flex-col items-start rounded-lg border border-white/10 px-4 py-3 shadow"
			>
				<div class="mb-1 text-xl font-bold tracking-wide text-white">
					Welcome to ST0X – your on-chain gateway to equities.
				</div>
			</div>
		</div>

		<!-- Dashboard Content -->
		<div class="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:space-y-8 lg:p-6">
			<StoxPages />

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

			<div class={SECTION_CLASSES}>
				{#if $tradesQuery?.isLoading}
					<div class="max-w-full rounded-lg bg-gray-800/50 p-4 sm:p-6 lg:p-8">
						<LoadingSpinner variant="inline" size="lg" text="Loading Trades Data..." />
						<p class="text-center text-sm text-gray-300 sm:text-base">Fetching trades...</p>
					</div>
				{:else if $tradesQuery?.isError}
					<div class="max-w-full rounded-lg bg-gray-800/50 p-4 sm:p-6 lg:p-8">
						<h2 class="mb-4 text-base font-semibold text-red-400 sm:text-lg lg:text-xl">
							Error Loading Trades Data
						</h2>
						<p class="mb-2 text-xs text-gray-300 sm:text-sm lg:text-base">
							There was an error fetching the trades data:
						</p>
						<div class="mt-4 rounded border border-red-500/30 bg-red-900/20 p-3 sm:p-4">
							<p class="text-xs text-red-300 sm:text-sm">
								{$tradesQuery.error?.message || 'Unknown error occurred'}
							</p>
						</div>
					</div>
				{:else if tradesData && Array.isArray(tradesData) && tradesData.length > 0}
					<div class="max-w-full overflow-x-auto">
						<VolumeChart trades={tradesData} />
					</div>
				{:else}
					<h2 class="mb-4 text-base font-semibold text-white sm:text-lg lg:text-xl">
						No Trades Data Available
					</h2>
				{/if}
			</div>
			<!-- Latest Proofs -->
			<div
				class="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-yellow-900/20 p-3 backdrop-blur-sm sm:p-4 lg:p-6"
			>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<div>
						<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Latest Deposits</h2>
						<p class="text-xs text-gray-400 sm:text-sm">Most recent deposits</p>
					</div>
				</div>
				<div class="space-y-3">
					{#each recentDeposits.slice(0, 5) as proof}
						<!-- Proof Card -->
						<div
							class="rounded-xl border border-white/5 bg-black/30 p-3 transition-all hover:border-blue-500/30 sm:p-4"
						>
							<div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div class="min-w-0 flex-1">
									<h4 class="truncate text-xs font-semibold sm:text-sm">
										{proof.id.split('-')[0]} - {formatUnits(BigInt(proof.amount), 18)}
									</h4>
									<p class="break-words text-xs text-gray-400">
										Depositor: {proof.emitter.address.slice(0, 8)}...{proof.emitter.address.slice(
											-6
										)} • {new Date(Number(proof.timestamp) * 1000).toLocaleString()}
									</p>
								</div>
								<div class="flex flex-shrink-0 items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-green-500" />
									<a
										href={`${TARGET_NETWORK_EXPLORER_URL}/tx/${proof.transaction.id}`}
										class="whitespace-nowrap text-xs text-blue-400 transition-colors hover:text-blue-300"
									>
										View Details
									</a>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<!-- Documentation -->
			<div class={SECTION_CLASSES}>
				<div
					class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Documentation</h2>
						<p class="text-xs text-gray-400 sm:text-sm">Links to all ST0x website explainers</p>
					</div>
					<button
						class="w-full rounded-lg border border-blue-500 bg-blue-500/20 px-3 py-2 text-xs font-medium text-blue-500 transition-all hover:bg-blue-500 hover:text-white sm:w-auto sm:px-4 sm:text-sm"
					>
						View All Docs
					</button>
				</div>
				<div class="space-y-2">
					{#each DOCUMENTATION_ITEMS as item, index}
						<!-- Documentation Item -->
						<div class="overflow-hidden rounded-lg border border-white/10">
							<button
								on:click={() => toggleDocumentation(index)}
								class="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-white/5 sm:px-4 sm:py-4 lg:px-6"
							>
								<span class="pr-2 text-xs font-medium sm:text-sm lg:text-base">{item.question}</span
								>
								<span class="flex-shrink-0 transition-transform {item.isOpen ? 'rotate-180' : ''}">
									↓
								</span>
							</button>
							{#if item.isOpen}
								<div class="border-t border-white/10 px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6">
									<p class="mb-3 text-xs text-gray-400 sm:text-sm">{item.answer}</p>
									<a
										href={item.link}
										class="text-xs text-yellow-500 transition-colors hover:text-yellow-400 sm:text-sm"
									>
										Learn more →
									</a>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<Footer />
	</div>
{/if}
