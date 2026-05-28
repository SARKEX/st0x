<script lang="ts">
	import IconExternalLink from '$lib/components/icons/IconExternalLink.svelte';

	/**
	 * Prominent "Wrap Ratio" card that sits at the top of the Contract tab.
	 * Shows the current ratio, an explainer trigger, and a "view history" link
	 * (which switches the tab to Ratio History). Only renders when the token
	 * is actually a non-parity wrapper.
	 */
	export let ratio: number;
	export let wrappedSymbol: string;
	export let assetSymbol: string;
	/** Optional — when present, renders a "Last changed Xd ago" footnote. */
	export let lastChangeTimestampSec: number | null = null;
	export let lastChangeLabel: string | null = null;
	export let dashboardHref: string = '/dashboard';
	export let onLearnMore: (() => void) | undefined = undefined;
	export let onViewHistory: (() => void) | undefined = undefined;

	$: ratioLabel = Number.isInteger(ratio)
		? String(ratio)
		: ratio.toLocaleString('en-US', { maximumFractionDigits: 4 });

	function relativeFromSec(sec: number): string {
		const now = Date.now();
		const ms = sec * 1000;
		const days = Math.max(0, Math.floor((now - ms) / 86_400_000));
		if (days < 1) return 'today';
		if (days < 30) return `${days}d ago`;
		if (days < 365) return `${Math.round(days / 30)}mo ago`;
		return `${(days / 365).toFixed(1)}y ago`;
	}

	$: lastChangedRelative =
		lastChangeTimestampSec != null ? relativeFromSec(lastChangeTimestampSec) : null;
</script>

<div class="mb-3 rounded-lg border border-yellow-400/25 bg-yellow-400/[0.05] p-3 sm:p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="text-[10px] uppercase tracking-wide text-yellow-300/80 sm:text-xs">Wrap Ratio</p>
			<p
				class="mt-1 font-mono text-base font-semibold tabular-nums text-gray-100 sm:text-lg"
			>
				1 {wrappedSymbol} = {ratioLabel} {assetSymbol}
			</p>
			<p class="mt-1 text-xs text-gray-400">
				Each {wrappedSymbol} bundles {ratioLabel} {assetSymbol} shares. Trades and prices on this
				page are shown <b>per share</b>.
			</p>
			{#if lastChangedRelative}
				<p class="mt-2 text-[11px] text-gray-500">
					Last changed {lastChangedRelative}{#if lastChangeLabel}
						· {lastChangeLabel}{/if}
					{#if onViewHistory}
						{' — '}
						<button
							type="button"
							on:click={onViewHistory}
							class="inline-flex items-center gap-0.5 text-blue-300 hover:text-blue-200 hover:underline"
						>
							view history
							<svg
								viewBox="0 0 24 24"
								width="10"
								height="10"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="inline"
								aria-hidden="true"
							>
								<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					{/if}
				</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if onLearnMore}
				<button
					type="button"
					on:click={onLearnMore}
					class="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 transition hover:border-yellow-300/40 hover:bg-yellow-400/10"
				>
					How it works
				</button>
			{/if}
			<a
				href={dashboardHref}
				class="rounded-md border border-yellow-400/40 bg-yellow-500/20 px-2.5 py-1.5 text-xs font-medium text-yellow-200 transition hover:bg-yellow-500/30"
			>
				Unwrap in Dashboard <IconExternalLink width="10" height="10" class="ml-1 inline" />
			</a>
		</div>
	</div>
</div>
