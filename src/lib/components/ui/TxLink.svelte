<script lang="ts">
	import ExternalLinkIcon from '$lib/components/icons/IconExternalLink.svelte';
	import { currentNetwork } from '$lib/stores';

	export let hash: string | undefined = undefined;
	export let href: string | undefined = undefined;
	export let label: string | undefined = undefined;
	export let head: number = 6;
	export let tail: number = 4;
	export let className: string =
		'flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
	export let dataTestId: string | undefined = undefined;

	function truncate(value: string, h = head, t = tail) {
		if (!value) return '';
		return value.length <= h + t ? value : `${value.slice(0, h)}...${value.slice(-t)}`;
	}

	$: url =
		href ?? (hash && $currentNetwork ? `${$currentNetwork.blockExplorer}/tx/${hash}` : undefined);
	$: fullValue = label ?? hash ?? '';
	$: desktopText = truncate(fullValue);
	$: mobileText = fullValue ? `…${fullValue.slice(-6)}` : '';
</script>

{#if url}
	<a
		href={url}
		target="_blank"
		rel="noopener noreferrer"
		class={className}
		data-testid={dataTestId}
	>
		<span class="sm:hidden">{mobileText}</span>
		<span class="hidden sm:inline">{desktopText}</span>
		<ExternalLinkIcon class="h-3 w-3" ariaLabel="External link" />
	</a>
{:else}
	<!-- No URL provided; render nothing to avoid broken link -->
{/if}
