<script lang="ts">
	// Earn hero — headline copy + APY display panel (sparkline, hero stats) and a
	// trust strip below. CTAs open the Save & Earn modal / anchor to comparison.
	import { SGOV_SERIES, formatApy } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';
	import TokenDisc from './TokenDisc.svelte';
	import ApyChip from './ApyChip.svelte';
	import Sparkline from './Sparkline.svelte';

	const heroStats: [string, string][] = [
		['$85B', 'BlackRock AUM'],
		['<10s', 'Redeem · 24/7'],
		['No KYC', 'Permissionless']
	];

	function startEarning(): void {
		openSaveEarn();
	}
</script>

<section class="mx-auto max-w-5xl px-6 pb-4 pt-12">
	<div class="grid items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
		<div>
			<div class="mb-4 flex items-center gap-2">
				<span
					class="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
					>New</span
				>
				<span class="text-xs font-medium uppercase tracking-[0.2em] text-accent"
					>Save &amp; Earn</span
				>
			</div>
			<h1 class="text-[32px] font-bold leading-[1.06] tracking-tight text-text sm:text-[40px]">
				Earn <span class="text-accent">{formatApy()}%</span> on your idle dollars.
			</h1>
			<p class="mt-2.5 text-base font-semibold text-accent sm:text-lg">
				Treasury-backed. No KYC. Redeem anytime.
			</p>
			<p class="mt-4 max-w-md text-[15px] leading-relaxed text-text-2">
				Turn idle USDC into <span class="font-semibold text-text">SGOV</span> — BlackRock’s US
				Treasury bill ETF, tokenised and live on Base. The only one you can hold in
				<span class="font-semibold text-accent">any wallet</span>, then redeem to real shares in
				under 10 seconds.
			</p>
			<div class="mt-6 flex flex-wrap items-center gap-3">
				<button
					on:click={startEarning}
					class="group flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-[#05241a] transition hover:bg-emerald-400"
				>
					Start earning {formatApy()}%
					<EarnIcon
						name="arrowRight"
						className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
					/>
				</button>
				<a
					href="#earn-compare"
					class="rounded-lg border border-line-strong px-5 py-3 text-sm font-medium text-text-2 hover:bg-overlay-hover"
					>Why SGOV</a
				>
			</div>
		</div>

		<!-- APY display panel -->
		<div
			class="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] to-bg p-7"
		>
			<div
				class="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl"
			></div>
			<div class="relative">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2.5">
						<TokenDisc token="wtsgov" size={42} ring />
						<div>
							<div class="font-semibold text-text">wtSGOV</div>
							<div class="text-xs text-text-2">Auto-compounding</div>
						</div>
					</div>
					<ApyChip size="lg" />
				</div>
				<div class="my-5"><Sparkline data={SGOV_SERIES} w={300} h={64} /></div>
				<div class="grid grid-cols-3 gap-2 text-center">
					{#each heroStats as [v, k] (k)}
						<div class="rounded-lg bg-overlay-strong py-2.5">
							<div class="text-[13px] font-semibold text-text">{v}</div>
							<div class="text-[10px] uppercase tracking-wide text-text-3">{k}</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>
