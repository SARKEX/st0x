<script lang="ts">
	import CsvFrame from './CsvFrame.svelte';
	import DownloadButton from './DownloadButton.svelte';
	import LinkToIpfs from './LinkToIpfs.svelte';
	import PdfFrame from './PdfFrame.svelte';
	import { FetchStatus } from '$lib/types';
	import { fetchIpfsFile } from '$lib/fetchIpfsFile';

	import { Badge, Button, Card, Indicator, Video } from 'flowbite-svelte';
	import ImageFrame from './ImageFrame.svelte';
	import PinStatusPopover from './PinStatusPopover.svelte';

	export let cid: string;
	export let showAllFiles: boolean;

	$: console.log('cid : ', cid);

	let fetchedFileType: string = '';
	let textFromIpfs: string;
	let csvFromIpfs: string;
	let fetchError: string;
	let isFileVisible: boolean = false;
	let pinataUrl: string = '';
	let fetchStatus: FetchStatus = FetchStatus.FETCHING;

	const loadIpfsFile = async (cid: string) => {
		const result = await fetchIpfsFile(cid);

		fetchedFileType = result.contentType;
		fetchStatus = result.fetchStatus;
		fetchError = result.fetchError || '';

		if (result.contentType.startsWith('text/plain')) {
			console.log('result.data 1: ', result.data);
			textFromIpfs = result.data as string;
		} else if (result.contentType.startsWith('text/csv')) {
			console.log('result.data 2: ', result.data);
			csvFromIpfs = result.data as string;
		} else {
			pinataUrl = result.data as string;
		}
	};
	$: console.log('pinataUrl : ', pinataUrl);
	$: cid && loadIpfsFile(cid);

	$: showAllFiles && (isFileVisible = true);
	$: showAllFiles === false && (isFileVisible = false);

	const toggleFileVisibility = () => {
		isFileVisible = !isFileVisible;
	};
</script>

<div class="mt-4 flex flex-col gap-2" data-testid="ipfs-file-container">
	<div class="flex flex-row items-center gap-2">
		<Badge
			data-testid="ipfs-fetch-status"
			color={fetchStatus === FetchStatus.FETCHING
				? 'blue'
				: fetchStatus === FetchStatus.ERROR
					? 'red'
					: 'green'}
			class="flex w-fit flex-row items-center gap-2 text-sm"
			><Indicator
				color={fetchStatus === FetchStatus.FETCHING
					? 'blue'
					: fetchStatus === FetchStatus.ERROR
						? 'red'
						: 'green'}
				size="lg"
				class={fetchStatus === FetchStatus.FETCHING ? 'animate-pulse' : ''}
			></Indicator>{fetchError || fetchStatus}<span class="font-semibold"
				>{fetchedFileType && `${fetchedFileType}`}</span
			>
		</Badge>
		<PinStatusPopover {cid} />
	</div>
	<div class="flex flex-row gap-2 py-2" data-testid="ipfs-buttons">
		<Button
			color="alternative"
			on:click={toggleFileVisibility}
			class={fetchStatus === FetchStatus.FETCHED
				? 'w-32 cursor-pointer'
				: 'w-32 cursor-not-allowed'}
			data-testid="toggle-visibility-button"
			disabled={fetchStatus === FetchStatus.FETCHING || fetchStatus === FetchStatus.ERROR}
		>
			{isFileVisible ? 'Hide File' : 'Show File'}
		</Button>

		<DownloadButton {cid} {fetchStatus} />
		<Button data-testid="ipfs-link" color="light" class="w-fit cursor-pointer">
			<LinkToIpfs {cid} />
		</Button>
	</div>

	{#if isFileVisible && fetchedFileType}
		<div class="flex" data-testid="ipfs-visible-file">
			{#if fetchedFileType.startsWith('image')}
				<div data-testid="image-frame">
					<ImageFrame src={pinataUrl} />
				</div>
			{:else if fetchedFileType.startsWith('application/pdf')}
				<div class="w-full" data-testid="pdf-preview">
					<PdfFrame url={pinataUrl} />
				</div>
			{:else if fetchedFileType.startsWith('text/plain')}
				<Card size="lg">{textFromIpfs}</Card>
			{:else if fetchedFileType.startsWith('text/csv')}
				<CsvFrame {csvFromIpfs} />
			{:else if fetchedFileType.startsWith('video/')}
				<div data-testid="video-frame">
					<Video controls src={pinataUrl} />
				</div>
			{/if}
		</div>
	{/if}
</div>
