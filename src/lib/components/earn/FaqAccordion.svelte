<script lang="ts">
	// FAQ accordion — single open item at a time, first open by default.
	import { EARN_FAQ } from '$lib/config/earn';
	import EarnIcon from './EarnIcon.svelte';

	let open = 0;

	function toggle(i: number): void {
		open = open === i ? -1 : i;
	}
</script>

<div class="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-overlay-1">
	{#each EARN_FAQ as f, i (i)}
		<div>
			<button
				on:click={() => toggle(i)}
				class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
			>
				<span class="text-sm font-medium text-text">{f.q}</span>
				<EarnIcon name={open === i ? 'minus' : 'plus'} className="h-4 w-4 shrink-0 text-text-2" />
			</button>
			{#if open === i}
				<p class="px-5 pb-4 text-sm leading-relaxed text-text-2">{f.a}</p>
			{/if}
		</div>
	{/each}
</div>
