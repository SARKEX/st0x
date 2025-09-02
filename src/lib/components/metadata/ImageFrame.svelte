<script lang="ts">
	import { createLoadObserver } from '$lib/createLoadObserver';
	export let loaded: boolean = false;

	const onload = createLoadObserver(() => {
		loaded = true;
	});

	export let src;
</script>

<img
	use:onload
	class="z-50 h-64 w-64"
	class:hidden={!loaded}
	{src}
	alt="IPFS File"
	data-testid="ipfs-image"
/>
{#if !loaded}
	<p>Loading image from IPFS. If you recently pinned the file, this may take a few minutes.</p>
{/if}

