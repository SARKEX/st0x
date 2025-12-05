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

<div class="api-docs-wrapper">
	<div class="api-docs-container" bind:this={container}></div>
</div>

<style>
	/* Wrapper resets Tailwind's base styles */
	.api-docs-wrapper {
		all: initial;
		display: block;
		position: relative;
		min-height: 100vh;
		background: #0f0f0f;
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		isolation: isolate;
		overflow-x: hidden;
	}

	.api-docs-wrapper *,
	.api-docs-wrapper *::before,
	.api-docs-wrapper *::after {
		box-sizing: border-box;
	}

	.api-docs-container {
		min-height: 100vh;
	}

	/* Ensure Scalar styles take precedence */
	:global(.api-docs-wrapper .scalar-app) {
		min-height: 100vh;
	}

	:global(.api-docs-wrapper img) {
		max-width: 100%;
		height: auto;
	}

	:global(.api-docs-wrapper a) {
		color: inherit;
		text-decoration: inherit;
	}

	:global(.api-docs-wrapper button) {
		cursor: pointer;
	}
</style>
