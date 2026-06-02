<script lang="ts">
	import type { ExchangeRateEvent } from '$lib/queries/exchangeRates';

	/**
	 * Step chart of the wrap ratio (assetsPerShare) over time. Each input event
	 * is a snapshot or donation point; the line steps up/down at each event and
	 * extends flat to "now" at the right edge.
	 *
	 * Events are expected sorted ascending by blockTimestamp.
	 */
	export let events: ExchangeRateEvent[];
	export let wrappedSymbol: string;
	export let assetSymbol: string;

	function rateOf(ev: ExchangeRateEvent): number | null {
		if (ev.type === 'snapshot') {
			const v = Number(ev.assetsPerShare);
			return Number.isFinite(v) ? v : null;
		}
		const v = ev.newAssetsPerShare == null ? NaN : Number(ev.newAssetsPerShare);
		return Number.isFinite(v) ? v : null;
	}

	// Drop events with no readable rate (the API may return null on donations
	// it couldn't price; they'll self-heal on the next read).
	$: pts = events
		.map((e) => ({ ev: e, rate: rateOf(e) }))
		.filter((p): p is { ev: ExchangeRateEvent; rate: number } => p.rate != null);

	const w = 640;
	const h = 140;
	const padL = 36;
	const padR = 12;
	const padT = 14;
	const padB = 22;
	$: innerW = w - padL - padR;
	$: innerH = h - padT - padB;

	// The wrap ratio is bounded below by 1.0 (vault assets ≥ shares minted by
	// construction — issuer donations only add, never remove). Anchoring the
	// y-axis at 0 wastes 99% of the plot area on impossible values; the
	// previous fixed `0..yMax` axis made a 1 → 1.0027 step look flat. We
	// instead frame the axis tightly around the actual data with a small
	// headroom both ways, floored at 1.0.
	$: rates = pts.map((p) => p.rate);
	$: dataMin = rates.length ? Math.min(...rates, 1) : 1;
	$: dataMax = rates.length ? Math.max(...rates, 1) : 1;
	$: padding = Math.max((dataMax - dataMin) * 0.4, 0.005);
	$: yMin = Math.max(1 - padding * 0.25, 0); // tiny breathing room below 1
	$: yMax = dataMax + padding;

	$: t0 = pts.length ? pts[0].ev.blockTimestamp * 1000 : Date.now();
	$: t1 = Date.now();

	function tx(timestampMs: number): number {
		const span = Math.max(1, t1 - t0);
		return padL + ((timestampMs - t0) / span) * innerW;
	}
	function ty(v: number, yMinLocal: number, yMaxLocal: number): number {
		const span = Math.max(1e-9, yMaxLocal - yMinLocal);
		return padT + innerH - ((v - yMinLocal) / span) * innerH;
	}

	$: stepPath = (() => {
		if (!pts.length) return '';
		// Pre-genesis: imply parity at the first y. Build step segments at each
		// event x (horizontal at previous y, then vertical jump to new y).
		const startY = ty(pts[0].rate, yMin, yMax);
		let d = `M ${padL.toFixed(1)} ${startY.toFixed(1)}`;
		let prevY = startY;
		for (let i = 0; i < pts.length; i++) {
			const x = tx(pts[i].ev.blockTimestamp * 1000);
			const y = ty(pts[i].rate, yMin, yMax);
			d += ` L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
			prevY = y;
		}
		// Extend the last value to "now"
		d += ` L ${tx(t1).toFixed(1)} ${prevY.toFixed(1)}`;
		return d;
	})();

	function fmtDateShort(sec: number): string {
		const d = new Date(sec * 1000);
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	$: yTicks = (() => {
		// Always include the 1× anchor so the floor is unambiguous, then 2–3
		// evenly-spaced ticks above it covering the data range.
		const span = yMax - yMin;
		if (span <= 0) return [1];
		const step = niceStep(span / 3);
		const ticks: number[] = [];
		// Start at the lowest nice multiple of `step` that's ≥ yMin (but
		// guarantee 1 is in the set).
		const first = Math.ceil(yMin / step) * step;
		ticks.push(1);
		for (let v = first; v <= yMax + 1e-9; v += step) {
			const rounded = Number(v.toFixed(4));
			if (!ticks.includes(rounded)) ticks.push(rounded);
			if (ticks.length > 6) break;
		}
		return ticks.sort((a, b) => a - b);
	})();

	function fmtTick(v: number): string {
		// Compact enough to read; 4 fractional digits captures wtSGOV's 1.0027
		// without trailing zeros on round numbers.
		if (Number.isInteger(v)) return `${v}×`;
		return `${v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}×`;
	}

	function niceStep(rough: number): number {
		if (rough <= 0) return 1;
		const exp = Math.floor(Math.log10(rough));
		const base = Math.pow(10, exp);
		const frac = rough / base;
		let nice: number;
		if (frac < 1.5) nice = 1;
		else if (frac < 3) nice = 2;
		else if (frac < 7) nice = 5;
		else nice = 10;
		return nice * base;
	}
</script>

<div
	class="rounded-lg border border-white/10 p-2 sm:p-3"
	style="background: radial-gradient(60% 80% at 30% 30%, rgba(250,204,21,0.06), transparent 60%), linear-gradient(180deg, #0e1422 0%, #0a0f1c 100%);"
>
	<div class="mb-1 flex items-center justify-between px-1 text-[11px] text-gray-500">
		<span>Wrap ratio over time</span>
		<span class="font-mono tabular-nums">1 {wrappedSymbol} : N {assetSymbol}</span>
	</div>
	<svg
		viewBox={`0 0 ${w} ${h}`}
		class="h-32 w-full sm:h-36"
		preserveAspectRatio="none"
		role="img"
		aria-label="Wrap ratio step chart over time"
	>
		{#each yTicks as v}
			<line
				x1={padL}
				x2={w - padR}
				y1={ty(v, yMin, yMax)}
				y2={ty(v, yMin, yMax)}
				stroke={v === 1 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
				stroke-dasharray={v === 1 ? '0' : '2 3'}
			/>
			<text
				x={padL - 6}
				y={ty(v, yMin, yMax) + 3}
				text-anchor="end"
				font-size="10"
				fill={v === 1 ? 'rgba(229,231,235,0.85)' : 'rgba(156,163,175,0.7)'}
				class="font-mono"
			>
				{fmtTick(v)}
			</text>
		{/each}

		{#if stepPath}
			<path d={stepPath} fill="none" stroke="#facc15" stroke-width="1.75" />
		{/if}

		{#each pts as p}
			<circle
				cx={tx(p.ev.blockTimestamp * 1000)}
				cy={ty(p.rate, yMin, yMax)}
				r="3.5"
				fill="#facc15"
				stroke="#0e1422"
				stroke-width="1.5"
			>
				<title>{`${fmtDateShort(p.ev.blockTimestamp)} — 1 : ${p.rate}`}</title>
			</circle>
		{/each}

		<line
			x1={w - padR}
			x2={w - padR}
			y1={padT}
			y2={padT + innerH}
			stroke="rgba(255,255,255,0.15)"
			stroke-dasharray="2 2"
		/>
		<text x={w - padR - 2} y={padT + 9} text-anchor="end" font-size="9" fill="rgba(156,163,175,0.7)"
			>now</text
		>
		<line
			x1={padL}
			x2={w - padR}
			y1={padT + innerH}
			y2={padT + innerH}
			stroke="rgba(255,255,255,0.1)"
		/>

		{#each pts as p, i (p.ev.blockTimestamp + '-' + i)}
			{#if pts.length <= 4 || i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 4) === 0}
				<text
					x={tx(p.ev.blockTimestamp * 1000)}
					y={h - 6}
					text-anchor="middle"
					font-size="9"
					fill="rgba(156,163,175,0.65)"
				>
					{fmtDateShort(p.ev.blockTimestamp)}
				</text>
			{/if}
		{/each}
	</svg>
</div>
