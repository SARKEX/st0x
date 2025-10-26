<script lang="ts">
	import { browser } from '$app/environment';
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import type {
		DepthSeries,
		TradeHistoryPoint,
		VolumeBucket
	} from '$lib/components/charts/token-chart-types';

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
	export let tradeHistory: TradeHistoryPoint[] = [];
	export let volumeBuckets: VolumeBucket[] = [];
	export let depth: DepthSeries = { bids: [], asks: [] };
	export let isLoading = false;
	export let error: string | null = null;
	export let averagePrices: Array<{ x: number; y: number }> = [];
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

		const priceLineData = [...averagePrices]
			.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
			.sort((a, b) => a.x - b.x)
			// Ensure all timestamps are treated as UTC milliseconds since epoch
			.map((point) => ({ ...point, x: Math.trunc(point.x) }));

		const volumeData = volumeBuckets
			.filter((bucket) => Number.isFinite(bucket.start) && Number.isFinite(bucket.tokens))
			.sort((a, b) => a.start - b.start)
			// Ensure all timestamps are treated as UTC milliseconds since epoch
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

		const hasPriceData = priceLineData.length > 0;

		if (historyChart) {
			historyChart.destroy();
			historyChart = null;
		}

		historyChart = new ChartCtor(ctx, {
			type: 'scatter',
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
									raw?: { x?: number; y?: number };
									parsed?: { x?: number; y?: number };
								}>
							) => {
								if (items.length === 0) return '';
								const time = items[0].raw?.x ?? items[0].parsed?.x;
								if (!time) return '';
								// Convert UTC milliseconds to local timezone
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
							dataset?: { candlestick?: boolean; label?: string };
							raw?: { o?: number; h?: number; l?: number; c?: number; x?: number; y?: number };
							parsed?: { x?: number; y?: number };
						}) => {
							if (context.dataset?.candlestick) {
								const candle = context.raw as { o?: number; h?: number; l?: number; c?: number } | undefined;
								if (!candle?.c || !candle?.o) return '';
								const direction = candle.c >= candle.o ? '▲' : '▼';
								return `${direction} O:${candle.o.toFixed(2)} H:${candle.h?.toFixed(
									2
								)} L:${candle.l?.toFixed(2)} C:${candle.c.toFixed(2)}`;
							}
							if (context.dataset?.label === 'Volume') {
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
							displayFormats: { hour: 'MMM dd HH:00', day: 'MMM dd' }
						},
						ticks: { color: '#9ca3af', maxRotation: 0, autoSkip: false },
						grid: { color: 'rgba(148, 163, 184, 0.15)' },
						min: minTime,
						max: maxTime
					},
					yPrice: {
						position: 'left',
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
		if (hasPriceData) {
			datasets.push({
				label: 'Average Price',
				type: 'line',
				yAxisID: 'yPrice',
				data: priceLineData,
				borderColor: '#00ff00',
				backgroundColor: 'transparent',
				borderWidth: 2,
				fill: false,
				pointRadius: 3,
				pointBackgroundColor: '#00ff00',
				pointBorderColor: '#ffffff',
				pointBorderWidth: 1,
				pointHoverRadius: 5,
				tension: 0,
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
		if (!hasPriceData && volumeData.length === 0) {
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

		// Get the starting price (max for bids, min for asks)
		const startPrice = sorted.length > 0 ? sorted[0].price : 0;

		// Start at the first price with 0 volume
		cumulative.push({ x: startPrice, y: 0 });

		// For each point, add the cumulative volume step
		for (const point of sorted) {
			// Point at current price with volume before this order
			cumulative.push({ x: point.price, y: running });
			// Add this order's volume to running total
			running += point.quantity;
			// Point at current price with volume after this order
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
			const sorted = [...data].sort((a, b) => a.x - b.x);
			const extended: Array<{ x: number; y: number }> = [];

			// Add all data points
			extended.push(...sorted);

			// Add horizontal tail at far price (but don't drop back to 0)
			if (side === 'bids') {
				// For bids, extend tail to lower prices at the final cumulative volume
				extended.push({ x: lowerTail, y: sorted[sorted.length - 1].y });
			} else {
				// For asks, extend tail to higher prices at the final cumulative volume
				extended.push({ x: upperTail, y: sorted[sorted.length - 1].y });
			}

			return extended;
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
				updateCharts();
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
		void tradeHistory;
		void volumeBuckets;
		void depth;
		void rangeStartMs;
		void rangeEndMs;
		void historyRange;
		void averagePrices;
		chartsReady = false;
		tick().then(() => {
			if (ChartCtor && browser) {
				updateCharts();
				// Only mark as ready if we have actual data OR we're done loading
				const hasData = averagePrices.length > 0 || depth.bids.length > 0 || depth.asks.length > 0;
				const doneLoading = !isLoading && !libraryLoading;
				chartsReady = hasData || doneLoading;
			}
		});
	}

	$: historyEmpty = averagePrices.length === 0 && volumeBuckets.length === 0;
	$: depthEmpty = depth.bids.length === 0 && depth.asks.length === 0;
	$: combinedError = error ?? chartLibError;
	$: libraryLoading = loadingChartLib && !ChartCtor;
</script>

<div class="space-y-6">
	{#if combinedError}
		<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
			{combinedError}
		</div>
	{/if}
	<div>
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			<div>
				<h2 class="text-base font-semibold text-white">On-chain Activity</h2>
				<p class="text-sm text-gray-400">
					Visualize recent trades and current liquidity sourced directly from the on-chain
					orderbook.
				</p>
			</div>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-3 xl:grid-rows-2">
		<!-- Row 1: Trade History (2/3) -->
		<div
			class={`${containerStyles.cardBordered} flex min-h-96 flex-col lg:col-span-2 xl:col-span-2 xl:row-span-2`}
		>
			<div class="border-b border-white/5 pb-3">
				<div
					class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
				>
					<div>
						<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
							Trade History
						</h3>
						<p class="mt-1 text-xs text-gray-500">On-chain trade executions over time</p>
					</div>
					{#if historyRangeOptions.length > 0}
						<div class="flex items-center gap-2 self-start">
							{#each historyRangeOptions as option}
								<button
									type="button"
									class={`rounded-md border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
										historyRange === option.key
											? 'border-blue-400/60 bg-blue-500/20 text-blue-200'
											: 'border-white/10 text-gray-400 hover:border-white/25 hover:text-white'
									}`}
									aria-pressed={historyRange === option.key}
									on:click={() => dispatch('rangeChange', { key: option.key })}
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
						class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-400"
					>
						Charts are available in a browser environment.
					</div>
				{:else}
					<div class="relative h-96 lg:h-80">
						<canvas bind:this={historyCanvas} class="absolute inset-0 h-full w-full"></canvas>
						{#if !chartsReady}
							<div class="absolute inset-0 flex items-center justify-center bg-gray-900/60">
								<LoadingSpinner variant="inline" size="md" text="Loading chart data..." />
							</div>
						{:else if chartsReady && historyEmpty}
							<div
								class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-400"
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
			class={`${containerStyles.cardBordered} flex min-h-96 flex-col lg:row-span-1 xl:row-span-2`}
		>
			<div class="border-b border-white/5 pb-3">
				<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Orderbook Depth</h3>
				<p class="mt-1 text-xs text-gray-500">Current on-chain liquidity</p>
			</div>
			<div class="relative min-h-80 flex-1 pt-4">
				{#if !browser}
					<div
						class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-400"
					>
						Charts are available in a browser environment.
					</div>
				{:else}
					<div class="relative h-full w-full">
						<canvas bind:this={depthCanvas} class="absolute inset-0 h-full w-full"></canvas>
						{#if !chartsReady}
							<div class="absolute inset-0 flex items-center justify-center bg-gray-900/60">
								<LoadingSpinner variant="inline" size="md" text="Loading orderbook data..." />
							</div>
						{:else if chartsReady && depthEmpty}
							<div
								class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-400"
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
