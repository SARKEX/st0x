<script lang="ts">
	// Four value pillars — permissionless, redeemable Treasuries, auto-compounding,
	// backed 1:1 onchain.
	import { PILLARS } from '$lib/config/earn';
	import EarnIcon from './EarnIcon.svelte';
</script>

<section class="mx-auto max-w-5xl px-6 py-8">
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each PILLARS as p (p.title)}
			<div class="rounded-xl border border-line bg-overlay-1 p-5">
				<div
					class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 text-accent"
				>
					<EarnIcon name={p.icon} className="h-5 w-5" />
				</div>
				<div class="text-sm font-semibold text-text">{p.title}</div>
				<p class="mt-1.5 text-[13px] leading-relaxed text-text-2">{p.body}</p>
			</div>
		{/each}
	</div>
</section>
