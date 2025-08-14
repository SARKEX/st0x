<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';

	// Raw AlphaVantage TIME_SERIES_DAILY_ADJUSTED response
	// or any object with a "Time Series (Daily)" map
	export let timeseriesData: unknown;
	export let height: number = 320;

	let containerEl: HTMLDivElement | null = null;
	let chart: IChartApi | null = null;
	let series: ISeriesApi<'Area'> | null = null;

	function parseSeries(data: unknown): { time: string; value: number }[] {
		if (!data || typeof data !== 'object') return [];
		const ts = (data as Record<string, unknown>)["Time Series (Daily)"] as
			| Record<string, Record<string, string>>
			| undefined;
		if (!ts) return [];
		const points: { time: string; value: number }[] = [];
		for (const [date, ohlc] of Object.entries(ts)) {
			const close = parseFloat((ohlc as Record<string, string>)["4. close"]) || 0;
			if (!isFinite(close)) continue;
			points.push({ time: date, value: close });
		}
		points.sort((a, b) => (a.time < b.time ? -1 : 1));
		return points;
	}

	function resize() {
		if (!chart || !containerEl) return;
		const width = containerEl.clientWidth || 600;
		chart.applyOptions({ width, height });
	}

	onMount(() => {
		if (!containerEl) return;
		chart = createChart(containerEl, {
			layout: {
				background: { color: 'transparent' },
				textColor: '#ddd'
			},
			grid: {
				vertLines: { color: 'rgba(255,255,255,0.06)' },
				horzLines: { color: 'rgba(255,255,255,0.06)' }
			},
			rightPriceScale: { borderColor: 'rgba(255,255,255,0.15)' },
			timeScale: { borderColor: 'rgba(255,255,255,0.15)' },
			width: containerEl.clientWidth || 600,
			height
		});
		series = chart.addAreaSeries({
			lineColor: '#F3B13C',
			topColor: 'rgba(243,177,60,0.35)',
			bottomColor: 'rgba(243,177,60,0.05)'
		});
		const initial = parseSeries(timeseriesData);
		if (initial.length && series) series.setData(initial);
		window.addEventListener('resize', resize);
	});

	$: if (series) {
		const next = parseSeries(timeseriesData);
		series.setData(next);
	}

	onDestroy(() => {
		window.removeEventListener('resize', resize);
		if (chart) {
			chart.remove();
			chart = null;
			series = null;
		}
	});
</script>

<div bind:this={containerEl} style="width: 100%; height: {height}px;"></div>