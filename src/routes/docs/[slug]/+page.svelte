<script lang="ts">
	import type { PageData } from './$types';
	import { fade } from 'svelte/transition';
	export let data: PageData;
</script>

{#key data}
	<div data-testid="body" in:fade={{ duration: 300 }} class="p-4 md:p-8">
		<h1 data-testid="title" class="mb-6 text-4xl font-bold text-white">
			{data.frontmatter.title}
		</h1>
		<div
			class="prose prose-invert max-w-full rounded-2xl border border-white/10 bg-gray-800/50 p-4 backdrop-blur-sm prose-headings:text-white prose-p:text-gray-300 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-strong:text-white sm:p-6"
		>
			<svelte:component this={data.component} />
		</div>
	</div>
{/key}

<style>
	:global(.prose h2:first-child) {
		margin-top: 0;
	}
</style>
