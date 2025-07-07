<script lang="ts">
	import { FetchStatus } from '$lib/types';
	import { IPFS_GATEWAY } from '$lib/consts';
	import { Button } from 'flowbite-svelte';
	import { ArrowDownOutline } from 'flowbite-svelte-icons';

	export let cid: string;
	export let fetchStatus: FetchStatus = FetchStatus.FETCHING;
	let downloadError: boolean;

	async function downloadFile(event: Event) {
		event.preventDefault();
		const url = IPFS_GATEWAY + cid;
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = blobUrl;
			link.setAttribute('download', 'downloaded-file');
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			downloadError = true;
		}
	}
</script>

<div class="flex flex-row gap-2">
	<Button
		color="light"
		data-testid="download-button"
		disabled={fetchStatus !== FetchStatus.FETCHED}
		class={'w-fit' + fetchStatus !== FetchStatus.FETCHED ? 'cursor-not-allowed' : 'cursor-pointer'}
		on:click={downloadFile}
		rel="noopener noreferrer"
	>
		Download File <ArrowDownOutline
			data-testid="download-icon"
			class="ms-1.5 inline cursor-pointer self-center text-red-500"
		/>
	</Button>
	{#if downloadError}
		<span data-testid="error" class="text-red-500">Download Failed</span>
	{/if}
</div>
