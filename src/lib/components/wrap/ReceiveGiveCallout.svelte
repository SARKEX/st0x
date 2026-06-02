<script lang="ts">
	/**
	 * Yellow "Your wallet will receive/spend X wtCOIN" callout — the headline
	 * clarity moment of the trade panel. Always shows the wt* count (what the
	 * user will actually see in their wallet), with the share equivalent below.
	 *
	 * `side` is the user's action; `wrappedAmount` is the count of wt* tokens
	 * involved (received on buy, spent on sell). `sharesAmount` and `totalUsd`
	 * are pulled through for the secondary line.
	 */
	export let side: 'Buy' | 'Sell';
	export let wrappedAmount: number;
	export let sharesAmount: number;
	export let totalUsd: number;
	export let ratio: number;
	export let wrappedSymbol: string;
	export let assetSymbol: string;

	$: empty = !sharesAmount || !Number.isFinite(sharesAmount);
	$: ratioLabel = Number.isInteger(ratio)
		? String(ratio)
		: ratio.toLocaleString('en-US', { maximumFractionDigits: 4 });

	function fmtNum(n: number, maxFraction = 4): string {
		if (!Number.isFinite(n)) return '—';
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: maxFraction
		}).format(n);
	}
	function fmtUsd(n: number): string {
		if (!Number.isFinite(n)) return '—';
		return (
			'$' +
			new Intl.NumberFormat('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(n)
		);
	}
</script>

<div
	class="rounded-lg px-3.5 py-3"
	style="background: linear-gradient(180deg, rgba(250,204,21,0.06), rgba(250,204,21,0.02)); border: 1px solid rgba(250,204,21,0.18);"
>
	<p class="text-[10px] uppercase tracking-[0.14em] text-yellow-200/80">
		{side === 'Buy' ? 'Your wallet will receive' : 'Your wallet will spend'}
	</p>
	<div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
		<span class="font-mono text-2xl font-semibold tabular-nums text-white">
			{empty ? '—' : fmtNum(wrappedAmount, 4)}
		</span>
		<span class="text-sm text-yellow-200">{wrappedSymbol}</span>
	</div>
	<p class="mt-1 text-[11.5px] text-gray-400">
		{#if empty}
			1 {wrappedSymbol} bundles {ratioLabel}
			{assetSymbol} shares — you'll see the {wrappedSymbol} count in your wallet, not the share count.
		{:else}
			= <span class="font-mono tabular-nums text-gray-200">{fmtNum(sharesAmount, 4)}</span>
			{assetSymbol} shares ·
			<span class="font-mono tabular-nums text-gray-200">{fmtUsd(totalUsd)}</span>
		{/if}
	</p>
</div>
