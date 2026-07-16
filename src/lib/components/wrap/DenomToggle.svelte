<script lang="ts">
	/**
	 * Segmented control for switching tables/depth/price display between
	 * shares (the t* asset, matches the chart) and tokens (the wt* wrapper,
	 * matches the wallet balance).
	 *
	 * `value` is the canonical denomination string used throughout the page:
	 *  - 'unwrapped' → shares (the t* asset)
	 *  - 'wrapped'   → tokens (the wt* wrapper)
	 *
	 * These match the new query param accepted by /v1/trades/* and /v1/orders/*
	 * (renamed from tstock/wtstock).
	 */
	import { createEventDispatcher } from 'svelte';

	export let value: 'unwrapped' | 'wrapped';
	export let assetSymbol: string;
	export let wrappedSymbol: string;
	/** When false, hides the "Show as" prefix label (e.g. inline-per-table mode). */
	export let showPrefix = true;
	export let ariaLabel: string = 'Show amounts as shares or wrapped tokens';

	const dispatch = createEventDispatcher<{ change: 'unwrapped' | 'wrapped' }>();

	function set(next: 'unwrapped' | 'wrapped') {
		if (next === value) return;
		value = next;
		dispatch('change', next);
	}
</script>

<div class="inline-flex items-center gap-2">
	{#if showPrefix}
		<span class="hidden text-[11px] uppercase tracking-wide text-text-3 sm:inline">Show as</span>
	{/if}
	<div
		role="tablist"
		aria-label={ariaLabel}
		class="inline-flex items-center rounded-lg border border-line bg-surface-2 p-0.5 text-xs"
	>
		<button
			type="button"
			role="tab"
			aria-selected={value === 'unwrapped'}
			on:click={() => set('unwrapped')}
			class={'rounded-md px-2.5 py-1 font-medium transition ' +
				(value === 'unwrapped'
					? 'bg-yellow-400/15 text-accent ring-1 ring-yellow-400/30'
					: 'text-text-2 hover:text-text-2')}
		>
			Shares ({assetSymbol})
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={value === 'wrapped'}
			on:click={() => set('wrapped')}
			class={'rounded-md px-2.5 py-1 font-medium transition ' +
				(value === 'wrapped'
					? 'bg-yellow-400/15 text-accent ring-1 ring-yellow-400/30'
					: 'text-text-2 hover:text-text-2')}
		>
			Tokens ({wrappedSymbol})
		</button>
	</div>
</div>
