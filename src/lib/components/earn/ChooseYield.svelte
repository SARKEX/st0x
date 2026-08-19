<script lang="ts">
	// "Choose your yield" — tSGOV (dividends) vs wtSGOV (auto-compound), same SGOV
	// backing.
	import { TWO_TOKEN } from '$lib/config/earn';
	import { SGOV_UNWRAPPED_ADDRESS } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import { goto } from '$app/navigation';
	import EarnIcon from './EarnIcon.svelte';
	import TokenDisc from './TokenDisc.svelte';

	function chooseYield(mode: 'dividends' | 'compound'): void {
		if (mode === 'compound') {
			openSaveEarn({ mode: 'deposit' });
			return;
		}
		goto(`/trade/${SGOV_UNWRAPPED_ADDRESS}`);
	}
</script>

<div class="rounded-2xl border border-line bg-overlay-1 p-6 sm:p-8">
	<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-lg font-semibold text-text">Two tokens, one underlying</h3>
		<span class="text-xs text-text-3">Switch freely · unwrap anytime</span>
	</div>
	<p class="mb-5 max-w-xl text-sm text-text-2">
		Same SGOV backing, your choice of how the yield reaches you.
	</p>
	<div class="grid gap-4 md:grid-cols-2">
		{#each TWO_TOKEN as t (t.sym)}
			<div
				class="relative flex flex-col rounded-xl border p-5 {t.recommended
					? 'border-emerald-400/30 bg-emerald-400/[0.05]'
					: 'border-line bg-overlay-1'}"
			>
				{#if t.recommended}
					<span
						class="absolute right-4 top-4 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent"
						>For saving</span
					>
				{/if}
				<div class="flex items-center gap-2.5">
					<TokenDisc token={t.token} size={36} ring={t.recommended} />
					<div>
						<div class="font-semibold text-text">{t.sym}</div>
						<div class="text-[11px] font-medium uppercase tracking-wide text-accent">
							{t.tag}
						</div>
					</div>
				</div>
				<p class="mt-3 flex-1 text-[13px] leading-relaxed text-text-2">{t.desc}</p>
				<div class="mt-3 flex items-center gap-1.5 text-[11px] text-text-3">
					<EarnIcon name="check" className="h-3.5 w-3.5 text-accent" />Best for: {t.best}
				</div>
				<button
					on:click={() => chooseYield(t.mode)}
					class="mt-4 rounded-lg py-2 text-sm font-semibold {t.recommended
						? 'bg-emerald-500 text-[#05241a] hover:bg-emerald-400'
						: 'border border-line-strong text-text-2 hover:bg-overlay-hover'}"
				>
					{t.mode === 'compound' ? 'Save & compound' : 'Get monthly dividends'}
				</button>
			</div>
		{/each}
	</div>
</div>
