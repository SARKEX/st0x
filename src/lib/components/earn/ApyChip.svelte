<script lang="ts">
	// The recurring "Save & Earn" signature — a live APY pill. Defaults to the
	// documented SGOV yield.
	import { SGOV_APY } from '$lib/config/earn';

	export let value: number = SGOV_APY;
	export let size: 'sm' | 'lg' = 'sm';
	export let live = true;

	$: big = size === 'lg';
</script>

<span
	class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 font-semibold text-accent {big
		? 'px-3 py-1 text-sm'
		: 'px-2 py-0.5 text-[11px]'}"
>
	{#if live}
		<span class="relative flex h-1.5 w-1.5">
			<span
				class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"
			></span>
			<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
		</span>
	{/if}
	{parseFloat(value.toFixed(2))}% APY
</span>
