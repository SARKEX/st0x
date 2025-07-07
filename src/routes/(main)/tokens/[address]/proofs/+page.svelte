<script lang="ts">
	import type { Schema } from '$lib/types/SchemaQueryResponse';
	import { currentToken } from '$lib/stores';
	import { addSchemaToReceipts } from '$lib/addSchemaToReceipts';
	import { Spinner } from 'flowbite-svelte';
	import ViewMetadata from './ViewMetadata.svelte';

	/** @type {import('./$types').PageData} */

	export let addressHasRole: boolean | null = null;

	let schemas: Schema[] = [];
	$: if ($currentToken) {
		schemas = addSchemaToReceipts($currentToken);
	}
</script>

{#if $currentToken}
	<div class="max-w-8xl mt-0 w-full px-6 text-gray-100">
		<div class="mt-12 flex flex-grow flex-col rounded-lg border border-white/10 bg-gray-900/80 p-6 shadow-lg">
			<h3 class="mb-2 text-left text-2xl font-bold text-gray-100">{$currentToken.name} Metadata</h3>
			<ViewMetadata vault={$currentToken} {schemas} />
		</div>
	</div>
{:else}
	<div class="flex h-64 w-full items-center justify-center">
		<Spinner size="16" />
	</div>
{/if}
