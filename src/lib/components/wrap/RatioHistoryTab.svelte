<script lang="ts">
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import IconExternalLink from '$lib/components/icons/IconExternalLink.svelte';
	import { createExchangeRateHistoryQuery } from '$lib/queries/exchangeRates';
	import RatioStepChart from './RatioStepChart.svelte';

	/**
	 * "Ratio History" tab inside Token Details. Off the critical buy/sell path —
	 * this is a deep-dive surface that proves the ratio is auditable: every
	 * change has an on-chain event with a tx link.
	 *
	 * Snapshots show the rate at a block; donations are the events that move it
	 * (issuer rebases, in-kind distributions, etc.).
	 */
	export let wrappedTokenAddress: string;
	export let wrappedSymbol: string;
	export let assetSymbol: string;
	export let currentRatio: number;
	export let onLearnMore: (() => void) | undefined = undefined;
	/** Optional explorer href builder for tx hashes (chain-specific). */
	export let txHrefBuilder: ((txHash: string) => string) | undefined = undefined;

	$: query = createExchangeRateHistoryQuery(wrappedTokenAddress, { pageSize: 100 });

	// Snapshots are bookkeeping points the indexer writes whenever it samples
	// the vault — they don't change the ratio, just record it, so they're noise
	// in the user-facing timeline. We keep only the events that actually moved
	// the ratio (donations / issuer rebases) plus a synthetic "deployed at 1:1"
	// anchor so the list always shows where the wrapper started.
	$: rawEvents = $query.data?.events ?? [];
	$: events = rawEvents.filter((e) => e.type === 'donation');
	// Reverse for the list display (most-recent first) without mutating the
	// ascending order the chart needs.
	$: eventsDesc = [...events].reverse();

	function fmtRatio(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return Number.isInteger(v)
			? String(v)
			: v.toLocaleString('en-US', { maximumFractionDigits: 4 });
	}

	function ratioOfEvent(ev: (typeof events)[number]): number | null {
		const v = ev.newAssetsPerShare == null ? NaN : Number(ev.newAssetsPerShare);
		return Number.isFinite(v) ? v : null;
	}

	function fmtFullDate(sec: number): string {
		const d = new Date(sec * 1000);
		return d.toISOString().slice(0, 10);
	}

	function relativeFromSec(sec: number): string {
		const now = Date.now();
		const ms = sec * 1000;
		const days = Math.max(0, Math.floor((now - ms) / 86_400_000));
		if (days < 1) return 'today';
		if (days < 30) return `${days}d ago`;
		if (days < 365) return `${Math.round(days / 30)}mo ago`;
		return `${(days / 365).toFixed(1)}y ago`;
	}

	function truncTx(hash: string): string {
		if (!hash || hash.length < 12) return hash;
		return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
	}
</script>

<div>
	<div class="mb-3 flex flex-wrap items-end justify-between gap-2">
		<div>
			<h3 class="font-semibold text-white">Wrap Ratio History</h3>
			<p class="mt-0.5 text-xs text-gray-400 sm:text-sm">
				Starts at <span class="font-mono">1 : 1</span>. Each rebase below adds more {assetSymbol} per
				{wrappedSymbol} — usually a dividend or split from the underlying.
				{#if onLearnMore}
					<button
						type="button"
						on:click={onLearnMore}
						class="ml-1 text-blue-300 hover:text-blue-200 hover:underline"
					>
						Learn more
					</button>
				{/if}
			</p>
		</div>
		<span
			class="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-yellow-200"
		>
			Currently 1 : {fmtRatio(currentRatio)}
		</span>
	</div>

	{#if $query.isPending}
		<div class="flex items-center justify-center py-10">
			<LoadingSpinner size="md" text="Loading ratio history..." />
		</div>
	{:else if $query.isError}
		<div class="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-3 text-sm text-red-300">
			Failed to load ratio history.
			{#if $query.error instanceof Error}
				<span class="ml-1 text-red-200/80">({$query.error.message})</span>
			{/if}
		</div>
	{:else if events.length === 0}
		<RatioStepChart events={[]} {wrappedSymbol} {assetSymbol} />
		<div
			class="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-gray-400"
		>
			No rebases yet — the wrap ratio has been 1 : 1 since deployment.
		</div>
	{:else}
		<RatioStepChart {events} {wrappedSymbol} {assetSymbol} />

		<h4 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Events</h4>
		<ol class="relative space-y-0">
			{#each eventsDesc as ev, idx (ev.blockNumber)}
				{@const isLatest = idx === 0}
				{@const newRate = ratioOfEvent(ev)}
				{@const prev = eventsDesc[idx + 1] != null ? ratioOfEvent(eventsDesc[idx + 1]) : 1}
				<li class="relative pl-6 pr-1">
					<span
						class="absolute bottom-[-4px] left-[7px] top-5 w-px bg-white/10"
						aria-hidden="true"
					/>
					<span
						class={'absolute left-0 top-2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ' +
							(isLatest ? 'border-yellow-400/60 bg-yellow-400/20' : 'border-white/15 bg-white/5')}
						aria-hidden="true"
					>
						<span
							class={'h-1.5 w-1.5 rounded-full ' + (isLatest ? 'bg-yellow-300' : 'bg-gray-400')}
						/>
					</span>

					<div class="border-b border-white/5 py-3">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
							<div class="flex items-baseline gap-2">
								<span class="text-sm font-medium text-gray-100">Rebase</span>
								{#if isLatest}
									<span
										class="inline-flex items-center rounded-full border border-yellow-400/35 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-yellow-200"
									>
										current
									</span>
								{/if}
							</div>
							<div class="flex items-baseline gap-2 text-[11px] text-gray-500">
								<span>{fmtFullDate(ev.blockTimestamp)}</span>
								<span class="text-gray-600">·</span>
								<span>{relativeFromSec(ev.blockTimestamp)}</span>
							</div>
						</div>

						<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
							<span class="font-mono tabular-nums text-gray-300">
								1 : <b class="text-gray-100">{fmtRatio(newRate)}</b>
							</span>
							{#if prev != null && newRate != null && prev !== newRate}
								{@const pct = ((newRate - prev) / prev) * 100}
								{@const direction = pct >= 0 ? 'up' : 'down'}
								<span
									class={'inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ' +
										(direction === 'up'
											? 'border-green-400/30 bg-green-400/10 text-green-300'
											: 'border-red-400/30 bg-red-400/10 text-red-300')}
								>
									{direction === 'up' ? '+' : ''}{pct.toFixed(2)}%
								</span>
							{/if}
							{#if ev.type === 'donation'}
								{#if txHrefBuilder}
									<a
										href={txHrefBuilder(ev.txHash)}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 font-mono text-[11px] text-blue-300 hover:text-blue-200 hover:underline"
									>
										{truncTx(ev.txHash)}
										<IconExternalLink width="10" height="10" />
									</a>
								{:else}
									<span class="font-mono text-[11px] text-gray-500">{truncTx(ev.txHash)}</span>
								{/if}
							{/if}
						</div>
						{#if ev.type === 'donation'}
							<p class="mt-1.5 text-xs leading-relaxed text-gray-400">
								+<span class="font-mono tabular-nums text-gray-300">{ev.assetAmount}</span>
								{assetSymbol} added to the vault.
							</p>
						{/if}
					</div>
				</li>
			{/each}

			<!-- Synthetic parity anchor — the wrapper starts 1:1 by construction; we
			     show it as the oldest item so the timeline doesn't begin in the air. -->
			<li class="relative pl-6 pr-1">
				<span
					class="absolute left-0 top-2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/15 bg-white/5"
					aria-hidden="true"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-gray-500" />
				</span>
				<div class="border-b border-white/5 py-3">
					<span class="text-sm font-medium text-gray-100">Deployed</span>
					<div class="mt-1 font-mono text-xs tabular-nums text-gray-300">1 : <b>1</b></div>
				</div>
			</li>
		</ol>
	{/if}
</div>
