<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getSftMetadata } from '$lib/getSftMetadata';
	import { page } from '$app/stores';
	import { sftMetadata, currentNetwork, sfts, currentToken } from '$lib/stores';

	const { id } = $page.params;

	$: query = createQuery({
		queryKey: ['getSftMetadata', id, $currentNetwork?.id],
		enabled: !!$currentNetwork?.metadata_subgraph_url,
		queryFn: () => getSftMetadata(id, $currentNetwork.metadata_subgraph_url as string)
	});

	$: if ($query && $query.data) {
		sftMetadata.set($query.data);
	}

	// Ensure currentToken is set when coming directly to /trade/[id]/proofs
	$: if ($sfts && id) {
		const found = $sfts.find((v) => v.id === id || v.address?.toLowerCase() === id.toLowerCase());
		if (found) currentToken.set(found);
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
