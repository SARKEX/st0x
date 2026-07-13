<script lang="ts">
	import type { PageData } from './$types';
	import type { ComponentType } from 'svelte';
	import { fade } from 'svelte/transition';
	import slugFromPath from '$lib/docs/slugFromPath';
	export let data: PageData;

	const docModules = import.meta.glob<{ default: ComponentType }>(
		'/src/docs/**/*.{md,svx,svelte.md}',
		{ eager: true }
	);
	$: docComponent = Object.entries(docModules).find(
		([path]) => slugFromPath(path) === data.slug
	)?.[1].default;
</script>

{#key data}
	<div data-testid="body" in:fade={{ duration: 300 }} class="p-4 md:p-8">
		<h1 data-testid="title" class="mb-6 text-4xl font-bold text-text">
			{data.heading}
		</h1>
		<div
			class="prose max-w-full rounded-2xl border border-line bg-surface-2 p-4 text-text-2 backdrop-blur-sm prose-headings:text-text prose-p:text-text-2 prose-a:text-blue-600 prose-a:hover:text-blue-700 prose-blockquote:text-text-2 prose-strong:text-text prose-code:text-text prose-li:text-text-2 sm:p-6 dark:prose-a:text-blue-400 dark:prose-a:hover:text-blue-300"
		>
			{#if docComponent}
				<svelte:component this={docComponent} />
			{/if}
		</div>
	</div>
{/key}

<style>
	:global(.prose h2:first-child) {
		margin-top: 0;
	}
</style>
