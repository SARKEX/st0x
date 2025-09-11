<script lang="ts">
	import ExternalLinkIcon from '$lib/components/icons/IconExternalLink.svelte';

	export let href: string;
	export let label: string;
	export let className: string = '';
	export let truncate: { start: number; end: number } | null = null;
	$: text =
		truncate && label ? `${label.slice(0, truncate.start)}...${label.slice(-truncate.end)}` : label;
</script>

<a {href} target="_blank" rel="noopener noreferrer" class={'flex items-center gap-1 ' + className}>
	<span>{text}</span>
	<ExternalLinkIcon class="h-3 w-3" ariaLabel="External link" />
</a>
