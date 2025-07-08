<script lang="ts">
	import { bytesToMeta, cborDecode, convertDotNotationToObject } from '$lib/helpers';
	import RecursiveRenderer from '$lib/components/metadata/RecursiveRenderer.svelte';
	import type { AssetSchema } from '$lib/types/OffchainAssetReceiptVault';
	import { Button } from 'flowbite-svelte';
	import { findUploadProperties } from '$lib/findUploadProperties';

	interface RenderedData {
		[key: string]: unknown;
		error?: boolean;
	}

	export let receiptInformation: string;
	export let schema: AssetSchema;
	export let showAllFiles = false;
	let fileUploadProperties: string[] = [];
	let currentRenderedData: RenderedData = {};
	let isSchemaPropsLoaded = false;

	// eslint-disable-next-line  @typescript-eslint/no-unused-expressions
	$: receiptInformation && getReceiptData();
	// eslint-disable-next-line  @typescript-eslint/no-unused-expressions
	$: schema && getSchemaFileProps();

	async function getSchemaFileProps() {
		let assetClass: AssetSchema = schema;

		if (assetClass) {
			if (assetClass.schema && assetClass.schema.properties) {
				fileUploadProperties = await findUploadProperties(assetClass.schema.properties);
			}
		}
		isSchemaPropsLoaded = true;
	}

	async function getReceiptData() {
		let receiptInfos = receiptInformation;
		if (receiptInfos) {
			let information = receiptInfos;
			let cborDecodedInformation = cborDecode(information.slice(18));
			let structure = bytesToMeta(cborDecodedInformation[0].get(0), 'json');

			return (currentRenderedData = convertDotNotationToObject(structure));
		} else {
			return (currentRenderedData = { error: true });
		}
	}

	function toggleShowAllFiles() {
		showAllFiles = !showAllFiles;
	}
</script>

{#if isSchemaPropsLoaded && currentRenderedData && !currentRenderedData.error}
	<div data-testid="metadata-card" class="max-w-full p-5">
		<div class="mb-6 rounded-lg border border-white/10 bg-gray-800/90 shadow-lg">
			<div class="flex items-start p-4">
				<div class="mr-2 mt-1 text-blue-400">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div>
					<h4 class="text-lg font-bold text-gray-100">
						Receipt Metadata: {schema?.displayName}
					</h4>
					<p class="mt-1 text-base text-gray-300">
						The receipt metadata for the token, which is stored on IPFS and pinned on the metaboard
						contract.
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-white/10 bg-gray-900/80 p-4 shadow-md">
			<div class="mb-4 flex flex-row justify-between">
				<h3 class="text-xl font-semibold text-gray-100" data-testid="metadata-name">
					{schema?.displayName} Properties
				</h3>
				{#if fileUploadProperties.length > 0}
					<Button
						color="blue"
						data-testid="toggle-show-files"
						class="w-40"
						on:click={toggleShowAllFiles}
					>
						{showAllFiles ? 'Hide Files' : 'Show Files'}
					</Button>
				{/if}
			</div>

			<div class="mt-2">
				<RecursiveRenderer data={currentRenderedData} {fileUploadProperties} bind:showAllFiles />
			</div>
		</div>
	</div>
{:else if currentRenderedData.error}
	<div class="rounded-lg border border-red-500/30 bg-red-900/80 p-4 shadow-md">
		<div class="flex items-start">
			<div class="mr-2 mt-1 text-red-400">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
						clip-rule="evenodd"
					></path>
				</svg>
			</div>
			<p data-testId="no-metadata" class="text-red-300">No Metadata Found</p>
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center p-4">
		<div class="text-gray-300">
			<svg
				class="mr-3 h-8 w-8 animate-spin text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<span class="font-semibold">Loading Metadata...</span>
		</div>
	</div>
{/if}
