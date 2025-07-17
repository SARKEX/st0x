<script lang="ts">
	import type { PageData } from './$types';
	import { fade } from 'svelte/transition';
	export let data: PageData;
</script>

{#key data}
	<div data-testid="body" in:fade={{ duration: 300 }} class="p-4 md:p-8">
		<h1
			data-testid="title"
			class="mb-6 text-4xl font-bold text-white"
		>
			{data.frontmatter.title}
		</h1>
		<div
			class="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 prose prose-invert prose-headings:text-white prose-p:text-gray-300 prose-strong:text-white prose-a:text-blue-400 prose-a:hover:text-blue-300 max-w-full"
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
