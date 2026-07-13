<script lang="ts">
	import { browser } from '$app/environment';
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import type {
		DepthSeries,
		VolumeBucket,
		OHLCBucket
	} from '$lib/components/charts/token-chart-types';
	import { track } from '$lib/services/analytics';

	// Track when user inspects the depth chart (first hover only)
	let depthChartInspected = false;

	function handleDepthChartInspected() {
		if (!depthChartInspected) {
			depthChartInspected = true;
			track('depth_chart_inspected');
		}
	}

	type ChartInstance = {
		destroy: () => void;
		update: (mode?: string) => void;
		data: { datasets?: Array<Record<string, unknown>> };
		options: Record<string, unknown> & {
			scales?: Record<string, Record<string, unknown>>;
		};
	} | null;

	type ChartConfigurationLike = {
		type: string;
		data?: Record<string, unknown>;
		options?: Record<string, unknown>;
	};

	type ChartConstructor = new (
		ctx: CanvasRenderingContext2D,
		config: ChartConfigurationLike
	) => ChartInstance;

	interface ChartJsWindow extends Window {
		Chart?: ChartConstructor;
	}

	type HistoryRangeKey = '1D' | '7D' | '30D';
	type HistoryRangeOption = { key: HistoryRangeKey; label: string };

	// Used for reactive chart updates (via $: reactive statement)
	export let volumeBuckets: VolumeBucket[] = [];
	export let depth: DepthSeries = { bids: [], asks: [] };
	export let isLoading = false;
	export let error: string | null = null;
	export let ohlcData: OHLCBucket[] = [];
	export let rangeStartMs: number | null = null;
	export let rangeEndMs: number | null = null;
	export let historyRange: HistoryRangeKey = '7D';
	export let historyRangeOptions: HistoryRangeOption[] = [];

	const dispatch = createEventDispatcher<{ rangeChange: { key: HistoryRangeKey } }>();

	let historyCanvas: HTMLCanvasElement | null = null;
	let depthCanvas: HTMLCanvasElement | null = null;

	let historyChart: ChartInstance = null;
	let depthChart: ChartInstance = null;
	let ChartCtor: ChartConstructor | null = null;
	let loadingChartLib = false;
	let chartLibError: string | null = null;
	let chartsReady = false;
	// Track whether isLoading has ever been true.
	// chartsLoading starts false in the parent before reactive deps resolve,
	// so without this guard the chart renders empty axes on mount.
	let loadingEverStarted = false;
	$: if (isLoading) loadingEverStarted = true;

	function roundToNiceNumber(value: number): number {
		if (!Number.isFinite(value) || value <= 0) return 1;
		const exponent = Math.floor(Math.log10(value));
		const base = 10 ** exponent;
		const fraction = value / base;

		let niceFraction = 1;
		if (fraction <= 1) niceFraction = 1;
		else if (fraction <= 2) niceFraction = 2;
		else if (fraction <= 5) niceFraction = 5;
		else niceFraction = 10;

		return niceFraction * base;
	}

	const scriptPromises = new Map<string, Promise<void>>();

	function loadScript(src: string): Promise<void> {
		if (!browser) return Promise.resolve();

		if (scriptPromises.has(src)) {
			return scriptPromises.get(src)!;
		}

		const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
		if (existing?.dataset.loaded === 'true') {
			return Promise.resolve();
		}

		if (existing && existing.dataset.loading === 'true') {
			return new Promise<void>((resolve, reject) => {
				existing.addEventListener('load', () => resolve(), { once: true });
				existing.addEventListener(
					'error',
					() => reject(new Error(`Failed to load script: ${src}`)),
					{
						once: true
					}
				);
			});
		}

		const promise = new Promise<void>((resolve, reject) => {
			const script = document.createElement('script');
			script.src = src;
			script.async = true;
			script.dataset.loading = 'true';
			script.addEventListener(
				'load',
				() => {
					script.dataset.loading = 'false';
					script.dataset.loaded = 'true';
					resolve();
				},
				{ once: true }
			);
			script.addEventListener(
				'error',
				() => {
					script.dataset.loading = 'false';
					reject(new Error(`Failed to load script: ${src}`));
				},
				{ once: true }
			);
			document.head.appendChild(script);
		});

		promise.catch(() => {
			scriptPromises.delete(src);
		});

		scriptPromises.set(src, promise);
		return promise;
	}

	async function ensureChartLib() {
		if (!browser) return null;
		if (ChartCtor) return ChartCtor;

		if (typeof window !== 'undefined' && (window as ChartJsWindow).Chart) {
			ChartCtor = (window as ChartJsWindow).Chart ?? null;
			chartLibError = null;
			return ChartCtor;
		}

		loadingChartLib = true;
		chartLibError = null;
		try {
			await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js');
			await loadScript(
				'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js'
			);
			// Load financial chart plugin for OHLC/candlestick
			await loadScript(
				'https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.1/dist/chartjs-chart-financial.min.js'
			);
			const chartGlobal = (window as ChartJsWindow).Chart ?? null;
			if (!chartGlobal) {
				throw new Error('Chart.js global not found');
			}
			ChartCtor = chartGlobal;
			chartLibError = null;
			return ChartCtor;
		} catch (err) {
			console.error('[charts] Failed to load Chart.js', err);
			chartLibError = 'Unable to load charting library.';
			return null;
		} finally {
			loadingChartLib = false;
		}
	}

	function destroyCharts() {
		if (historyChart) {
			historyChart.destroy();
			historyChart = null;
		}
		if (depthChart) {
			depthChart.destroy();
			depthChart = null;
		}
	}

	function formatYAxisValue(value: number, range: number): string {
		if (!Number.isFinite(value) || !Number.isFinite(range)) return String(value);

		const absRange = Math.abs(range);
		const absValue = Math.abs(value);

		let decimals = 0;
		if (absRange >= 1_000) {
			decimals = 0;
		} else if (absRange >= 100) {
			decimals = absValue >= 10 ? 1 : 2;
		} else if (absRange >= 10) {
			decimals = absValue >= 1 ? 2 : 3;
		} else if (absRange >= 1) {
			decimals = absValue >= 1 ? 2 : 3;
		} else if (absRange >= 0.1) {
			decimals = 3;
		} else {
			decimals = 4;
		}

		return value.toFixed(decimals);
	}

	function updateHistoryChart() {
		if (!ChartCtor || !historyCanvas) return;
		const ctx = historyCanvas.getContext('2d');
		if (!ctx) return;

		// Prepare OHLC candlestick data
		const candleData = [...ohlcData]
			.filter(
				(candle) =>
					Number.isFinite(candle.x) &&
					Number.isFinite(candle.o) &&
					Number.isFinite(candle.h) &&
					Number.isFinite(candle.l) &&
					Number.isFinite(candle.c)
			)
			.sort((a, b) => a.x - b.x)
			.map((candle) => ({ ...candle, x: Math.trunc(candle.x) }));

		const volumeData = volumeBuckets
			.filter((bucket) => Number.isFinite(bucket.start) && Number.isFinite(bucket.tokens))
			.sort((a, b) => a.start - b.start)
			.map((bucket) => ({ x: Math.trunc(bucket.start), y: bucket.tokens }));

		const hasExplicitStart = typeof rangeStartMs === 'number' && Number.isFinite(rangeStartMs);
		const hasExplicitEnd = typeof rangeEndMs === 'number' && Number.isFinite(rangeEndMs);
		const fallbackEnd = hasExplicitEnd ? (rangeEndMs as number) : Date.now();
		const fallbackStart = hasExplicitStart
			? (rangeStartMs as number)
			: fallbackEnd - 7 * 24 * 60 * 60 * 1000;

		let minTime = hasExplicitStart ? (rangeStartMs as number) : fallbackStart;
		let maxTime = hasExplicitEnd ? (rangeEndMs as number) : fallbackEnd;

		if (!Number.isFinite(minTime)) {
			minTime = fallbackStart;
		}
		if (!Number.isFinite(maxTime) || maxTime <= minTime) {
			maxTime = Math.max(fallbackEnd, minTime + 60 * 60 * 1000);
		}

		const volumeValues = volumeData.map((bucket) => bucket.y);
		const volumeMax = volumeValues.length ? Math.max(...volumeValues) : 0;
		const volumeRange = volumeMax > 0 ? volumeMax : 1;
		const volumeAxisMax = roundToNiceNumber(volumeRange * 4);
		const timeRangeMs = Math.max(1, maxTime - minTime);
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;
		let timeUnit: 'hour' | 'day' = 'hour';
		let timeStep = 1;
		if (timeRangeMs > ONE_DAY_MS * 14) {
			timeUnit = 'day';
			timeStep = 1;
		} else if (timeRangeMs > ONE_DAY_MS * 2) {
			timeUnit = 'hour';
			timeStep = 6;
		}

		const hasCandleData = candleData.length > 0;

		// Calculate price range with padding (20% below lowest, 10% above highest)
		const priceLows = candleData.map((c) => c.l);
		const priceHighs = candleData.map((c) => c.h);
		const minPrice = priceLows.length ? Math.min(...priceLows) : 0;
		const maxPrice = priceHighs.length ? Math.max(...priceHighs) : 100;
		const priceAxisMin = Math.max(0, minPrice * 0.8);
		const priceAxisMax = maxPrice * 1.1;

		if (historyChart) {
			historyChart.destroy();
			historyChart = null;
		}

		historyChart = new ChartCtor(ctx, {
			type: 'candlestick',
			data: { datasets: [] },
			options: {
				responsive: true,
				animation: false,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', intersect: false },
				plugins: {
					legend: { labels: { color: '#d1d5db' } },
					tooltip: {
						callbacks: {
							title: (
								items: Array<{
									raw?: { x?: number; y?: number; o?: number; h?: number; l?: number; c?: number };
									parsed?: { x?: number; y?: number };
								}>
							) => {
								if (items.length === 0) return '';
								const time = items[0].raw?.x ?? items[0].parsed?.x;
								if (!time) return '';
								const date = new Date(Math.trunc(time));
								return date.toLocaleString('en-US', {
									year: 'numeric',
									month: '2-digit',
									day: '2-digit',
									hour: '2-digit',
									minute: '2-digit',
									hour12: false,
									timeZone: undefined
								});
							},
							label: (context: {
								dataset?: { label?: string };
								raw?: { o?: number; h?: number; l?: number; c?: number; x?: number; y?: number };
								parsed?: { x?: number; y?: number };
							}) => {
								const label = context.dataset?.label || '';
								// Check if this is OHLC data
								const candle = context.raw;
								if (candle && 'o' in candle && 'c' in candle) {
									const direction = (candle.c ?? 0) >= (candle.o ?? 0) ? '▲' : '▼';
									return `${direction} O:$${candle.o?.toFixed(2)} H:$${candle.h?.toFixed(
										2
									)} L:$${candle.l?.toFixed(2)} C:$${candle.c?.toFixed(2)}`;
								}
								if (label === 'Volume') {
									const volumeValue = Number(context.raw?.y ?? context.parsed?.y ?? 0);
									return `Volume: ${formatYAxisValue(volumeValue, volumeRange)}`;
								}
								return '';
							}
						}
					}
				},
				scales: {
					x: {
						type: 'time',
						time: {
							unit: timeUnit,
							stepSize: timeStep,
							displayFormats: { hour: 'MMM dd HH:mm', day: 'MMM dd' },
							tooltipFormat: 'MMM dd, yyyy HH:mm'
						},
						ticks: {
							color: '#9ca3af',
							maxRotation: 0,
							autoSkip: true,
							maxTicksLimit: 8,
							source: 'auto'
						},
						grid: { color: 'rgba(148, 163, 184, 0.15)' },
						min: minTime,
						max: maxTime
					},
					yPrice: {
						position: 'left',
						min: priceAxisMin,
						max: priceAxisMax,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const numeric = Number(value);
								if (!Number.isFinite(numeric)) return value;
								return `$${numeric.toFixed(2)}`;
							}
						},
						grid: { color: 'rgba(148, 163, 184, 0.1)' }
					},
					yVolume: {
						position: 'right',
						beginAtZero: true,
						grid: { drawOnChartArea: false },
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								return formatYAxisValue(Number(value), volumeRange);
							}
						}
					}
				}
			}
		});

		if (!historyChart) return;

		const datasets: Array<{ [key: string]: unknown }> = [];
		if (hasCandleData) {
			datasets.push({
				label: 'Price',
				type: 'candlestick',
				yAxisID: 'yPrice',
				data: candleData,
				borderColor: {
					up: '#22c55e', // green for bullish
					down: '#ef4444', // red for bearish
					unchanged: '#9ca3af'
				},
				backgroundColor: {
					up: 'rgba(34, 197, 94, 0.8)',
					down: 'rgba(239, 68, 68, 0.8)',
					unchanged: 'rgba(156, 163, 175, 0.8)'
				},
				parsing: false
			});
		}
		if (volumeData.length > 0) {
			datasets.push({
				label: 'Volume',
				type: 'bar',
				yAxisID: 'yVolume',
				data: volumeData,
				backgroundColor: 'rgba(14, 165, 233, 0.45)',
				borderColor: '#0ea5e9',
				borderWidth: 1,
				borderRadius: 0,
				maxBarThickness: 24,
				hoverBackgroundColor: 'rgba(14, 165, 233, 0.6)',
				parsing: false
			});
		}
		if (!hasCandleData && volumeData.length === 0) {
			datasets.push({
				label: 'Placeholder',
				type: 'line',
				yAxisID: 'yPrice',
				data: [
					{ x: minTime, y: Number.NaN },
					{ x: maxTime, y: Number.NaN }
				],
				borderColor: 'rgba(0,0,0,0)',
				backgroundColor: 'rgba(0,0,0,0)',
				pointRadius: 0,
				pointHoverRadius: 0,
				parsing: false,
				spanGaps: true
			});
		}

		historyChart.data.datasets = datasets;

		const xScale = historyChart.options.scales?.x as {
			min?: number;
			max?: number;
			time?: { unit?: string; stepSize?: number };
		};
		if (xScale) {
			if (xScale.time) {
				xScale.time.unit = timeUnit;
				xScale.time.stepSize = timeStep;
			}
			xScale.min = minTime;
			xScale.max = maxTime;
		}

		const volumeScale = historyChart.options.scales?.yVolume;
		if (volumeScale) {
			volumeScale.display = false;
			volumeScale.grid = { drawOnChartArea: false, display: false };
			volumeScale.suggestedMax = volumeAxisMax;
			volumeScale.min = 0;
		}

		historyChart.update();
	}

	function buildDepthDataset(points: DepthSeries['bids'], side: 'bids' | 'asks') {
		const filtered = points.filter(
			(point) =>
				Number.isFinite(point.price) && Number.isFinite(point.quantity) && point.quantity > 0
		);

		// For bids: sort DESCENDING (high to low) so cumulative volume increases as price decreases
		// For asks: sort ASCENDING (low to high) so cumulative volume increases as price increases
		const sorted =
			side === 'bids'
				? filtered.sort((a, b) => b.price - a.price)
				: filtered.sort((a, b) => a.price - b.price);

		const cumulative: Array<{ x: number; y: number }> = [];
		let running = 0;

		// Two points per order — pre-step at the running total before this order,
		// post-step at the running total after. The pre-step on the first iteration
		// is implicitly the y=0 anchor (`running` starts at 0), so no separate
		// anchor point is needed. Emitting one would just duplicate the pre-step
		// at the same (price, 0) coordinate, which Chart.js's `nearest` hover mode
		// reports as two `0.0000 @ $price` tooltip rows and confuses users into
		// thinking those are real zero-volume orders.
		for (const point of sorted) {
			cumulative.push({ x: point.price, y: running });
			running += point.quantity;
			cumulative.push({ x: point.price, y: running });
		}

		return cumulative;
	}

	function updateDepthChart() {
		if (!ChartCtor || !depthCanvas) return;
		const ctx = depthCanvas.getContext('2d');
		if (!ctx) return;

		let bidsData = buildDepthDataset(depth.bids, 'bids');
		let asksData = buildDepthDataset(depth.asks, 'asks');

		const allVolumes = [...bidsData, ...asksData].map((point) => point.y);
		const maxVolume = allVolumes.length ? Math.max(...allVolumes) : 0;
		const volumeRange = maxVolume > 0 ? maxVolume : 1;

		const priceValues = [...bidsData, ...asksData]
			.map((point) => point.x)
			.filter((value) => Number.isFinite(value));
		const baseMinPrice = priceValues.length ? Math.min(...priceValues) : 0;
		const baseMaxPrice = priceValues.length ? Math.max(...priceValues) : 1;
		const priceSpan = Math.max(baseMaxPrice - baseMinPrice, baseMaxPrice * 0.05, 0.5);
		const pricePadding = priceSpan * 0.1;
		const lowerTail = Math.max(baseMinPrice - pricePadding, 0);
		const upperTail = baseMaxPrice + pricePadding;

		const extendWithTail = (data: Array<{ x: number; y: number }>, side: 'bids' | 'asks') => {
			if (!data.length) return data;

			if (side === 'bids') {
				// For bids: data comes in descending price order from buildDepthDataset
				// Reverse to ascending order so step-before interpolation works correctly
				const reversed = [...data].reverse();
				// The first point in reversed (lowest price) has the highest cumulative volume
				reversed.unshift({ x: lowerTail, y: reversed[0].y });
				return reversed;
			} else {
				// For asks: data already in ascending price order from buildDepthDataset
				// Append tail at the highest price's cumulative volume
				const extended = [...data];
				extended.push({ x: upperTail, y: extended[extended.length - 1].y });
				return extended;
			}
		};

		bidsData = extendWithTail(bidsData, 'bids');
		asksData = extendWithTail(asksData, 'asks');

		if (!depthChart) {
			depthChart = new ChartCtor(ctx, {
				type: 'line',
				data: { datasets: [] },
				options: {
					responsive: true,
					animation: false,
					maintainAspectRatio: false,
					interaction: { mode: 'nearest', intersect: false },
					plugins: {
						legend: { position: 'bottom', labels: { color: '#d1d5db' } },
						tooltip: {
							// Drop any data points whose cumulative volume is zero. The
							// step-function representation puts a `(price, 0)` point at
							// the leading edge of each side so the line falls back to the
							// x-axis. Those points carry no information for the user but
							// `interaction.mode = 'nearest'` will still surface them as
							// `0.0000 @ $price` rows on hover, which reads as a real
							// zero-volume order.
							filter: (item: { raw?: { y?: number }; parsed?: { y?: number } }) =>
								Number(item.raw?.y ?? item.parsed?.y ?? 0) > 0,
							callbacks: {
								label: (context: {
									dataset?: { candlestick?: boolean; label?: string };
									raw?: { o?: number; h?: number; l?: number; c?: number; x?: number; y?: number };
									parsed?: { x?: number; y?: number };
								}) => {
									const label = context.dataset?.label || '';
									const volumeValue = Number(context.raw?.y ?? context.parsed?.y ?? 0);
									const price = Number(context.raw?.x ?? context.parsed?.x ?? 0).toFixed(2);
									return `${label}: ${formatYAxisValue(volumeValue, volumeRange)} @ $${price}`;
								}
							}
						}
					},
					scales: {
						x: {
							type: 'linear',
							ticks: {
								color: '#9ca3af',
								callback: (value: string | number) => {
									const numeric = Number(value);
									if (!Number.isFinite(numeric)) return value;
									return `$${numeric.toFixed(2)}`;
								}
							},
							grid: { color: 'rgba(148, 163, 184, 0.1)' }
						},
						y: {
							beginAtZero: true,
							ticks: {
								color: '#9ca3af',
								callback: (value: string | number) => {
									const numeric = Number(value);
									if (!Number.isFinite(numeric)) return value;
									return formatYAxisValue(numeric, volumeRange);
								}
							},
							grid: { color: 'rgba(148, 163, 184, 0.1)' }
						}
					}
				}
			}) as ChartInstance;
		}

		if (!depthChart) return;

		depthChart.data.datasets = [
			{
				label: 'Bids',
				data: bidsData,
				borderColor: '#22c55e',
				backgroundColor: 'rgba(34, 197, 94, 0.25)',
				fill: 'origin',
				stepped: 'before',
				parsing: false,
				tension: 0
			},
			{
				label: 'Asks',
				data: asksData,
				borderColor: '#ef4444',
				backgroundColor: 'rgba(239, 68, 68, 0.25)',
				fill: 'origin',
				stepped: 'after',
				parsing: false,
				tension: 0
			}
		];

		const yScale = depthChart.options.scales?.y;
		if (yScale) {
			yScale.suggestedMax = roundToNiceNumber(volumeRange * 1.2);
		}

		const xScale = depthChart.options.scales?.x;
		if (xScale && priceValues.length) {
			xScale.min = lowerTail;
			xScale.max = upperTail;
		}

		depthChart.update();
	}

	function updateCharts() {
		if (!ChartCtor) return;
		updateHistoryChart();
		updateDepthChart();
	}

	onMount(() => {
		if (!browser) return;
		let cancelled = false;

		(async () => {
			await ensureChartLib();
			if (!cancelled) {
				// Don't render charts here — the reactive block will handle it
				// once both the library and data are available
			}
		})();

		return () => {
			cancelled = true;
			destroyCharts();
		};
	});

	onDestroy(() => {
		destroyCharts();
	});

	$: if (ChartCtor && browser) {
		void volumeBuckets;
		void depth;
		void rangeStartMs;
		void rangeEndMs;
		void historyRange;
		void ohlcData;
		const hasData = ohlcData.length > 0 || depth.bids.length > 0 || depth.asks.length > 0;
		// Only consider loading "genuinely done" once isLoading has been true at
		// least once.  chartsLoading in the parent starts as false before reactive
		// deps resolve, which would otherwise flash empty axes on mount.
		const genuinelyDone = loadingEverStarted && !isLoading && !libraryLoading;
		if (hasData) {
			tick().then(() => {
				if (ChartCtor && browser) {
					updateCharts();
					chartsReady = true;
				}
			});
		} else if (genuinelyDone) {
			// Loading finished with no data — reveal "no data" overlays
			// but do NOT create empty Chart.js instances (avoids empty-axes flash)
			chartsReady = true;
		} else {
			chartsReady = false;
		}
	}

	$: historyEmpty = ohlcData.length === 0 && volumeBuckets.length === 0;
	$: depthEmpty = depth.bids.length === 0 && depth.asks.length === 0;
	$: combinedError = error ?? chartLibError;
	$: libraryLoading = loadingChartLib && !ChartCtor;
</script>

<div class="space-y-6" data-testid="token-market-charts">
	{#if combinedError}
		<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
			{combinedError}
		</div>
	{/if}
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-3 xl:grid-rows-2">
		<!-- Row 1: Trade History (2/3) -->
		<div
			data-testid="trade-history-chart"
			class="flex min-h-96 flex-col rounded-2xl border border-line bg-overlay-1 p-5 backdrop-blur lg:col-span-2 xl:col-span-2 xl:row-span-2"
		>
			<div class="pb-3">
				<div
					class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
				>
					<div>
						<h3 class="text-[15px] font-semibold text-text">Trade History</h3>
						<p class="mt-1 text-xs text-text-3">On-chain trade executions over time</p>
					</div>
					{#if historyRangeOptions.length > 0}
						<div class="flex items-center gap-1 self-start rounded-lg bg-overlay-2 p-0.5">
							{#each historyRangeOptions as option}
								<button
									type="button"
									class={`rounded-md px-2 py-1 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 ${
										historyRange === option.key
											? 'bg-blue-500/80 text-white'
											: 'text-text-2 hover:text-text'
									}`}
									aria-pressed={historyRange === option.key}
									on:click={() => {
										track('chart_range_changed', {
											new_range: option.key,
											previous_range: historyRange
										});
										dispatch('rangeChange', { key: option.key });
									}}
								>
									{option.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="relative flex-1 pt-4">
				{#if !browser}
					<div
						class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-line p-4 text-center text-sm text-text-2"
					>
						Charts are available in a browser environment.
					</div>
				{:else}
					<div class="relative h-96 lg:h-80">
						<canvas bind:this={historyCanvas} class="absolute inset-0 h-full w-full"></canvas>
						{#if !chartsReady}
							<div class="absolute inset-0 flex items-center justify-center bg-surface-1">
								<LoadingSpinner variant="inline" size="md" text="Loading chart data..." />
							</div>
						{:else if chartsReady && historyEmpty}
							<div
								class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-text-2"
							>
								No on-chain trades recorded for this token during the selected period.
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Orderbook Depth (spans remaining column) -->
		<div
			data-testid="orderbook-depth-chart"
			class="flex min-h-96 flex-col rounded-2xl border border-line bg-overlay-1 p-5 backdrop-blur lg:row-span-1 xl:row-span-2"
		>
			<div class="pb-3">
				<h3 class="text-[15px] font-semibold text-text">Orderbook Depth</h3>
				<p class="mt-1 text-xs text-text-3">Current on-chain liquidity</p>
			</div>
			<div class="relative min-h-80 flex-1 pt-4">
				{#if !browser}
					<div
						class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-line p-4 text-center text-sm text-text-2"
					>
						Charts are available in a browser environment.
					</div>
				{:else}
					<div class="relative h-full w-full">
						<canvas
							bind:this={depthCanvas}
							class="absolute inset-0 h-full w-full"
							on:mouseenter={handleDepthChartInspected}
						></canvas>
						{#if !chartsReady}
							<div class="absolute inset-0 flex items-center justify-center bg-surface-1">
								<LoadingSpinner variant="inline" size="md" text="Loading orderbook data..." />
							</div>
						{:else if chartsReady && depthEmpty}
							<div
								class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-text-2"
							>
								No active on-chain quotes available for this token.
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
