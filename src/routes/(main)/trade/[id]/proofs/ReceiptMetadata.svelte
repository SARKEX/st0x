<script lang="ts">
	import { bytesToMeta, cborDecode, convertDotNotationToObject } from '$lib/utils/helpers';
	import Section from '$lib/components/ui/Section.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let receiptInformation: string;

	let data: Record<string, unknown> | null = null;
	let showAll = false;

	$: (function decode() {
		if (!receiptInformation) {
			data = null;
			return;
		}
		try {
			const decoded = cborDecode(receiptInformation.slice(18));
			const structure = bytesToMeta(decoded[0].get(0), 'json');
			data = convertDotNotationToObject(structure);
		} catch {
			data = null;
		}
	})();
</script>

{#if data}
	<Section>
		<div class="mb-3 flex items-center justify-between">
			<h4 class="text-lg font-semibold">Receipt Metadata</h4>
			<Button size="sm" variant="secondary" on:click={() => (showAll = !showAll)}>
				{showAll ? 'Collapse' : 'Expand'}
			</Button>
		</div>
		<pre
			class="max-h-96 overflow-auto rounded border border-white/10 bg-gray-900 p-3 text-xs text-gray-200">{JSON.stringify(
				data,
				null,
				2
			)}</pre>
	</Section>
{:else}
	<div class="rounded border border-gray-500/30 bg-gray-900/30 p-3 text-sm text-gray-400">
		No metadata available for this receipt.
	</div>
{/if}
