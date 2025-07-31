<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { sfts, currentToken } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	const { address } = $page.params;

	$: query = createQuery({
		queryKey: ['getToken', address],
		queryFn: async () => {
			const currentToken = $sfts.find((token) => token.id.toLowerCase() === address.toLowerCase());
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
