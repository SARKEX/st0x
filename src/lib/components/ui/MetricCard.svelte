<script lang="ts">
	import Card from './Card.svelte';
	export let label: string;
	export let value: string;
	export let change: string = '';
	// New customization props with sensible defaults
	export let valueClass: string = 'text-lg font-bold sm:text-xl lg:text-2xl';
	export let changeClass: string = 'text-xs font-medium text-yellow-500 sm:text-sm';
	export let icon: string | null = null; // allow custom icon character or null
	export let cardClass: string = '';
	export let showGradient: boolean | undefined = undefined;
	export let paddingClass: string | undefined = undefined;
</script>

<Card className={cardClass} {showGradient} paddingClass={paddingClass}>
	<div class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
	<div class="mb-2">
		<span class={"block " + valueClass}>{value}</span>
	</div>
	{#if change}
		<div class={"flex items-center gap-1 " + changeClass}>
			<span>{icon ?? '↗'}</span>
			<span class="truncate">{change}</span>
		</div>
	{/if}
</Card>