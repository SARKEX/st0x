<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import VolumeChart from '$lib/components/charts/VolumeChart.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import type { Deposit, OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { sfts } from '$lib/stores';
	import { TARGET_NETWORK_EXPLORER_URL } from '$lib/network';
	import { getTrades } from '$lib/query';
	import StoxPages from '$lib/components/StoxPages.svelte';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	let PLATFORM_STATS: { label: string; value: string; change: string }[] = [];
	let recentDeposits: Deposit[] = [];

	$: tradesQuery = createQuery({
		queryKey: ['getTrades'],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const sevenDaysAgo = now - 7 * 86400;
			const trades = await getTrades(sevenDaysAgo, now);
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
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	function toggleDocumentation(index: number) {
		DOCUMENTATION_ITEMS[index].isOpen = !DOCUMENTATION_ITEMS[index].isOpen;
	}
</script>

<!-- Main Content -->

{#if $sfts.length > 0}
	<div>
		<!-- Header -->
		<div
			class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<div>
						<h1 class="text-xl font-bold">Dashboard</h1>
						<p class="text-sm text-gray-400">Welcome to ST0x</p>
					</div>
				</div>

				<div class="flex items-center gap-4">
					<WalletConnect />
				</div>
			</div>
		</div>

		<!-- Dashboard Content -->
		<div class="space-y-8 p-6">
			<!-- Hero Section -->
			<div class="relative overflow-hidden rounded-2xl">
				<!-- Background with gradient and pattern -->
				<div
					class="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-600 to-yellow-500 opacity-90"
				/>
				<div class="absolute inset-0 bg-gradient-to-r from-blue-900/50 to-purple-900/50" />

				<!-- Content -->
				<div class="relative px-12 py-12 text-center">
					<h1 class="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl">
						Your gateway to onchain equities
					</h1>

					<p class="mx-auto mb-8 max-w-3xl text-lg leading-relaxed text-blue-100 md:text-xl">
						Trade tokenized stocks on-chain with full transparency, 24/7 availability, and
						fractional ownership. The future of equities trading is here.
					</p>

					<button
						class="rounded-xl border border-white/30 bg-white/20 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/30"
						on:click={() => goto('/neworder')}
					>
						Trade now
					</button>
				</div>
			</div>
			<StoxPages />

			<!-- Platform Overview -->
			<div class={SECTION_CLASSES}>
				<div class="mb-6 flex items-center justify-between">
					<h2 class="text-xl font-semibold">Platform Overview</h2>
				</div>
				<div class="grid grid-cols-4 gap-4">
					{#each PLATFORM_STATS as metric}
						<!-- Metric Card -->
						<div class="{CARD_BASE_CLASSES} p-5">
							<div class={GRADIENT_HOVER_CLASSES} />
							<div class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
								{metric.label}
							</div>
							<div class="mb-2">
								<span class="block text-2xl font-bold">{metric.value}</span>
							</div>
							<div class="flex items-center gap-1 text-sm font-medium text-yellow-500">
								<span>↗</span>
								{metric.change}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class={SECTION_CLASSES}>
				{#if $tradesQuery?.isLoading}
					<div class="max-w-8xl rounded-lg bg-gray-800/50 p-8">
						<div class="flex items-center justify-center">
							<div class="relative">
								<div
									class="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-20"
								></div>
								<div
									class="relative h-16 w-16 animate-spin rounded-full border-4 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500"
								></div>
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="h-12 w-12 rounded-full bg-gray-800"></div>
								</div>
							</div>
						</div>
						<h2 class="mb-4 mt-4 text-center text-xl font-semibold text-white">
							Loading Trades Data...
						</h2>
						<p class="text-center text-gray-300">Fetching trades...</p>
					</div>
				{:else if $tradesQuery?.isError}
					<div class="max-w-8xl rounded-lg bg-gray-800/50 p-8">
						<h2 class="mb-4 text-xl font-semibold text-red-400">Error Loading Trades Data</h2>
						<p class="mb-2 text-gray-300">There was an error fetching the trades data:</p>
						<div class="mt-4 rounded border border-red-500/30 bg-red-900/20 p-4">
							<p class="text-sm text-red-300">
								{$tradesQuery.error?.message || 'Unknown error occurred'}
							</p>
						</div>
					</div>
				{:else if tradesData && Array.isArray(tradesData) && tradesData.length > 0}
					<div class="max-w-8xl">
						<VolumeChart trades={tradesData} />
					</div>
				{:else}
					<h2 class="mb-4 text-xl font-semibold text-white">No Trades Data Available</h2>
				{/if}
			</div>
			<!-- Latest Proofs -->
			<div
				class="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-yellow-900/20 p-6 backdrop-blur-sm"
			>
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">Latest Deposits</h2>
						<p class="text-sm text-gray-400">Most recent deposits</p>
					</div>
				</div>
				<div class="space-y-3">
					{#each recentDeposits.slice(0, 5) as proof}
						<!-- Proof Card -->
						<div
							class="rounded-xl border border-white/5 bg-black/30 p-4 transition-all hover:border-blue-500/30"
						>
							<div class="mb-2 flex items-center justify-between">
								<div>
									<h4 class="text-sm font-semibold">
										{proof.id.split('-')[0]} - {formatUnits(BigInt(proof.amount), 18)}
									</h4>
									<p class="text-xs text-gray-400">
										Depositor: {proof.emitter.address} • {new Date(
											Number(proof.timestamp) * 1000
										).toLocaleString()}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-green-500" />
									<a
										href={`${TARGET_NETWORK_EXPLORER_URL}/tx/${proof.transaction.id}`}
										class="text-xs text-blue-400 transition-colors hover:text-blue-300"
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
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">Documentation</h2>
						<p class="text-sm text-gray-400">Links to all ST0x website explainers</p>
					</div>
					<button
						class="rounded-lg border border-blue-500 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-500 transition-all hover:bg-blue-500 hover:text-white"
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
								class="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/5"
							>
								<span class="font-medium">{item.question}</span>
								<span class="transition-transform {item.isOpen ? 'rotate-180' : ''}"> ↓ </span>
							</button>
							{#if item.isOpen}
								<div class="border-t border-white/10 px-6 pb-4">
									<p class="mb-3 text-sm text-gray-400">{item.answer}</p>
									<a
										href={item.link}
										class="text-sm text-yellow-500 transition-colors hover:text-yellow-400"
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
