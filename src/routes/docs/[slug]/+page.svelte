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
		<h1 data-testid="title" class="mb-6 text-4xl font-bold text-white">
			{data.heading}
		</h1>
		<div
			class="prose prose-invert max-w-full rounded-2xl border border-white/10 bg-gray-800/50 p-4 backdrop-blur-sm prose-headings:text-white prose-p:text-gray-300 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-strong:text-white sm:p-6"
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
