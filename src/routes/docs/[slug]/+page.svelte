<script lang="ts">
	import type { PageData } from './$types';
	import { fade } from 'svelte/transition';
	export let data: PageData;
</script>

{#key data}
	<div data-testid="body" in:fade={{ duration: 300 }}>
		<h1
			data-testid="title"
			class="mb-6 text-4xl font-extrabold tracking-tight text-white drop-shadow-lg"
		>
			<span class="bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
				{data.frontmatter.title}
			</span>
			<div class="mt-2 h-1 w-24 rounded bg-gradient-to-r from-yellow-400 via-blue-400 to-purple-500"></div>
		</h1>
		<div class="rounded-2xl border border-white/10 bg-gray-800/70 w-full max-w-6xl mx-auto p-4 md:p-4 xl:p-6 shadow-xl backdrop-blur-md prose prose-invert">
			<svelte:component this={data.component} />
		</div>
	</div>
{/key}