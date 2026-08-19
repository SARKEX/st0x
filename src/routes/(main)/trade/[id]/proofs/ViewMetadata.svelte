<script lang="ts">
	import type { MetaV1S, OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { fade } from 'svelte/transition';
	import { cborDecode } from '$lib/utils/helpers';
	import { MAGIC_NUMBERS } from '$lib/config/constants';
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
		// Not all tokens embed an OA_SCHEMA key — guard before calling toString()
		const schemaHash = information[0].get(MAGIC_NUMBERS.OA_SCHEMA);
		const assetClass =
			schemaHash != null ? schemas.find((s) => s.hash === schemaHash.toString()) ?? null : null;

		return { ...metaV1, information, schema: assetClass };
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mappedMetaV1: any[] = [];

	$: if (vault && $sftMetadata?.length) {
		// Scan all metadata entries and keep those that decoded successfully,
		// rather than stopping at slice(0,1) even when the first entry crashes.
		mappedMetaV1 = $sftMetadata
			.map((metaV1) => {
				try {
					return getReceiptSchema(metaV1);
				} catch {
					return null;
				}
			})
			.filter((v): v is NonNullable<typeof v> => v !== null);
	} else {
		mappedMetaV1 = [];
	}
</script>

{#if !mappedMetaV1.length}
	<div class="flex h-full w-full flex-col" data-testid="no-deposits">
		<p class="text-pretty text-text dark:text-text">No metadata has been added</p>
	</div>
{:else}
	<div in:fade>
		{#each mappedMetaV1 as deposit}
			<ReceiptMetadata receiptInformation={deposit.meta} />
		{/each}
	</div>
{/if}
