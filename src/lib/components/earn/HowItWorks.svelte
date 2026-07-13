<script lang="ts">
	// Four-step "how Save & Earn works" — deposit → earn → compound → redeem.
	import { HOW_IT_WORKS } from '$lib/config/earn';
	import EarnIcon from './EarnIcon.svelte';
</script>

<section class="mx-auto max-w-5xl px-6 py-8">
	<h2 class="mb-6 text-center text-xl font-semibold text-text">How Save &amp; Earn works</h2>
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each HOW_IT_WORKS as s, i (s.n)}
			<div class="relative rounded-xl border border-line bg-overlay-1 p-5">
				<div
					class="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 text-sm font-bold text-accent"
				>
					{s.n}
				</div>
				<div class="text-sm font-semibold text-text">{s.t}</div>
				<p class="mt-1.5 text-[13px] leading-relaxed text-text-2">{s.d}</p>
				{#if i < HOW_IT_WORKS.length - 1}
					<EarnIcon
						name="arrowRight"
						className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-white/15 lg:block"
					/>
				{/if}
			</div>
		{/each}
	</div>
</section>
