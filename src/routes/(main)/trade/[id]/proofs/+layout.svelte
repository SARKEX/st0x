<script lang="ts">
	import { browser } from '$app/environment';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { apiGetTokenProofs } from '$lib/api/st0xApi';
	import { page } from '$app/stores';
	import { sftMetadata, tokenProofs, currentNetwork, sfts, currentToken } from '$lib/stores';
	import { getTokenByAnyAddress } from '$lib/config/tokens';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';

	const { id } = $page.params;

	$: query = createQuery({
		queryKey: ['getTokenProofs', id, $currentNetwork?.id],
		enabled: Boolean(browser && id && $currentNetwork),
		queryFn: () => apiGetTokenProofs(id, $currentNetwork!.chainId)
	});

	$: if ($query && $query.data) {
		tokenProofs.set($query.data);
		sftMetadata.set($query.data.metadata);
	} else if ($query?.error) {
		tokenProofs.set(null);
		sftMetadata.set(null);
	}

	// Set currentToken: prefer cached vault details for display name, then fall back to token config.
	$: if (id) {
		const wrappedAddress = $query?.data?.address?.toLowerCase();
		const foundInSfts = $sfts?.find(
			(v: OffchainAssetReceiptVault) =>
				v.id === id ||
				v.address?.toLowerCase() === id.toLowerCase() ||
				(wrappedAddress && v.address?.toLowerCase() === wrappedAddress)
		);
		if ($query?.data) {
			const token =
				getTokenByAnyAddress(id, $currentNetwork?.chainId) ??
				getTokenByAnyAddress($query.data.address, $currentNetwork?.chainId);
			currentToken.set({
				...(foundInSfts ?? {}),
				id: $query.data.address,
				totalShares: foundInSfts?.totalShares ?? '0',
				address: $query.data.address as `0x${string}`,
				deployer: foundInSfts?.deployer ?? '',
				admin: foundInSfts?.admin ?? '',
				name: foundInSfts?.name ?? token?.name ?? token?.symbol ?? $query.data.address,
				symbol: foundInSfts?.symbol ?? token?.symbol ?? '',
				deployTimestamp: foundInSfts?.deployTimestamp ?? '',
				receiptContractAddress: foundInSfts?.receiptContractAddress ?? '',
				tokenHolders: foundInSfts?.tokenHolders ?? [],
				receiptVaultInformations: $query.data.schemas.map((schema) => ({
					id: schema.id,
					information: schema.information,
					timestamp: String(schema.timestamp),
					caller: { address: '' },
					transaction: { blockNumber: '' }
				})),
				withdraws: foundInSfts?.withdraws ?? [],
				deposits: foundInSfts?.deposits ?? [],
				shareTransfers: foundInSfts?.shareTransfers ?? [],
				chainId: $currentNetwork?.chainId
			});
		} else if (foundInSfts) {
			currentToken.set(foundInSfts);
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
