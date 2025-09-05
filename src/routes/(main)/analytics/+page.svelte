<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import { gridStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data;

	let serverStats: any = null;
	let loading = true;
	let password = '';
	let loginError = false;

	function getAverageResults(stats: any): number {
		if (!stats || stats.totalSearches === 0) return 0;
		return (
			stats.recentSearches?.reduce(
				(acc: number, s: { resultsCount?: number }) => acc + (s.resultsCount || 0),
				0
			) / stats.totalSearches || 0
		);
	}

	onMount(async () => {
		// Only fetch stats if authenticated
		if (data.authenticated) {
			try {
				const response = await fetch('/api/analytics');
				if (response.ok) {
					serverStats = await response.json();
				}
			} catch (error) {
				console.error('Failed to fetch server analytics:', error);
			}
		}
		loading = false;
	});
</script>

<PageContainer>
	<Section>
		{#if !data.authenticated}
			<!-- Login Form -->
			<div class="mx-auto max-w-md">
				<h2 class="mb-6 text-center text-2xl font-bold">Analytics Dashboard</h2>
				<Card>
					<h3 class="mb-4 text-lg font-semibold">Authentication Required</h3>
					<p class="mb-4 text-sm text-gray-400">Please enter the password to access analytics.</p>

					<form
						method="POST"
						action="?/login"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									window.location.reload();
								} else if (result.type === 'failure') {
									loginError = true;
									setTimeout(() => (loginError = false), 3000);
								}
							};
						}}
					>
						<div class="space-y-4">
							<div>
								<label for="password" class="mb-1 block text-sm font-medium text-gray-300">
									Password
								</label>
								<input
									type="password"
									id="password"
									name="password"
									bind:value={password}
									required
									class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
									placeholder="Enter password"
								/>
							</div>

							{#if loginError}
								<div class="text-sm text-red-400">Invalid password. Please try again.</div>
							{/if}

							<Button type="submit" variant="primary" className="w-full">Access Analytics</Button>
						</div>
					</form>
				</Card>
			</div>
		{:else}
			<!-- Analytics Dashboard -->
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-2xl font-bold">Search Analytics Dashboard</h2>
				<form method="POST" action="?/logout">
					<Button type="submit" size="sm" variant="secondary">Logout</Button>
				</form>
			</div>

			{#if loading}
				<div class="flex min-h-[40vh] items-center justify-center">
					<LoadingSpinner size="lg" text="Loading analytics..." />
				</div>
			{:else if serverStats}
				<div>
					<h3 class="mb-6 text-lg font-semibold text-gray-300">Platform Search Analytics</h3>
					<div class={gridStyles.responsive4 + ' mb-8'}>
						<MetricCard
							label="Total Searches"
							value={serverStats.totalSearches?.toString() || '0'}
							change="Total number of searches across all users (last 100)"
						/>
						<MetricCard
							label="Unique Visitors Today"
							value={serverStats.uniqueVisitorsToday?.toString() || '0'}
							change="Number of unique users who searched today"
						/>
						<MetricCard
							label="No Result Searches"
							value={serverStats.searchesWithNoResults?.toString() || '0'}
							change="Searches that returned zero matching stocks"
						/>
						<MetricCard
							label="Avg Results Count"
							value={getAverageResults(serverStats).toFixed(1)}
							change="Average number of results per search"
						/>
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						{#if serverStats.topSearchTerms?.length > 0}
							<Card>
								<h4 class="mb-3 font-semibold">Top Search Terms</h4>
								<div class="space-y-2">
									{#each serverStats.topSearchTerms.slice(0, 8) as term}
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
								<div class="max-h-[320px] space-y-2 overflow-y-auto">
									{#each serverStats.recentSearches.slice(0, 10) as search}
										<div
											class="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
										>
											<span class="mr-2 truncate text-sm">{search.searchTerm || 'Unknown'}</span>
											<div class="flex flex-shrink-0 items-center gap-2">
												<span class="text-xs text-gray-400">
													{search.resultsCount || 0} results
												</span>
												<span class="text-xs text-gray-500">
													{new Date(search.timestamp).toLocaleTimeString()}
												</span>
											</div>
										</div>
									{/each}
								</div>
							</Card>
						{/if}
					</div>
				</div>
			{:else}
				<div
					class="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-400"
				>
					Analytics data not available. Please check back later.
				</div>
			{/if}
		{/if}
	</Section>
</PageContainer>
