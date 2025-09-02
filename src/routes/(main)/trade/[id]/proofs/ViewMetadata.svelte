<script lang="ts">
	import type { MetaV1S, OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { fade } from 'svelte/transition';
	import { cborDecode } from '$lib/helpers';
	import { MAGIC_NUMBERS } from '$lib/consts';
	import { sftMetadata } from '$lib/stores';
	import ReceiptMetadata from './ReceiptMetadata.svelte';

	export let vault: OffchainAssetReceiptVault;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let schemas: any[];

	const getReceiptSchema = (metaV1: MetaV1S) => {
		let information = metaV1.meta ? cborDecode(metaV1.meta.slice(18)) : null;
		if (!information) {
			return { ...metaV1, information: [{}], schema: null };
		}
		let schemaHash = information[0].get(MAGIC_NUMBERS.OA_SCHEMA);
		let assetClass = schemas.find((s) => s.hash === schemaHash.toString());

		return { ...metaV1, information, schema: assetClass };
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mappedMetaV1: any[] = [];

	$: if (vault && $sftMetadata) {
		if ($sftMetadata?.length > 0) {
			mappedMetaV1 = $sftMetadata.slice(0, 1).map((metaV1) => {
				return getReceiptSchema(metaV1);
			});
		}
	}
</script>

{#if !mappedMetaV1.length}
	<div class="flex h-full w-full flex-col" data-testid="no-deposits">
		<p class="text-pretty text-white dark:text-white">No metadata has been added</p>
	</div>
{:else}
	<div in:fade>
		{#each mappedMetaV1 as deposit}
			<ReceiptMetadata receiptInformation={deposit.meta} schema={deposit.schema} />
		{/each}
	</div>
{/if}

