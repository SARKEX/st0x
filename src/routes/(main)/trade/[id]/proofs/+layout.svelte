<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getSftMetadata, getSftById } from '$lib/api/subgraph';
	import { page } from '$app/stores';
	import { sftMetadata, currentNetwork, sfts, currentToken } from '$lib/stores';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';

	const { id } = $page.params;

	$: query = createQuery({
		queryKey: ['getSftMetadata', id, $currentNetwork?.id],
		enabled: !!$currentNetwork?.metadata_subgraph_url,
		queryFn: () => getSftMetadata(id, $currentNetwork.metadata_subgraph_url as string)
	});

	$: if ($query && $query.data) {
		sftMetadata.set($query.data);
	}

	// Fetch full vault by id when not in sfts (e.g. direct navigation to /trade/[id]/proofs)
	$: vaultQuery = createQuery({
		queryKey: ['getSftById', id, $currentNetwork?.id],
		enabled: !!$currentNetwork && !!id,
		queryFn: () => getSftById(id, $currentNetwork!)
	});

	// Set currentToken: prefer vault from sfts (instant), else use vault from getSftById
	$: if (id) {
		const foundInSfts = $sfts?.find(
			(v: OffchainAssetReceiptVault) => v.id === id || v.address?.toLowerCase() === id.toLowerCase()
		);
		if (foundInSfts) {
			currentToken.set(foundInSfts);
		} else if ($vaultQuery?.data) {
			currentToken.set($vaultQuery.data);
		}
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
