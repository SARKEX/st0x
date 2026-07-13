<script lang="ts">
	// Closing CTA band — "put your USDC to work".
	import { formatApy } from '$lib/config/earn';
	import { openSaveEarn } from '$lib/stores/saveEarnStore';
	import EarnIcon from './EarnIcon.svelte';

	function startEarning(): void {
		openSaveEarn();
	}
</script>

<section class="mx-auto max-w-5xl px-6 py-10">
	<div
		class="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.12] to-bg p-8 text-center"
	>
		<div
			class="pointer-events-none absolute left-1/2 top-0 h-40 w-[480px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl"
		></div>
		<div class="relative">
			<h2 class="text-2xl font-bold text-text">Your USDC is on a coffee break.</h2>
			<p class="mx-auto mt-2 max-w-md text-[15px] text-text-2">
				Put it to work in 30 seconds. Earn {formatApy()}%, no KYC, redeem whenever.
			</p>
			<button
				on:click={startEarning}
				class="mt-6 inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-7 py-3 text-sm font-semibold text-[#05241a] hover:bg-emerald-400"
			>
				Start earning {formatApy()}% <EarnIcon name="arrowRight" className="h-4 w-4" />
			</button>
		</div>
	</div>
</section>
