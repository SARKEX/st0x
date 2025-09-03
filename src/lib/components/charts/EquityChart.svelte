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

	function parseSeries(data: unknown): { time: string | number; value: number }[] {
		if (!data || typeof data !== 'object') return [];
		// Check for both daily and intraday time series
		const dataObj = data as Record<string, unknown>;
		const isIntraday = !!(
			dataObj['Time Series (30min)'] ||
			dataObj['Time Series (60min)'] ||
			dataObj['Time Series (15min)'] ||
			dataObj['Time Series (5min)']
		);

		const ts = (dataObj['Time Series (Daily)'] ||
			dataObj['Time Series (30min)'] ||
			dataObj['Time Series (60min)'] ||
			dataObj['Time Series (15min)'] ||
			dataObj['Time Series (5min)']) as Record<string, Record<string, string>> | undefined;
		if (!ts) return [];

		const points: { time: string | number; value: number }[] = [];
		const allDates = Object.keys(ts);

		// For intraday, get only the most recent trading day's data
		if (isIntraday && allDates.length > 0) {
			// Find the most recent date
			const sortedDates = allDates.sort((a, b) => b.localeCompare(a));
			const mostRecentDate = sortedDates[0].split(' ')[0];

			// Filter to only include data from the most recent trading day
			for (const [dateStr, ohlc] of Object.entries(ts)) {
				if (!dateStr.startsWith(mostRecentDate)) continue;

				const close = parseFloat((ohlc as Record<string, string>)['4. close']) || 0;
				if (!isFinite(close)) continue;

				// Convert to Unix timestamp (seconds)
				const time = Math.floor(new Date(dateStr).getTime() / 1000);
				points.push({ time, value: close });
			}
		} else {
			// For daily data or if we want all data
			for (const [dateStr, ohlc] of Object.entries(ts)) {
				const close = parseFloat((ohlc as Record<string, string>)['4. close']) || 0;
				if (!isFinite(close)) continue;

				// For daily data, keep as yyyy-mm-dd string
				const time = isIntraday
					? Math.floor(new Date(dateStr).getTime() / 1000)
					: dateStr.split(' ')[0];

				points.push({ time, value: close });
			}
			// Only show last 30 days for daily data
			if (!isIntraday && points.length > 30) {
				points.splice(0, points.length - 30);
			}
		}

		points.sort((a, b) => {
			if (typeof a.time === 'number' && typeof b.time === 'number') {
				return a.time - b.time;
			}
			return a.time < b.time ? -1 : 1;
		});
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
			rightPriceScale: {
				borderColor: 'rgba(255,255,255,0.15)',
				autoScale: true,
				scaleMargins: {
					top: 0.1,
					bottom: 0.1
				}
			},
			timeScale: {
				borderColor: 'rgba(255,255,255,0.15)',
				timeVisible: true,
				secondsVisible: false,
				tickMarkFormatter: (time: number | string) => {
					// For intraday (timestamp), show time
					if (typeof time === 'number') {
						const date = new Date(time * 1000);
						const month = date.toLocaleDateString('en', { month: 'short' });
						const day = date.getDate();
						const hours = date.getHours().toString().padStart(2, '0');
						const mins = date.getMinutes().toString().padStart(2, '0');
						// Show date for day boundaries, time otherwise
						if (hours === '00' && mins === '00') {
							return `${month} ${day}`;
						}
						return `${hours}:${mins}`;
					}
					// For daily data (date string), show date
					const date = new Date(time);
					const month = date.toLocaleDateString('en', { month: 'short' });
					const day = date.getDate();
					return `${month} ${day}`;
				},
				rightOffset: 5,
				barSpacing: 10,
				minBarSpacing: 3,
				fixLeftEdge: true,
				fixRightEdge: true
			},
			width: containerEl.clientWidth || 600,
			height
		});
		series = chart.addAreaSeries({
			lineColor: '#F3B13C',
			topColor: 'rgba(243,177,60,0.35)',
			bottomColor: 'rgba(243,177,60,0.05)',
			priceFormat: {
				type: 'price',
				precision: 2,
				minMove: 0.01
			}
		});
		const initial = parseSeries(timeseriesData);
		if (initial.length && series) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			series.setData(initial as any);
			// Fit content to show all data without extra space
			chart.timeScale().fitContent();
		}
		window.addEventListener('resize', resize);
	});

	$: if (series && chart) {
		const next = parseSeries(timeseriesData);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		series.setData(next as any);
		// Fit content to avoid empty space
		if (next.length > 0) {
			chart.timeScale().fitContent();
		}
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
