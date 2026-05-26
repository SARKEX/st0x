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

	$: events = $query.data?.events ?? [];
	// Reverse for the list display (most-recent first) without mutating the
	// ascending order the chart needs.
	$: eventsDesc = [...events].reverse();

	function fmtRatio(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return Number.isInteger(v) ? String(v) : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
	}

	function ratioOfEvent(ev: (typeof events)[number]): number | null {
		if (ev.type === 'snapshot') {
			const v = Number(ev.assetsPerShare);
			return Number.isFinite(v) ? v : null;
		}
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
				Every change to <span class="font-mono tabular-nums">1 {wrappedSymbol} : N {assetSymbol}</span>
				is triggered by an on-chain event. The ratio rebases when the underlying equity has a corporate
				action (split, special distribution, etc.) so the wrapped token stays economically whole.
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
			class="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2 py-0.5 text-[11px] font-mono tabular-nums text-yellow-200"
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
		<div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-gray-400">
			No ratio events recorded yet. The wrap ratio for this token has been stable since deployment.
		</div>
	{:else}
		<RatioStepChart {events} {wrappedSymbol} {assetSymbol} />

		<h4 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Events</h4>
		<ol class="relative space-y-0">
			{#each eventsDesc as ev, idx (ev.blockNumber + '-' + ev.type)}
				{@const isLatest = idx === 0}
				{@const newRate = ratioOfEvent(ev)}
				{@const prev = eventsDesc[idx + 1] ? ratioOfEvent(eventsDesc[idx + 1]) : null}
				<li class="relative pl-6 pr-1">
					{#if idx < eventsDesc.length - 1}
						<span
							class="absolute left-[7px] top-5 bottom-[-4px] w-px bg-white/10"
							aria-hidden="true"
						/>
					{/if}
					<span
						class={'absolute left-0 top-2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ' +
							(isLatest
								? 'border-yellow-400/60 bg-yellow-400/20'
								: 'border-white/15 bg-white/5')}
						aria-hidden="true"
					>
						<span class={'h-1.5 w-1.5 rounded-full ' + (isLatest ? 'bg-yellow-300' : 'bg-gray-400')}
						/>
					</span>

					<div class="border-b border-white/5 py-3">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
							<div class="flex items-baseline gap-2">
								<span class="text-sm font-medium capitalize text-gray-100">
									{ev.type === 'donation' ? 'Donation / rebase' : 'Snapshot'}
								</span>
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
								{#if prev != null && newRate != null}
									1 : {fmtRatio(prev)} → <b class="text-gray-100">1 : {fmtRatio(newRate)}</b>
								{:else}
									1 : <b class="text-gray-100">{fmtRatio(newRate)}</b>
								{/if}
							</span>
							{#if prev != null && newRate != null && prev !== newRate}
								{@const direction = newRate > prev ? 'up' : 'down'}
								<span
									class={'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-mono tabular-nums ' +
										(direction === 'up'
											? 'border-green-400/30 bg-green-400/10 text-green-300'
											: 'border-red-400/30 bg-red-400/10 text-red-300')}
								>
									{direction === 'up' ? '↑' : '↓'} ×{(newRate / prev).toFixed(2)}
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
								Issuer rebase — <span class="font-mono tabular-nums text-gray-300"
									>+{ev.assetAmount}</span
								>
								{assetSymbol} added to the vault by
								<span class="font-mono text-gray-300">{truncTx(ev.donor)}</span>.
								Each {wrappedSymbol} now unwraps to more {assetSymbol} shares.
							</p>
						{:else}
							<p class="mt-1.5 text-xs leading-relaxed text-gray-400">
								Recorded snapshot of the current wrap ratio at block {ev.blockNumber}.
							</p>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

		<div
			class="mt-4 rounded-lg border border-blue-500/22 bg-blue-500/[0.08] p-3 text-xs leading-relaxed text-blue-100/90"
		>
			<p class="font-medium text-blue-200">What does a ratio change mean for me?</p>
			<p class="mt-1 text-blue-100/80">
				Your <span class="font-mono tabular-nums">{wrappedSymbol}</span> balance doesn't move — but each
				wrapped token now redeems for a different number of {assetSymbol} shares. Unwrapping in the
				Dashboard always uses the <i>current</i> ratio. Past trades you executed at older ratios are
				unaffected; the History table can show those trades in either unit using the Shares/Tokens
				toggle.
			</p>
		</div>
	{/if}
</div>
