<script lang="ts">
	import IpfsFileFrame from './IpfsFileFrame.svelte';

	export let showAllFiles: boolean;
	export let data: Record<string, unknown>;
	export let fileUploadProperties: string[] = [];
	export let depth: number = 0;

	$: console.log('data : ', data);

	// Type guard to check if a value is an object
	const isObject = (value: unknown): value is Record<string, unknown> =>
		value !== null && typeof value === 'object' && !Array.isArray(value);

	// Function to determine text color based on depth
	const textColor = (depth: number): string =>
		depth % 2 === 0 ? 'text-blue-500' : 'text-green-500';

	// Function to check if a property path matches any of the file upload properties
	const isFileUploadProperty = (currentPath: string): boolean => {
		return fileUploadProperties.some((path) => path.startsWith(currentPath));
	};

	// Function to check if a property path exactly matches any of the file upload properties
	const isExactFileUploadProperty = (currentPath: string): boolean => {
		return fileUploadProperties.includes(currentPath);
	};
</script>

{#if isObject(data)}
	<div class="ml-6 border-l-4 border-white/10 pl-6 bg-gray-900/70 rounded-lg shadow-sm py-2">
		{#each Object.keys(data) as key}
			<div class="my-4">
				<!-- Ensure consistent spacing -->
				{#if isFileUploadProperty(key)}
					<span data-testid={key} class="font-mono text-gray-300">{key}: </span>
					{#if isObject(data[key])}
						<svelte:self
							data={data[key]}
							depth={depth + 1}
							fileUploadProperties={fileUploadProperties.map((p) =>
								p.replace(new RegExp(`^${key}.`), '')
							)}
							bind:showAllFiles
						/>
					{:else if isExactFileUploadProperty(key)}
						<div class="flex flex-col gap-4">
							{#if typeof data[key] === 'string' && data[key]}
								<div data-testid={'ipfs-file-frame-container'}>
									<IpfsFileFrame cid={data[key]} bind:showAllFiles />
								</div>
							{:else if data[key]}
								<span class="text-sm text-red-400">Invalid CID format</span>
							{:else}
								<span class="text-sm text-red-400">No file uploaded</span>
							{/if}
						</div>
					{:else}
						<span class="text-gray-100">{typeof data[key] === 'string' || typeof data[key] === 'number' ? data[key] : JSON.stringify(data[key])}</span>
					{/if}
				{:else}
					<span data-testid={key} class="font-mono text-gray-300">{key}: </span>
					{#if isObject(data[key])}
						<svelte:self
							data={data[key]}
							depth={depth + 1}
							{fileUploadProperties}
							bind:showAllFiles
						/>
					{:else}
						<span class="text-gray-100">{typeof data[key] === 'string' || typeof data[key] === 'number' ? data[key] : JSON.stringify(data[key])}</span>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<span class="text-gray-100">{typeof data === 'string' || typeof data === 'number' ? data : JSON.stringify(data)}</span>
{/if}
