<script lang="ts">
	/**
	 * Yellow "1 wtCOIN = N tCOIN" chip + "What's this?" button. Used in the
	 * trade page token header. Hidden when the ratio is 1 (parity wrappers
	 * don't need the chip).
	 */
	export let ratio: number;
	export let wrappedSymbol: string;
	export let assetSymbol: string;
	export let onLearnMore: (() => void) | undefined = undefined;

	$: showChip = Number.isFinite(ratio) && ratio !== 1;
	$: ratioLabel = Number.isInteger(ratio)
		? String(ratio)
		: ratio.toLocaleString('en-US', { maximumFractionDigits: 4 });
</script>

{#if showChip}
	<div class="flex items-center gap-2" data-testid="wrap-ratio-chip">
		<span
			class="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2 py-0.5 text-[11px] leading-tight text-yellow-200"
			title="Wrap ratio"
		>
			<span class="font-mono tabular-nums">1 {wrappedSymbol}</span>
			<span class="text-yellow-300/70">=</span>
			<span class="font-mono tabular-nums">{ratioLabel} {assetSymbol}</span>
		</span>
		{#if onLearnMore}
			<button
				type="button"
				on:click={onLearnMore}
				data-testid="wrap-explainer-trigger"
				class="inline-flex items-center gap-1 text-[11px] text-gray-400 transition hover:text-yellow-200 sm:text-xs"
			>
				<svg
					viewBox="0 0 24 24"
					width="12"
					height="12"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="9" />
					<path
						d="M9.5 9.2a2.5 2.5 0 1 1 3.6 2.27c-.7.32-1.1.74-1.1 1.53V14"
						stroke-linecap="round"
					/>
					<circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
				</svg>
				What's this?
			</button>
		{/if}
	</div>
{/if}
