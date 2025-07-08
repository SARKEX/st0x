<script lang="ts">
	import { getPinStatus } from '$lib/getPinStatus';
	import { Popover } from 'flowbite-svelte';
	import { InfoCircleOutline } from 'flowbite-svelte-icons';

	export let cid: string;

	type PinStatus = {
		ipfs_pin_hash: string;
		size: number;
		metadata: {
			name: string;
		};
		mime_type: string;
		date_pinned: string;
		regions: {
			currentReplicationCount: number;
		}[];
		totalPins: number;
	};

	let pinStatus: PinStatus;
	let noPinFound: boolean = false;

	// eslint-disable-next-line  @typescript-eslint/no-unused-expressions
	$: cid && initPinStatus();

	const initPinStatus = async () => {
		try {
			const res = await getPinStatus(cid);

			if (res.status === 200) {
				pinStatus = res.pinStatus;
			} else {
				noPinFound = true;
			}
		} catch {
			return (noPinFound = true);
		}
	};
</script>

<InfoCircleOutline class="cursor-pointer" data-testid="ipfs-info-icon" />

{#if noPinFound}
	<Popover>
		<div class="text-sm text-red-500" data-testid="no-pin-found">
			<p>This IPFS hash does not exist in our dedicated IPFS gateway.</p>
			<p>You maybe be able to view it in the public gateway.</p>
		</div>
	</Popover>
	<div style="display: none;" data-testid="no-pin-found"></div>
{:else if pinStatus}
	<Popover>
		<div class="p-4">
			<ul class="list-disc pl-4 text-sm">
				<li><strong>IPFS Hash:</strong> {pinStatus.ipfs_pin_hash}</li>
				<li><strong>File Size:</strong> {pinStatus.size} bytes</li>
				<li><strong>File Name:</strong> {pinStatus.metadata?.name}</li>
				<li><strong>MIME Type:</strong> {pinStatus.mime_type}</li>
				<li><strong>Date Pinned:</strong> {new Date(pinStatus.date_pinned).toLocaleString()}</li>
				{#if pinStatus.totalPins}
					<li>
						<strong>Total Pin Addresses:</strong>
						{pinStatus.totalPins}
					</li>
				{/if}
			</ul>
		</div>
	</Popover>
	<div style="display: none;" data-testid="pin-status-info"></div>
{/if}
