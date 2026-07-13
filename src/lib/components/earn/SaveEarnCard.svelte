<script lang="ts">
	// Marketing "Save & Earn" card for the home page — the green "Don't let your
	// dollars sit still" callout. Presentational only: a static "$10,000 · 1 year"
	// idle-vs-SGOV proof. Ported from the React prototype (Home.jsx SaveEarnCard).
	import { goto } from '$app/navigation';
	import { formatApy, SGOV_SERIES } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';
	import TokenDisc from './TokenDisc.svelte';
	import Sparkline from './Sparkline.svelte';
	import CountUp from './CountUp.svelte';

	export let className = '';
</script>

<div
	class="relative flex flex-col overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.08] via-surface-1 to-surface-1 p-5 sm:p-6 dark:from-emerald-500/[0.10] dark:via-[#0b1712] dark:to-[#0b0f17] {className}"
>
	<div
		class="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"
	></div>
	<div class="relative flex flex-col">
		<div class="mb-3 flex items-center gap-2">
			<span
				class="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
				>New</span
			>
			<span class="text-[11px] font-medium uppercase tracking-wider text-accent"
				>Save &amp; Earn · SGOV</span
			>
		</div>
		<div class="grid items-center gap-6 sm:grid-cols-[1.05fr_0.95fr]">
			<div>
				<h2 class="text-2xl font-bold leading-tight text-text">
					Don't let your dollars sit still.
				</h2>
				<p class="mt-3 text-[14px] leading-relaxed text-text-2">
					Idle USDC earns you <span class="font-semibold text-text">nothing</span>. Hold it as
					<span class="font-semibold text-accent">SGOV</span>
					instead and earn
					<span class="font-semibold text-accent">~{formatApy()}% a year</span>, backed 1:1 by
					BlackRock's Treasury ETF. No KYC — redeem anytime.
				</p>
				<div class="mt-5 flex flex-wrap items-center gap-2.5">
					<button
						data-testid="open-save-earn"
						on:click={() => openSaveEarn()}
						class="group flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-[#05241a] transition hover:bg-emerald-400"
					>
						Start earning {formatApy()}%
						<EarnIcon
							name="arrowRight"
							className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
						/>
					</button>
					<button
						on:click={() => goto('/earn')}
						class="rounded-xl border border-line-strong px-4 py-3 text-sm font-medium text-text-2 hover:bg-surface-2"
						>How it works</button
					>
				</div>
			</div>

			<!-- compact "idle vs SGOV" proof -->
			<div class="rounded-xl border border-line bg-surface-2 p-4">
				<div class="mb-3 flex items-center justify-between">
					<span class="text-[11px] font-medium uppercase tracking-wider text-text-2"
						>$10,000 · 1 year</span
					>
					<Sparkline data={SGOV_SERIES} w={72} h={24} />
				</div>
				<div class="flex items-center justify-between text-sm">
					<div class="flex items-center gap-2 text-text-2">
						<TokenDisc token="usdc" size={22} /> Idle USDC
					</div>
					<span class="font-mono text-text-2">+$0</span>
				</div>
				<div class="my-2.5 h-px bg-surface-3"></div>
				<div class="flex items-center justify-between text-sm">
					<div class="flex items-center gap-2 text-text">
						<TokenDisc token="wtsgov" size={22} ring /> SGOV
					</div>
					<CountUp
						value={353}
						prefix="+$"
						decimals={0}
						className="font-mono text-sm font-bold text-accent"
					/>
				</div>
				<p class="mt-3 text-center text-[11px] text-text-3">
					Same dollars. One earns, one doesn't.
				</p>
			</div>
		</div>
	</div>
</div>
