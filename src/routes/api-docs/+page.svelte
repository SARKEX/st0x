<script lang="ts">
	import { onMount } from 'svelte';

	let container: HTMLDivElement;

	onMount(async () => {
		// Dynamically import Scalar to avoid SSR issues
		const { createApiReference } = await import('@scalar/api-reference');

		createApiReference(container, {
			url: '/openapi.json',
			theme: 'kepler',
			hideModels: false,
			hideDownloadButton: false
		});
	});
</script>

<svelte:head>
	<title>API Documentation | st0x</title>
	<meta name="description" content="st0x Public API documentation for rewards, RocketBoost, and wallet data." />
</svelte:head>

<div class="api-docs-container" bind:this={container}></div>

<style>
	.api-docs-container {
		min-height: 100vh;
		background: #0f0f0f;
	}

	:global(.api-docs-container .scalar-app) {
		min-height: 100vh;
	}
</style>
