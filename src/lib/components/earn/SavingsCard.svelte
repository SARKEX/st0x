<script lang="ts">
	// Portfolio "Savings" card — makes SGOV feel like an account that's actively
	// working, not just another holding. Prop-driven so the dashboard can wire in
	// real balances. Ported from the React prototype (Portfolio.jsx SavingsCard).
	import { SGOV_APY, SGOV_SERIES, formatApy } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';
	import TokenDisc from './TokenDisc.svelte';
	import Sparkline from './Sparkline.svelte';
	import CountUp from './CountUp.svelte';
	import ApyChip from './ApyChip.svelte';

	export let balance: number;
	export let earnedToDate: number;
	export let navSeries: number[] = SGOV_SERIES;

	function fmt(n: number): string {
		return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	$: monthly = (balance * SGOV_APY) / 100 / 12;
</script>

<div
	class="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.08] via-surface-1 to-surface-1 p-6 dark:from-emerald-500/[0.10] dark:via-[#0a1410] dark:to-[#070b12]"
>
	<div
		class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"
	></div>
	<div class="relative grid gap-6 md:grid-cols-[1.3fr_1fr]">
		<div>
			<div class="flex items-center gap-2.5">
				<TokenDisc token="wtsgov" size={40} ring />
				<div>
					<div class="flex items-center gap-2">
						<span class="font-semibold text-text">Savings</span><ApyChip />
					</div>
					<div class="text-xs text-text-2">wtSGOV · auto-compounding</div>
				</div>
			</div>
			<div class="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
				<div>
					<div class="text-[11px] uppercase tracking-wider text-text-3">Balance</div>
					<div class="font-mono text-3xl font-bold text-text">${fmt(balance)}</div>
				</div>
				<div>
					<div class="text-[11px] uppercase tracking-wider text-text-3">Earned to date</div>
					<CountUp
						value={earnedToDate}
						live
						className="block font-mono text-3xl font-bold text-accent"
					/>
				</div>
			</div>
			<div class="mt-5 flex gap-2.5">
				<button
					on:click={() => openSaveEarn({ mode: 'deposit' })}
					class="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"
				>
					<EarnIcon name="plus" className="h-4 w-4" />Add
				</button>
				<button
					on:click={() => openSaveEarn({ mode: 'withdraw' })}
					class="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface-2"
				>
					<EarnIcon name="minus" className="h-4 w-4" />Withdraw
				</button>
			</div>
		</div>
		<div class="flex flex-col justify-between rounded-xl border border-line bg-surface-2 p-4">
			<div class="flex items-center justify-between text-xs text-text-2">
				<span>NAV · last 12 months</span><span class="font-mono text-accent">+{formatApy()}%</span>
			</div>
			<Sparkline data={navSeries} w={260} h={60} />
			<div class="mt-2 flex items-center justify-between text-[11px] text-text-3">
				<span class="flex items-center gap-1"
					><EarnIcon name="clock" className="h-3 w-3" />Yield compounds monthly</span
				>
				<span>≈ ${fmt(monthly)}/mo</span>
			</div>
		</div>
	</div>
</div>
