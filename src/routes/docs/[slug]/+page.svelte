<script lang="ts">
	import type { PageData } from './$types';
	import { fade } from 'svelte/transition';
	export let data: PageData;
</script>

{#key data}
	<div data-testid="body" in:fade={{ duration: 300 }}>
		<h1 data-testid="title" class="text-3xl">{data.frontmatter.title}</h1>
		<svelte:component this={data.component} />
	</div>
{/key}