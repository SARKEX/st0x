<script lang="ts">
	// Subtle nudge prompting the user to move idle USDC into Savings. The `banner`
	// variant is ported from the Portfolio.jsx idle-USDC nudge; `subtle` is a more
	// compact single-line version with the same action. Renders nothing when there
	// is no idle USDC to move.
	import { SGOV_APY } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';

	export let usdcAmount: number;
	export let variant: 'subtle' | 'banner' = 'banner';

	function fmt(n: number): string {
		return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	$: yearly = (usdcAmount * SGOV_APY) / 100;

	function move(): void {
		openSaveEarn({ mode: 'deposit', prefillUsdc: usdcAmount });
	}
</script>

{#if usdcAmount > 0}
	{#if variant === 'banner'}
		<div
			class="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2.5 text-[13px] text-accent"
		>
			<EarnIcon name="info" className="h-4 w-4 shrink-0 text-accent" />
			Your <span class="font-semibold">${fmt(usdcAmount)} USDC</span> is idle. It could be earning
			~${fmt(yearly)}/yr as Savings.
			<button
				on:click={move}
				class="ml-auto shrink-0 font-semibold text-accent underline-offset-2 hover:underline"
				>Move to Savings →</button
			>
		</div>
	{:else}
		<div
			class="flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-1.5 text-[12px] text-accent"
		>
			<EarnIcon name="info" className="h-3.5 w-3.5 shrink-0 text-accent" />
			<span class="font-semibold">${fmt(usdcAmount)} USDC</span> idle · earn ~${fmt(yearly)}/yr
			<button
				on:click={move}
				class="ml-auto shrink-0 font-semibold text-accent underline-offset-2 hover:underline"
				>Move →</button
			>
		</div>
	{/if}
{/if}
