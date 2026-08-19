<script lang="ts">
	// Brand-coloured token badge for Save & Earn surfaces — USDC (blue, "$") or
	// SGOV (emerald, bank glyph). Self-contained: no external image dependency.
	import EarnIcon from './EarnIcon.svelte';

	export let token: 'usdc' | 'tsgov' | 'wtsgov' = 'wtsgov';
	export let size = 36;
	export let ring = false;

	$: isUsdc = token === 'usdc';
	$: background = isUsdc
		? 'radial-gradient(circle at 30% 25%, #3b8ff0, #2775CA)'
		: 'radial-gradient(circle at 30% 25%, #34d399, #059669)';
	$: boxShadow = ring ? '0 0 0 3px rgba(16,185,129,.18)' : 'inset 0 1px 0 rgba(255,255,255,.25)';
</script>

<div
	class="relative flex shrink-0 items-center justify-center rounded-full font-bold text-text"
	style="width:{size}px;height:{size}px;font-size:{size *
		0.34}px;background:{background};box-shadow:{boxShadow};"
>
	{#if isUsdc}
		$
	{:else}
		<EarnIcon name="bank" className="h-1/2 w-1/2" stroke={1.8} />
	{/if}
</div>
