<script lang="ts">
	import { page } from '$app/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { sfts, currentToken } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { TOKENS, networks } from '$lib/network';

	const { address } = $page.params;

	$: query = createQuery({
		queryKey: ['getToken', address],
		queryFn: async () => {
			// First try to find the token in the current network's SFTs
			let currentToken = $sfts.find((token) => token.id.toLowerCase() === address.toLowerCase());
			
			// If not found in current network's SFTs, try to find it in TOKENS array across all networks
			if (!currentToken) {
				const tokenInAnyNetwork = TOKENS.find((token) => token.address.toLowerCase() === address.toLowerCase());
				if (tokenInAnyNetwork) {
									// Create a mock token object based on the TOKENS data
				currentToken = {
					id: tokenInAnyNetwork.address,
					address: tokenInAnyNetwork.address,
					name: tokenInAnyNetwork.name || tokenInAnyNetwork.symbol || 'Unknown Token',
					symbol: tokenInAnyNetwork.symbol || 'UNKNOWN',
					totalShares: '0', // This will be updated if we can fetch from subgraph
					chainId: tokenInAnyNetwork.chainId,
					deployer: '0x0000000000000000000000000000000000000000',
					admin: '0x0000000000000000000000000000000000000000',
					deployTimestamp: '0',
					receiptContractAddress: '0x0000000000000000000000000000000000000000',
					shareHolders: [],
					tokenHolders: [],
					activeAuthorizer: {
						id: '0x0000000000000000000000000000000000000000',
						address: '0x0000000000000000000000000000000000000000',
						isActive: true,
						rolesGranted: [],
						roleHolders: [],
						roles: [],
						roleRevokes: []
					},
					authorizers: [],
					receiptVaultInformations: [],
					certifications: [],
					withdraws: [],
					deposits: [],
					shareTransfers: [],
					receiptBalances: []
				};
				}
			}
			
			if (!currentToken) {
				throw new Error('Token not found');
			}
			
			return {
				token: currentToken
			};
		}
	});

	$: currentToken.set($query.data?.token ?? null);
</script>

{#if $query.isLoading || $query.isFetching || $query.isRefetching}
	<div class="flex w-full items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading..." />
	</div>
{:else if $query.data}
	<slot />
{:else if $query.error}
	<div>
		<p>Error loading token data</p>
	</div>
{/if}
