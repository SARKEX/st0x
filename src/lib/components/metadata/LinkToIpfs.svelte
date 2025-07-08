<script lang="ts">
	import { IPFS_GATEWAY } from '$lib/consts';
	import { ArrowUpRightFromSquareOutline } from 'flowbite-svelte-icons';
	export let cid: string;
	let href: string = IPFS_GATEWAY + cid;
</script>

<span class="flex cursor-pointer flex-row items-center">
	<a
		data-testid="link-to-ipfs"
		{href}
		target="_blank"
		rel="noopener noreferrer"
		class="flex flex-row items-center hover:opacity-80"
	>
		<p>View file on public IPFS Gateway</p>
		<ArrowUpRightFromSquareOutline class="ms-1.5 inline cursor-pointer self-center  text-red-500" />
	</a>
</span>
