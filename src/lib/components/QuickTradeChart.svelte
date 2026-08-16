<script lang="ts">
	// Ambient price chart for the QuickTrade card — a clean single-line area chart
	// of real on-platform price history for the selected token, with light token /
	// price / change overlays (mirrors the design's LivePriceChart). Falls back to a
	// subtle decorative wave when the token has little or no recent trade history, so
	// the panel never renders an empty or broken state.
	import { browser } from '$app/environment';
	import { currentNetwork } from '$lib/stores';
	import type { CategorizedToken } from '$lib/config/network';
	import { getTokensByNetwork } from '$lib/config/tokens';
	import { createTokenTradeActivityQuery } from '$lib/queries/tradeActivity';
	import { apiTradesToHistoryPoints } from '$lib/utils/ohlc';

	export let token: CategorizedToken | undefined;
	// Best live quote price, used as the headline number when the token has no
	// recent trades of its own (e.g. the featured wtSGOV).
	export let fallbackPrice: number | null = null;

	const W = 320;
	const H = 240;
	// Cap to the most recent points so the line stays smooth and reads as "recent".
	const MAX_POINTS = 80;
	// Floor on the y-axis range (fraction of price). Autoscaling is great for real
	// movers, but a near-flat asset (e.g. wtSGOV, which moves well under 1% over a
	// week) should not zoom into a microscopic, unlabelled scale that makes 1c of
	// bid/ask bounce look volatile. We hold the axis to at least this span and centre
	// the data in it, so anything calmer than MIN_RANGE_PCT reads as flat.
	const MIN_RANGE_PCT = 0.06;

	// Deterministic, restrained market silhouette for the no-history fallback
	// (no Math.random, so SSR and client render identically). Keep the movement
	// modest: the old overlapping sine waves stretched into oversized peaks and
	// read as broken chart geometry.
	const FALLBACK_SERIES = [
		100, 100.4, 100.8, 100.5, 101.1, 101.6, 101.4, 102, 102.5, 102.2, 102.8, 103.1, 102.9, 103.5,
		104, 103.7, 104.3, 104.8, 104.6, 105.1, 105.5, 105.2, 105.8, 106.3, 106, 106.6, 107, 106.8,
		107.4, 107.8, 107.5, 108
	];

	$: paymentToken = $currentNetwork?.defaultPaymentToken ?? null;

	// Market count is derived from the live token config rather than hardcoded — the
	// programme is not equities-only (it holds ETFs, commodity trusts and a closed-end
	// fund), so the label says "markets" and the number tracks what is actually listed.
	$: marketCount = $currentNetwork ? getTokensByNetwork($currentNetwork.chainId).length : 0;
	$: tradeQuery = createTokenTradeActivityQuery($currentNetwork, token?.address ?? null);

	$: assetAddresses = (() => {
		const set = new Set<string>();
		if (token?.address) set.add(token.address.toLowerCase());
		if (token?.unwrappedAddress) set.add(token.unwrappedAddress.toLowerCase());
		if (token?.legacyAddress) set.add(token.legacyAddress.toLowerCase());
		return set;
	})();

	$: historyPoints =
		browser && paymentToken?.address
			? apiTradesToHistoryPoints(
					$tradeQuery.data?.trades ?? [],
					assetAddresses,
					paymentToken.address
				)
			: [];

	// Window-centred reducer used by both filters below (clamps at the edges).
	function windowed(
		values: number[],
		window: number,
		reduce: (slice: number[]) => number
	): number[] {
		if (values.length <= window) return values;
		const half = Math.floor(window / 2);
		return values.map((_, i) => {
			const lo = Math.max(0, i - half);
			const hi = Math.min(values.length, i + half + 1);
			return reduce(values.slice(lo, hi));
		});
	}

	// Median filter, then a light mean pass. Illiquid assets like wtSGOV trade in a
	// bid/ask sawtooth (alternating high/low prints) that a mean filter only blurs but
	// can't remove — it leaves the line looking volatile. A median collapses each pair
	// of alternating prints to the central value, killing the sawtooth while preserving
	// any genuine trend; the mean pass then softens the corners.
	function denoise(values: number[]): number[] {
		const median = windowed(values, 5, (s) => {
			const sorted = [...s].sort((a, b) => a - b);
			return sorted[Math.floor(sorted.length / 2)];
		});
		return windowed(median, 3, (s) => s.reduce((sum, v) => sum + v, 0) / s.length);
	}

	$: recentPrices = historyPoints.map((p) => p.price).slice(-MAX_POINTS);
	$: hasRealData = recentPrices.length >= 2;
	$: series = hasRealData ? denoise(recentPrices) : FALLBACK_SERIES;

	// Headline stays the true latest trade; the change badge is read off the de-noised
	// series so a near-flat asset doesn't report a double-digit swing from bounce alone.
	$: latestPrice = hasRealData ? recentPrices[recentPrices.length - 1] : fallbackPrice;
	$: changePct =
		hasRealData && series.length >= 2
			? ((series[series.length - 1] - series[0]) / series[0]) * 100
			: null;
	$: up = (changePct ?? 0) >= 0;

	$: paths = (() => {
		const min = Math.min(...series);
		const max = Math.max(...series);
		const mid = (min + max) / 2;
		const dataSpan = max - min;
		// Autoscale to the real range, but never below MIN_RANGE_PCT of price — so a
		// flat asset stays flat instead of magnifying noise. The decorative fallback
		// has no price scale, so it just uses its own span at full amplitude.
		const floorSpan = mid > 0 ? mid * MIN_RANGE_PCT : dataSpan;
		const span = hasRealData ? Math.max(dataSpan, floorSpan) : dataSpan;
		const base = mid - span / 2;
		const top = H * (hasRealData ? 0.22 : 0.36);
		const band = H * (hasRealData ? 0.56 : 0.24);
		const xy = series.map((v, i) => {
			const x = series.length > 1 ? (i / (series.length - 1)) * W : 0;
			const norm = span ? (v - base) / span : 0.5;
			const y = top + (1 - norm) * band;
			return [x, y] as const;
		});
		const line = xy
			.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`)
			.join(' ');
		return { line, area: `${line} L${W},${H} L0,${H} Z` };
	})();

	function fmtPrice(n: number): string {
		if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
		if (n >= 1) return n.toFixed(2);
		return n.toFixed(4);
	}
</script>

<div class="relative h-full w-full overflow-hidden">
	<svg
		class="absolute inset-0 h-full w-full"
		viewBox={`0 0 ${W} ${H}`}
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<defs>
			<linearGradient id="qtchart" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#2de3a6" stop-opacity={hasRealData ? 0.22 : 0.06} />
				<stop offset="100%" stop-color="#2de3a6" stop-opacity="0" />
			</linearGradient>
		</defs>
		<path d={paths.area} fill="url(#qtchart)" />
		<path
			d={paths.line}
			class:qt-draw={!hasRealData}
			pathLength="1"
			fill="none"
			stroke="#2de3a6"
			stroke-opacity={hasRealData ? 1 : 0.5}
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
	</svg>

	{#if token}
		<div class="absolute left-5 top-5 flex max-w-[55%] items-center gap-2.5">
			<img src={token.logoUrl} alt={token.symbol} class="h-7 w-7 shrink-0 rounded-full" />
			<div class="min-w-0">
				<div class="text-sm font-semibold leading-none text-text">{token.symbol}</div>
				<div class="mt-1 truncate text-[11px] text-text-2">{token.name}</div>
			</div>
		</div>
	{/if}

	{#if latestPrice != null}
		<div class="absolute right-5 top-5 text-right">
			<div class="font-mono text-lg font-semibold leading-none text-text">
				${fmtPrice(latestPrice)}
			</div>
			{#if changePct != null}
				<div
					class="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold {up
						? 'bg-emerald-400/15 text-accent'
						: 'bg-red-400/15 text-red-300'}"
				>
					{up ? '▲' : '▼'}
					{Math.abs(changePct).toFixed(2)}%
				</div>
			{/if}
		</div>
	{/if}

	<div class="absolute bottom-4 left-5 flex items-center gap-1.5 text-[11px] text-text-3">
		<span class="relative flex h-1.5 w-1.5">
			<span
				class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"
			></span>
			<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
		</span>
		{hasRealData
			? 'Live on-chain price'
			: `Live market · ${marketCount} market${marketCount === 1 ? '' : 's'}`}
	</div>
</div>

<style>
	/* Placeholder line repeatedly "draws" itself left→right so the no-history
	   chart obviously reads as a live placeholder rather than static flat data. */
	.qt-draw {
		stroke-dasharray: 1;
		animation: qt-draw 2.8s ease-in-out infinite;
	}
	@keyframes qt-draw {
		0% {
			stroke-dashoffset: 1;
			opacity: 0.25;
		}
		55% {
			stroke-dashoffset: 0;
			opacity: 0.65;
		}
		100% {
			stroke-dashoffset: 0;
			opacity: 0.25;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.qt-draw {
			animation: none;
		}
		.qt-draw {
			stroke-dasharray: none;
		}
	}
</style>
