<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { onMount } from 'svelte';
	import { searchAnalytics } from '$lib/analytics';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import { gridStyles } from '$lib/utils/styles';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let localStats: any = null;
	let serverStats: any = null;
	let loading = true;

	onMount(async () => {
		// Get local stats from store
		localStats = searchAnalytics.getSearchStats();

		// Fetch server stats
		try {
			const response = await fetch('/api/analytics');
			if (response.ok) {
				serverStats = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch server analytics:', error);
		}

		loading = false;
	});

	function exportData() {
		const data = searchAnalytics.exportData();
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `search-analytics-${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function clearLocalData() {
		if (confirm('Are you sure you want to clear all local analytics data?')) {
			searchAnalytics.clearData();
			localStats = searchAnalytics.getSearchStats();
		}
	}
</script>

<PageContainer>
	<Section>
		<div class="mb-6 flex items-center justify-between">
			<h2 class="text-2xl font-bold">Search Analytics Dashboard</h2>
			<div class="flex gap-2">
				<Button size="sm" variant="secondary" on:click={exportData}>Export Data</Button>
				<Button size="sm" variant="danger" on:click={clearLocalData}>Clear Local Data</Button>
			</div>
		</div>

		{#if loading}
			<div class="flex min-h-[40vh] items-center justify-center">
				<LoadingSpinner size="lg" text="Loading analytics..." />
			</div>
		{:else}
			<!-- Local Session Stats -->
			{#if localStats}
				<div class="mb-8">
					<h3 class="mb-4 text-lg font-semibold text-gray-300">Current Session</h3>
					<div class={gridStyles.responsive4}>
						<MetricCard
							label="Total Searches"
							value={localStats.totalSearches.toString()}
							change="This session"
						/>
						<MetricCard
							label="Unique Terms"
							value={localStats.uniqueTerms.toString()}
							change="Different searches"
						/>
						<MetricCard
							label="Click-through Rate"
							value={`${localStats.clickThroughRate.toFixed(1)}%`}
							change="Result clicks"
						/>
						<MetricCard
							label="No Results"
							value={localStats.searchesWithNoResults.toString()}
							change="Empty searches"
						/>
					</div>

					{#if localStats.topSearchTerms.length > 0}
						<Card>
							<h4 class="mb-3 font-semibold">Top Search Terms (Session)</h4>
							<div class="space-y-2">
								{#each localStats.topSearchTerms as term}
									<div
										class="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
									>
										<span class="text-sm">{term.term}</span>
										<span class="text-xs text-gray-400">{term.count} searches</span>
									</div>
								{/each}
							</div>
						</Card>
					{/if}
				</div>
			{/if}

			<!-- Server Stats -->
			{#if serverStats}
				<div>
					<h3 class="mb-4 text-lg font-semibold text-gray-300">All Time Statistics</h3>
					<div class={gridStyles.responsive4}>
						<MetricCard
							label="Total Searches"
							value={serverStats.totalSearches?.toString() || '0'}
							change="All time"
						/>
						<MetricCard
							label="Unique Sessions"
							value={serverStats.uniqueSessions?.toString() || '0'}
							change="Different users"
						/>
						<MetricCard
							label="Click-through Rate"
							value={`${(serverStats.clickThroughRate || 0).toFixed(1)}%`}
							change="Result clicks"
						/>
						<MetricCard
							label="Avg Duration"
							value={`${(serverStats.avgSearchDuration / 1000 || 0).toFixed(1)}s`}
							change="Search time"
						/>
					</div>

					{#if serverStats.topSearchTerms?.length > 0}
						<Card>
							<h4 class="mb-3 font-semibold">Top Search Terms (All Time)</h4>
							<div class="space-y-2">
								{#each serverStats.topSearchTerms as term}
									<div
										class="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
									>
										<span class="text-sm">{term.term}</span>
										<span class="text-xs text-gray-400">{term.count} searches</span>
									</div>
								{/each}
							</div>
						</Card>
					{/if}

					{#if serverStats.recentSearches?.length > 0}
						<Card>
							<h4 class="mb-3 font-semibold">Recent Searches</h4>
							<div class="space-y-2">
								{#each serverStats.recentSearches.slice(0, 10) as search}
									<div
										class="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
									>
										<span class="text-sm">{search.event?.searchTerm || 'Unknown'}</span>
										<div class="flex items-center gap-2">
											<span class="text-xs text-gray-400">
												{search.event?.resultsCount || 0} results
											</span>
											<span class="text-xs text-gray-500">
												{new Date(search.timestamp || search.serverTimestamp).toLocaleTimeString()}
											</span>
										</div>
									</div>
								{/each}
							</div>
						</Card>
					{/if}
				</div>
			{:else if !loading}
				<div
					class="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-400"
				>
					Server analytics not available. Local session data is being tracked.
				</div>
			{/if}
		{/if}
	</Section>
</PageContainer>
