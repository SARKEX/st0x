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

	$: t0 = pts.length ? pts[0].ev.blockTimestamp * 1000 : Date.now();
	$: t1 = Date.now();
	$: maxRate = pts.length ? Math.max(...pts.map((p) => p.rate)) : 1;
	// Floor at 1.2× so a 1:1 chart isn't collapsed
	$: yMax = Math.max(maxRate * 1.2, maxRate + 0.5);

	function tx(timestampMs: number): number {
		const span = Math.max(1, t1 - t0);
		return padL + ((timestampMs - t0) / span) * innerW;
	}
	function ty(v: number): number {
		return padT + innerH - (v / yMax) * innerH;
	}

	$: stepPath = (() => {
		if (!pts.length) return '';
		// Pre-genesis: imply parity at the first y. Build step segments at each
		// event x (horizontal at previous y, then vertical jump to new y).
		let d = `M ${padL.toFixed(1)} ${ty(pts[0].rate).toFixed(1)}`;
		let prevY = ty(pts[0].rate);
		for (let i = 0; i < pts.length; i++) {
			const x = tx(pts[i].ev.blockTimestamp * 1000);
			const y = ty(pts[i].rate);
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
		const ticks: number[] = [];
		const span = Math.max(1, yMax);
		const ideal = 4;
		const step = niceStep(span / ideal);
		for (let v = 0; v <= yMax + 1e-9; v += step) {
			ticks.push(Number(v.toFixed(4)));
			if (ticks.length > 8) break;
		}
		return ticks;
	})();

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
				y1={ty(v)}
				y2={ty(v)}
				stroke="rgba(255,255,255,0.06)"
				stroke-dasharray="2 3"
			/>
			<text
				x={padL - 6}
				y={ty(v) + 3}
				text-anchor="end"
				font-size="10"
				fill="rgba(156,163,175,0.7)"
				class="font-mono"
			>
				{v}×
			</text>
		{/each}

		{#if stepPath}
			<path d={stepPath} fill="none" stroke="#facc15" stroke-width="1.75" />
		{/if}

		{#each pts as p}
			<circle
				cx={tx(p.ev.blockTimestamp * 1000)}
				cy={ty(p.rate)}
				r="3.5"
				fill="#facc15"
				stroke="#0e1422"
				stroke-width="1.5"
			>
				<title>{`${fmtDateShort(p.ev.blockTimestamp)} — ${p.ev.type}: 1 : ${p.rate}`}</title>
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
