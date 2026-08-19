<script lang="ts">
	// Interactive "what could your dollars earn" calculator — amount input +
	// slider + presets, with the projected yearly figure counting up.
	import { SGOV_APY, formatApy } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';
	import CountUp from './CountUp.svelte';

	const presets: number[] = [1000, 10000, 50000, 250000];

	let amt = 10000;

	$: yr = amt * (SGOV_APY / 100);
	$: mo = yr / 12;
	$: day = yr / 365;

	function fmt(n: number): string {
		return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function handleAmountInput(e: Event): void {
		const target = e.target as HTMLInputElement;
		const n = parseInt(target.value.replace(/[^0-9]/g, '')) || 0;
		amt = Math.min(1000000, n);
	}

	function handleSlider(e: Event): void {
		const target = e.target as HTMLInputElement;
		amt = parseInt(target.value);
	}

	function startEarning(): void {
		openSaveEarn();
	}
</script>

<div class="rounded-2xl border border-line bg-overlay-1 p-6 sm:p-8">
	<div class="grid gap-8 md:grid-cols-2">
		<div>
			<h3 class="text-lg font-semibold text-text">See what your dollars could earn</h3>
			<p class="mt-1 text-sm text-text-2">Move the slider or type an amount.</p>

			<div class="mt-6 rounded-xl border border-line bg-overlay-strong px-4 py-3">
				<div class="flex items-center justify-between text-xs text-text-2">
					<span>Amount to save</span><span>USDC</span>
				</div>
				<div class="mt-1 flex items-center gap-2">
					<span class="text-2xl font-bold text-text-3">$</span>
					<input
						type="text"
						inputmode="numeric"
						value={amt.toLocaleString('en-US')}
						on:input={handleAmountInput}
						aria-label="Amount to save in USDC"
						class="w-full bg-transparent text-2xl font-bold text-text outline-none"
					/>
				</div>
			</div>

			<input
				type="range"
				min="0"
				max="250000"
				step="1000"
				value={Math.min(amt, 250000)}
				on:input={handleSlider}
				aria-label="Amount to save slider"
				class="mt-4 w-full accent-emerald-400"
			/>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each presets as p (p)}
					<button
						on:click={() => (amt = p)}
						class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {amt === p
							? 'border-emerald-400/50 bg-emerald-400/15 text-accent'
							: 'border-line text-text-2 hover:bg-overlay-hover'}"
					>
						${p >= 1000 ? `${p / 1000}k` : p}
					</button>
				{/each}
			</div>
		</div>

		<div
			class="flex flex-col justify-center rounded-xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] to-transparent p-6"
		>
			<div class="text-xs font-medium uppercase tracking-wider text-accent">
				Projected earnings · Year 1
			</div>
			<div class="mt-1 flex items-end gap-2">
				<CountUp value={yr} className="text-4xl font-bold text-accent" />
				<span class="mb-1 text-sm text-text-2">/ year</span>
			</div>
			<div class="mt-5 grid grid-cols-3 gap-3 text-center">
				<div class="rounded-lg bg-overlay-2 py-2.5">
					<div class="font-mono text-sm font-semibold text-text">${fmt(mo)}</div>
					<div class="mt-0.5 text-[10px] uppercase tracking-wide text-text-3">Per month</div>
				</div>
				<div class="rounded-lg bg-overlay-2 py-2.5">
					<div class="font-mono text-sm font-semibold text-text">${fmt(day)}</div>
					<div class="mt-0.5 text-[10px] uppercase tracking-wide text-text-3">Per day</div>
				</div>
				<div class="rounded-lg bg-overlay-2 py-2.5">
					<div class="font-mono text-sm font-semibold text-text">{formatApy()}%</div>
					<div class="mt-0.5 text-[10px] uppercase tracking-wide text-text-3">Yield</div>
				</div>
			</div>
			<button
				on:click={startEarning}
				class="mt-5 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"
			>
				Start earning <EarnIcon name="arrowRight" className="h-4 w-4" />
			</button>
			<p class="mt-2 text-center text-[11px] text-text-3">
				Illustrative at {formatApy()}% yield. Compounds monthly in wtSGOV.
			</p>
		</div>
	</div>
</div>
