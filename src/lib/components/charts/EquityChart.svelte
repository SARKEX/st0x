<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';

	// Raw AlphaVantage TIME_SERIES_DAILY_ADJUSTED response
	// or any object with a "Time Series (Daily)" map
	export let timeseriesData: unknown;
	// If provided, chart uses this fixed height; otherwise fills container height
	export let height: number | undefined = undefined;
	// When true, don't trim series; include all returned data
	export let fullRange: boolean = false;
	// When provided, show exactly the last `barCount` points
	export let barCount: number | undefined = undefined;
	// Align right edge to current time/market close by adding right offset
	export let alignToNow: boolean = false;
	// Accept interval as a string to avoid template casts in consumers
	export let interval: string | undefined = undefined;

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

		// For intraday, by default show only the most recent trading day unless fullRange or barCount
		if (isIntraday && allDates.length > 0 && !fullRange && !barCount) {
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
			// Only show last 30 days for daily data unless fullRange or barCount provided
			if (!isIntraday && !fullRange && !barCount && points.length > 30) {
				points.splice(0, points.length - 30);
			}
		}

		// If barCount specified and not aligning to now, trim to last N points
		if (barCount && !alignToNow && points.length > barCount) {
			points.splice(0, points.length - barCount);
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
		const chartHeight = height ?? (containerEl.clientHeight || 320);
		chart.applyOptions({ width, height: chartHeight });
	}

	function getStepSeconds(ivl: typeof interval): number {
		switch (ivl) {
			case '5min':
				return 5 * 60;
			case '15min':
				return 15 * 60;
			case '30min':
				return 30 * 60;
			case '60min':
				return 60 * 60;
			case 'daily':
				return 24 * 60 * 60;
			default:
				return 5 * 60;
		}
	}

	function computeDailyAnchorDate(): Date {
		// Approximate US market hours in ET (09:30 - 16:00). Ignore holidays.
		const now = new Date();
		// Convert to ET by guessing offset diff from UTC using Intl (approx only)
		const nowStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
		const nowET = new Date(nowStr);
		const day = nowET.getDay(); // 0 Sun ... 6 Sat
		const hour = nowET.getHours();
		const minute = nowET.getMinutes();
		const isWeekend = day === 0 || day === 6;

		// Helper to set time to 16:00 ET same day
		function setClose(d: Date) {
			const s = new Date(d);
			s.setHours(16, 0, 0, 0);
			return s;
		}
		// If weekend, roll back to Friday
		if (isWeekend) {
			const diff = day === 0 ? 2 : 1; // Sun->Fri (2), Sat->Fri (1)
			nowET.setDate(nowET.getDate() - diff);
			return setClose(nowET);
		}
		// Market open 09:30-16:00 ET
		const afterClose = hour > 16 || (hour === 16 && minute >= 0);
		const beforeOpen = hour < 9 || (hour === 9 && minute < 30);
		if (afterClose) return setClose(nowET);
		if (beforeOpen) {
			// Previous business day at close
			const prev = new Date(nowET);
			// If Monday before open, go to previous Friday
			const prevDiff = day === 1 ? 3 : 1;
			prev.setDate(prev.getDate() - prevDiff);
			return setClose(prev);
		}
		// During market hours, anchor to 'now'
		return nowET;
	}

	function computeMissingBars(points: { time: string | number }[]): number {
		if (!alignToNow || !interval || points.length === 0) return 0;
		const last = points[points.length - 1].time;
		let missingBars = 0;
		if (typeof last === 'number') {
			const step = getStepSeconds(interval);
			const nowSec = Math.floor(Date.now() / 1000);
			missingBars = Math.max(0, Math.ceil((nowSec - last) / step));
		} else {
			// Daily: compute bars between last date and anchor day (approx calendar days)
			const lastDate = new Date(last);
			const anchor = computeDailyAnchorDate();
			const diffMs = anchor.getTime() - lastDate.getTime();
			missingBars = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
		}
		return missingBars;
	}

	let ro: ResizeObserver | null = null;

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
			height: height ?? (containerEl.clientHeight || 320)
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
			if (barCount && alignToNow && interval) {
				const missing = computeMissingBars(initial);
				const lastIndex = initial.length - 1;
				const to = lastIndex + missing;
				const from = Math.max(0, lastIndex - (barCount - 1) - missing);
				chart.timeScale().setVisibleLogicalRange({ from, to });
			} else {
				// Default behavior
				chart.timeScale().fitContent();
			}
		}
		window.addEventListener('resize', resize);
		// Resize when the container itself changes size (e.g., modal size changes)
		if (window.ResizeObserver && containerEl) {
			ro = new ResizeObserver(() => resize());
			ro.observe(containerEl);
		}
	});

	$: if (series && chart) {
		const next = parseSeries(timeseriesData);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		series.setData(next as any);
		if (next.length > 0) {
			if (barCount && alignToNow && interval) {
				const missing = computeMissingBars(next);
				const lastIndex = next.length - 1;
				const to = lastIndex + missing;
				const from = Math.max(0, lastIndex - (barCount - 1) - missing);
				chart.timeScale().setVisibleLogicalRange({ from, to });
			} else {
				chart.timeScale().fitContent();
			}
		}
	}

	onDestroy(() => {
		window.removeEventListener('resize', resize);
		ro?.disconnect();
		if (chart) {
			chart.remove();
			chart = null;
			series = null;
		}
	});
</script>

<div
	bind:this={containerEl}
	style={`width: 100%; height: ${height ? height + 'px' : '100%'};`}
></div>
