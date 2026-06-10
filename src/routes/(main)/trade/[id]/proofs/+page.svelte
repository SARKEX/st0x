<script lang="ts">
	import type { Schema } from '$lib/types/SchemaQueryResponse';
	import { currentToken, tokenProofs } from '$lib/stores';
	import { addSchemaToReceiptVaultInformations } from '$lib/utils/schemas';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ViewMetadata from './ViewMetadata.svelte';
	import Section from '$lib/components/ui/Section.svelte';

	let schemas: Schema[] = [];
	$: if ($tokenProofs) {
		// @ts-expect-error - schema decoder return shape is compatible with Schema[] for ViewMetadata
		schemas = addSchemaToReceiptVaultInformations($tokenProofs.schemas);
	} else {
		schemas = [];
	}
</script>

{#if $currentToken}
	<div class="max-w-8xl mt-0 w-full px-6 text-gray-100">
		<Section className="mt-12 flex flex-grow flex-col shadow-lg">
			<h3 class="mb-2 text-left text-2xl font-bold text-gray-100">{$currentToken.name} Metadata</h3>
			<ViewMetadata vault={$currentToken} {schemas} />
		</Section>
	</div>
{:else}
	<div class="flex h-64 w-full items-center justify-center">
		<LoadingSpinner variant="inline" size="md" text="Loading metadata..." />
	</div>
{/if}
