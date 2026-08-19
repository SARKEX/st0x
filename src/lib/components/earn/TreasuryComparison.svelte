<script lang="ts">
	// The moat: every meaningful tokenised Treasury requires KYC. Except SGOV.
	import { TREASURY_COMPARE } from '$lib/config/earn';
	import EarnIcon from './EarnIcon.svelte';
	import TokenDisc from './TokenDisc.svelte';
</script>

<div class="overflow-hidden rounded-2xl border border-line bg-overlay-1">
	<div class="border-b border-line px-6 py-5">
		<h3 class="text-lg font-semibold text-text">
			Every tokenised Treasury needs permission. <span class="text-accent">Except one.</span>
		</h3>
		<p class="mt-1 text-sm text-text-2">
			Same Treasury yield everyone else offers — without the KYC gate, the minimums, or the
			whitelist.
		</p>
	</div>
	<div
		class="grid grid-cols-[1fr_auto] gap-2 px-6 py-2.5 text-[10px] font-medium uppercase tracking-wider text-text-3 sm:grid-cols-[0.8fr_1fr_auto]"
	>
		<span>Product</span><span class="hidden sm:block">Who can hold it</span><span class="text-right"
			>Permissionless</span
		>
	</div>
	<div class="divide-y divide-line">
		{#each TREASURY_COMPARE as r (r.name)}
			<div
				class="grid grid-cols-[1fr_auto] items-center gap-2 px-6 py-3.5 sm:grid-cols-[0.8fr_1fr_auto] {r.highlight
					? 'bg-emerald-400/[0.06]'
					: ''}"
			>
				<div class="flex items-center gap-3">
					{#if r.highlight}
						<TokenDisc token="wtsgov" size={32} ring />
					{:else}
						<span
							class="flex h-8 w-8 items-center justify-center rounded-full bg-overlay-2 text-[11px] font-bold text-text-3"
							>{r.name[0]}</span
						>
					{/if}
					<div>
						<div class="text-sm font-semibold {r.highlight ? 'text-accent' : 'text-text'}">
							{r.name}
						</div>
						<div class="text-[11px] text-text-3">{r.issuer}</div>
					</div>
				</div>
				<div
					class="hidden text-[13px] sm:block {r.highlight
						? 'font-medium text-accent'
						: 'text-text-2'}"
				>
					{r.access}
				</div>
				<div class="flex justify-end">
					{#if r.ok}
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/15 text-accent"
						>
							<EarnIcon name="check" className="h-4 w-4" stroke={2.4} />
						</span>
					{:else}
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-400/80"
						>
							<EarnIcon name="close" className="h-3.5 w-3.5" stroke={2.4} />
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<div class="border-t border-line bg-white/[0.015] px-6 py-3.5 text-[13px] text-text-2">
		<span class="font-medium text-accent">Why it matters:</span> permissionless means your SGOV works
		in any wallet and any DeFi protocol — as collateral, in pools, anywhere — the moment you hold it.
	</div>
</div>
