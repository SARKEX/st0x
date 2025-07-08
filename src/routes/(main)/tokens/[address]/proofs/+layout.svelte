<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getSftMetadata } from '$lib/getSftMetadata';
	import { page } from '$app/stores';
	import { sftMetadata } from '$lib/stores';
	import { ARBITRUM_METADATA_SUBGRAPH_URL } from '$lib/network';

	const { address } = $page.params;

	$: query = createQuery({
		queryKey: ['getSftMetadata', address],
		queryFn: () => {
			return getSftMetadata(address, ARBITRUM_METADATA_SUBGRAPH_URL as string);
		}
	});

	$: if ($query && $query.data) {
		sftMetadata.set($query.data);
	}
</script>

{#if $query.isLoading || $query.isFetching || $query.isRefetching}
	<LoadingSpinner variant="fullscreen" size="lg" text="Loading vault data..." />
{:else if $query.data}
	<slot />
{:else if $query.error}
	<div data-testid="load-error">
		<p>Error loading vault data</p>
	</div>
{/if}
