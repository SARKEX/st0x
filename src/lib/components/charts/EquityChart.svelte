<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		createChart,
		type IChartApi,
		type ISeriesApi,
		type MouseEventParams,
		type UTCTimestamp
	} from 'lightweight-charts';
	import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

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
	let wrapperEl: HTMLDivElement | null = null;
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

		// For intraday, by default show only the most recent trading session unless fullRange or barCount
		if (isIntraday && allDates.length > 0 && !fullRange && !barCount) {
			// Find the most recent timestamp
			const sortedDates = allDates.sort((a, b) => b.localeCompare(a));
			const mostRecentTimestamp = sortedDates[0];

			// Get current time in ET to check if we should show today's data
			const todayET = formatInTimeZone(new Date(), 'America/New_York', 'yyyy-MM-dd');

			// Get the date portion of the most recent data
			const mostRecentDateStr = mostRecentTimestamp.split(' ')[0];

			// Determine which session to show:
			// If we have today's data (even just pre-market), show today
			// Otherwise show the most recent day with data
			let sessionDate = mostRecentDateStr;

			// Check if we have any data from today
			const hasToday = sortedDates.some((d) => d.startsWith(todayET));
			if (hasToday) {
				sessionDate = todayET;
			}

			// Create session boundaries in ET
			// Pre-market starts at 4:00 AM ET, regular 9:30 AM ET, close 4:00 PM ET, after-hours ends 8:00 PM ET
			const preStartStr = `${sessionDate} 04:00:00`;
			const regOpenStr = `${sessionDate} 09:30:00`;
			const regCloseStr = `${sessionDate} 16:00:00`;
			const afterCloseStr = `${sessionDate} 20:00:00`;

			// Convert these ET times to UTC for comparison
			const sessionStartTime = fromZonedTime(preStartStr, 'America/New_York').getTime();
			const sessionEndTime = fromZonedTime(afterCloseStr, 'America/New_York').getTime();
			const regOpenTime = fromZonedTime(regOpenStr, 'America/New_York').getTime();
			const regCloseTime = fromZonedTime(regCloseStr, 'America/New_York').getTime();

			// Save for overlays and markers (seconds)
			sessionBounds = {
				preStart: Math.floor(sessionStartTime / 1000),
				regOpen: Math.floor(regOpenTime / 1000),
				regClose: Math.floor(regCloseTime / 1000),
				afterClose: Math.floor(sessionEndTime / 1000)
			};

			// Filter to only include data from the most recent trading session
			for (const [dateStr, ohlc] of Object.entries(ts)) {
				const timestamp = fromZonedTime(dateStr, 'America/New_York').getTime();

				// Include if within the trading session (4 AM to 8 PM ET)
				if (timestamp < sessionStartTime || timestamp > sessionEndTime) {
					continue;
				}

				const close = parseFloat((ohlc as Record<string, string>)['4. close']) || 0;
				if (!isFinite(close)) continue;

				// Convert to Unix timestamp (seconds)
				// AlphaVantage returns times in US/Eastern timezone
				// Use date-fns-tz to properly handle timezone conversion including DST
				const time = Math.floor(fromZonedTime(dateStr, 'America/New_York').getTime() / 1000);
				points.push({ time, value: close });
			}
		} else {
			// For daily data or if we want all data
			for (const [dateStr, ohlc] of Object.entries(ts)) {
				const close = parseFloat((ohlc as Record<string, string>)['4. close']) || 0;
				if (!isFinite(close)) continue;

				// For daily data, keep as yyyy-mm-dd string
				let time;
				if (isIntraday) {
					// Parse intraday timestamps as ET timezone using proper timezone library
					time = Math.floor(fromZonedTime(dateStr, 'America/New_York').getTime() / 1000);
				} else {
					time = dateStr.split(' ')[0];
				}

				points.push({ time, value: close });
			}
			// Only show last 30 days for daily data unless fullRange or barCount provided
			if (!isIntraday && !fullRange && !barCount && points.length > 30) {
				points.splice(0, points.length - 30);
			}
			// If intraday (but either fullRange or barCount specified), still compute session bounds for overlays/markers
			if (isIntraday && allDates.length > 0) {
				const sortedDates = allDates.sort((a, b) => b.localeCompare(a));
				const mostRecentTimestamp = sortedDates[0];
				const todayET = formatInTimeZone(new Date(), 'America/New_York', 'yyyy-MM-dd');
				const mostRecentDateStr = mostRecentTimestamp.split(' ')[0];
				const hasToday = sortedDates.some((d) => d.startsWith(todayET));
				const sessionDate = hasToday ? todayET : mostRecentDateStr;
				const preStartStr = `${sessionDate} 04:00:00`;
				const regOpenStr = `${sessionDate} 09:30:00`;
				const regCloseStr = `${sessionDate} 16:00:00`;
				const afterCloseStr = `${sessionDate} 20:00:00`;
				const sessionStartTime = fromZonedTime(preStartStr, 'America/New_York').getTime();
				const regOpenTime = fromZonedTime(regOpenStr, 'America/New_York').getTime();
				const regCloseTime = fromZonedTime(regCloseStr, 'America/New_York').getTime();
				const sessionEndTime = fromZonedTime(afterCloseStr, 'America/New_York').getTime();
				sessionBounds = {
					preStart: Math.floor(sessionStartTime / 1000),
					regOpen: Math.floor(regOpenTime / 1000),
					regClose: Math.floor(regCloseTime / 1000),
					afterClose: Math.floor(sessionEndTime / 1000)
				};
			}
		}

		// Always sort ascending by time before trimming so we keep the most recent tail
		points.sort((a, b) => {
			if (typeof a.time === 'number' && typeof b.time === 'number') {
				return a.time - b.time;
			}
			return a.time < b.time ? -1 : 1;
		});

		// If barCount specified: for alignToNow, keep a bounded tail; else trim exactly to N
		if (barCount && points.length > barCount) {
			if (alignToNow) {
				// Keep at most ~2x bars to avoid massive datasets while allowing smoother zoom/pan
				const keep = Math.max(400, Math.min(points.length, barCount * 2));
				points.splice(0, points.length - keep);
			} else {
				points.splice(0, points.length - barCount);
			}
		}

		return points;
	}

	// Session boundaries cache for overlays/markers (seconds since epoch)
	let sessionBounds: {
		preStart: number;
		regOpen: number;
		regClose: number;
		afterClose: number;
	} | null = null;

	// Shading overlay positions (in pixels)
	let preLeft = 0;
	let preWidth = 0;
	let postLeft = 0;
	let postWidth = 0;

	function updateOverlays() {
		if (!chart || !sessionBounds || !wrapperEl) return;
		const ts = chart.timeScale();
		const xPre = ts.timeToCoordinate(sessionBounds.preStart as unknown as UTCTimestamp);
		const xOpen = ts.timeToCoordinate(sessionBounds.regOpen as unknown as UTCTimestamp);
		const xClose = ts.timeToCoordinate(sessionBounds.regClose as unknown as UTCTimestamp);
		const xAfter = ts.timeToCoordinate(sessionBounds.afterClose as unknown as UTCTimestamp);
		if (
			xPre == null ||
			xOpen == null ||
			xClose == null ||
			xAfter == null ||
			Number.isNaN(xPre) ||
			Number.isNaN(xOpen) ||
			Number.isNaN(xClose) ||
			Number.isNaN(xAfter)
		) {
			preLeft = preWidth = postLeft = postWidth = 0;
			return;
		}
		preLeft = Math.min(xPre, xOpen);
		preWidth = Math.max(0, Math.abs(xOpen - xPre));
		postLeft = Math.min(xClose, xAfter);
		postWidth = Math.max(0, Math.abs(xAfter - xClose));
	}

	function resize() {
		if (!chart || !containerEl) return;
		const width = containerEl.clientWidth || 600;
		const chartHeight = height ?? (containerEl.clientHeight || 320);
		chart.applyOptions({ width, height: chartHeight });
		// Keep overlays and bar spacing in sync with size changes
		updateBarDensity();
		updateOverlays();
	}

	let ro: ResizeObserver | null = null;

	// Tooltip state
	let tooltipEl: HTMLDivElement | null = null;
	let showTooltip = false;
	let tooltipX = 0;
	let tooltipY = 0;
	let tooltipTime = '';
	let tooltipDate = '';
	// Only show date and time; omit price per request

	function isBusinessDay(t: unknown): t is { year: number; month: number; day: number } {
		return !!t && typeof t === 'object' && 'year' in (t as Record<string, unknown>);
	}

	onMount(() => {
		if (!containerEl) return;
		chart = createChart(containerEl, {
			layout: {
				background: { color: 'transparent' },
				textColor: '#ddd'
			},
			handleScroll: {
				mouseWheel: true,
				pressedMouseMove: true
			},
			handleScale: {
				axisPressedMouseMove: true,
				mouseWheel: true,
				pinch: true
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
			localization: {
				locale: typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
				timeFormatter: (time: unknown) => {
					try {
						if (typeof time === 'number') {
							const d = new Date(time * 1000);
							return new Intl.DateTimeFormat(
								typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
								{ month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
							).format(d);
						}
						if (typeof time === 'string') {
							const d = new Date(time);
							return new Intl.DateTimeFormat(
								typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
								{ month: 'short', day: '2-digit' }
							).format(d);
						}
						if (isBusinessDay(time)) {
							const t = time;
							const d = new Date(Date.UTC(t.year, (t.month || 1) - 1, t.day || 1));
							return new Intl.DateTimeFormat(
								typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
								{ month: 'short', day: '2-digit' }
							).format(d);
						}
					} catch {
						/* noop */
					}
					return '';
				}
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
			updateBarDensity();
			updateVisibleRange();
			requestAnimationFrame(() => updateOverlays());
		}
		window.addEventListener('resize', resize);
		// Resize when the container itself changes size (e.g., modal size changes)
		if (window.ResizeObserver && containerEl) {
			ro = new ResizeObserver(() => resize());
			ro.observe(containerEl);
		}
		// Update overlays on zoom/pan
		chart
			.timeScale()
			.subscribeVisibleTimeRangeChange(() => requestAnimationFrame(() => updateOverlays()));

		// Custom tooltip near cursor showing date + time
		chart.subscribeCrosshairMove((param: MouseEventParams) => {
			if (!wrapperEl) return;
			if (!param || !param.point || param.time === undefined) {
				showTooltip = false;
				return;
			}
			const { x, y } = param.point;
			tooltipX = x + 12; // small offset right of cursor
			tooltipY = Math.max(8, Math.min(y + 12, (wrapperEl.clientHeight || 0) - 40));
			// Format time/date in local timezone
			if (typeof param.time === 'number') {
				const d = new Date(param.time * 1000);
				tooltipTime = new Intl.DateTimeFormat(
					typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
					{ hour: '2-digit', minute: '2-digit' }
				).format(d);
				tooltipDate = new Intl.DateTimeFormat(
					typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
					{ year: 'numeric', month: 'short', day: '2-digit' }
				).format(d);
			} else if (typeof param.time === 'string') {
				const d = new Date(param.time);
				tooltipTime = new Intl.DateTimeFormat(
					typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
					{ hour: '2-digit', minute: '2-digit' }
				).format(d);
				tooltipDate = new Intl.DateTimeFormat(
					typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
					{ year: 'numeric', month: 'short', day: '2-digit' }
				).format(d);
			}
			showTooltip = true;
		});
	});

	function updateBarDensity() {
		if (!chart || !containerEl) return;
		if (!barCount) return;
		const width = containerEl.clientWidth || 600;
		const spacing = Math.max(1, Math.floor(width / Math.max(10, barCount)));
		try {
			chart.timeScale().applyOptions({ barSpacing: spacing });
		} catch {
			/* noop */
		}
	}

	let lastPoints: { time: string | number; value: number }[] = [];

	function updateVisibleRange() {
		if (!chart || !barCount || !interval || lastPoints.length < 2) return;

		const ts = chart.timeScale();
		const n = lastPoints.length;
		const startIndex = Math.max(0, n - barCount);
		const start = lastPoints[startIndex]?.time;
		const end = lastPoints[n - 1]?.time;
		if (start == null || end == null) return;

		try {
			if (interval !== 'daily' && typeof start === 'number' && typeof end === 'number') {
				ts.setVisibleRange({
					from: start as unknown as UTCTimestamp,
					to: end as unknown as UTCTimestamp
				});
			} else if (typeof start === 'string' && typeof end === 'string') {
				const s = new Date(start);
				const e = new Date(end);
				ts.setVisibleRange({
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					from: { year: s.getFullYear(), month: s.getMonth() + 1, day: s.getDate() } as any,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					to: { year: e.getFullYear(), month: e.getMonth() + 1, day: e.getDate() } as any
				});
			}
			if (alignToNow) ts.scrollToPosition(0, true);
		} catch {
			/* noop */
		}
	}

	$: if (series && chart) {
		const next = parseSeries(timeseriesData);
		lastPoints = next;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		series.setData(next as any);
		if (next.length >= 2) {
			updateBarDensity();
			// Defer range + overlays until after data is applied by the chart
			requestAnimationFrame(() => {
				updateVisibleRange();
				updateOverlays();
			});
		}
	}

	// Re-apply visible range when controls change (barCount)
	$: if (chart && series && lastPoints.length >= 2 && barCount != null) {
		// React to slider/button changes immediately
		updateBarDensity();
		updateVisibleRange();
		updateOverlays();
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
	class="relative"
	bind:this={wrapperEl}
	style={`width: 100%; height: ${height ? height + 'px' : '100%'};`}
>
	<!-- Chart Canvas Container -->
	<div bind:this={containerEl} style="width: 100%; height: 100%"></div>

	<!-- Overlays (pointer-events: none to not block chart) -->
	<div class="pointer-events-none absolute inset-0" style="z-index: 2;">
		<!-- Pre/After hours shading under everything -->
		{#if preWidth > 0}
			<div
				style={`position:absolute; top:0; bottom:0; left:${preLeft}px; width:${preWidth}px; background: rgba(56,132,255,0.08);`}
			></div>
		{/if}
		{#if postWidth > 0}
			<div
				style={`position:absolute; top:0; bottom:0; left:${postLeft}px; width:${postWidth}px; background: rgba(243,177,60,0.10);`}
			></div>
		{/if}

		<!-- Legend removed while consolidating to single series -->

		<!-- Tooltip -->
		{#if showTooltip}
			<div
				bind:this={tooltipEl}
				class="rounded bg-black/70 px-2 py-1 text-xs text-gray-100 shadow"
				style={`position:absolute; left:${tooltipX}px; top:${tooltipY}px; white-space:nowrap;`}
			>
				<div>{tooltipDate}</div>
				<div>{tooltipTime}</div>
			</div>
		{/if}
	</div>
</div>
