<script lang="ts">
        import { browser } from '$app/environment';
        import { onDestroy, onMount } from 'svelte';
        import { containerStyles } from '$lib/utils/styles';
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

        export let tradeHistory: TradeHistoryPoint[] = [];
        export let volumeBuckets: VolumeBucket[] = [];
        export let depth: DepthSeries = { bids: [], asks: [] };
        export let isLoading = false;
        export let error: string | null = null;

        let historyCanvas: HTMLCanvasElement | null = null;
        let volumeCanvas: HTMLCanvasElement | null = null;
        let depthCanvas: HTMLCanvasElement | null = null;

        let historyChart: ChartInstance = null;
        let volumeChart: ChartInstance = null;
        let depthChart: ChartInstance = null;
        let ChartCtor: any = null;
        let loadingChartLib = false;
        let chartLibError: string | null = null;

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
                                existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), {
                                        once: true
                                });
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

                if (typeof window !== 'undefined' && (window as { Chart?: any }).Chart) {
                        ChartCtor = (window as { Chart?: any }).Chart ?? null;
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
                        const chartGlobal = (window as { Chart?: any }).Chart ?? null;
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
                if (volumeChart) {
                        volumeChart.destroy();
                        volumeChart = null;
                }
                if (depthChart) {
                        depthChart.destroy();
                        depthChart = null;
                }
        }

        function priceRange(points: TradeHistoryPoint[]) {
                if (!points.length) return { min: undefined, max: undefined };
                let min = Number.POSITIVE_INFINITY;
                let max = Number.NEGATIVE_INFINITY;
                for (const point of points) {
                        if (!Number.isFinite(point.price)) continue;
                        min = Math.min(min, point.price);
                        max = Math.max(max, point.price);
                }
                if (!Number.isFinite(min) || !Number.isFinite(max) || min === Number.POSITIVE_INFINITY) {
                        return { min: undefined, max: undefined };
                }
                const span = max - min;
                const padding = span > 0 ? span * 0.1 : min > 0 ? min * 0.1 : 0;
                return { min: Math.max(0, min - padding), max: max + padding };
        }

        function updateHistoryChart() {
                if (!ChartCtor || !historyCanvas) return;
                const ctx = historyCanvas.getContext('2d');
                if (!ctx) return;

                const dataset = tradeHistory
                        .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
                        .map((point) => ({ x: point.timestamp, y: point.price, side: point.side }));

                if (!historyChart) {
                        historyChart = new ChartCtor(ctx, {
                                type: 'line',
                                data: { datasets: [] },
                                options: {
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        interaction: { mode: 'nearest', intersect: false },
                                        plugins: {
                                                legend: { display: false },
                                                tooltip: {
                                                        callbacks: {
                                                                label: (context: { raw?: { y?: number; side?: string } }) => {
                                                                        const value = context.raw?.y;
                                                                        const side = context.raw?.side;
                                                                        const priceLabel =
                                                                                value && Number.isFinite(value)
                                                                                        ? `$${value.toFixed(2)}`
                                                                                        : '—';
                                                                        if (side === 'buy') return `Buy @ ${priceLabel}`;
                                                                        if (side === 'sell') return `Sell @ ${priceLabel}`;
                                                                        return priceLabel;
                                                                }
                                                        }
                                                }
                                        },
                                        scales: {
                                                x: {
                                                        type: 'time',
                                                        time: { tooltipFormat: 'MMM d, yyyy HH:mm' },
                                                        ticks: {
                                                                color: '#9ca3af',
                                                                maxRotation: 0,
                                                                autoSkip: true
                                                        },
                                                        grid: { color: 'rgba(148, 163, 184, 0.15)' }
                                                },
                                                y: {
                                                        ticks: {
                                                                color: '#9ca3af',
                                                                callback: (value: string | number) => {
                                                                        const numeric = Number(value);
                                                                        if (!Number.isFinite(numeric)) return value;
                                                                        return `$${numeric.toFixed(2)}`;
                                                                }
                                                        },
                                                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                                                }
                                        }
                                }
                        }) as ChartInstance;
                }

                if (!historyChart) return;

                historyChart.data.datasets = [
                        {
                                label: 'Trade price (USDC)',
                                data: dataset,
                                borderColor: '#facc15',
                                backgroundColor: 'rgba(250, 204, 21, 0.15)',
                                tension: 0.2,
                                spanGaps: true,
                                parsing: false,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                pointBackgroundColor: (context: { raw?: { side?: string } }) =>
                                        context.raw?.side === 'buy' ? '#22c55e' : '#ef4444',
                                pointBorderColor: (context: { raw?: { side?: string } }) =>
                                        context.raw?.side === 'buy' ? '#22c55e' : '#ef4444'
                        }
                ];

                const { min, max } = priceRange(tradeHistory);
                const yScale = historyChart.options.scales?.y ?? historyChart.options.scales?.['y'];
                if (yScale) {
                        if (Number.isFinite(min)) {
                                yScale.suggestedMin = min;
                        } else {
                                delete yScale.suggestedMin;
                        }
                        if (Number.isFinite(max)) {
                                yScale.suggestedMax = max;
                        } else {
                                delete yScale.suggestedMax;
                        }
                }

                historyChart.update();
        }

        function updateVolumeChart() {
                if (!ChartCtor || !volumeCanvas) return;
                const ctx = volumeCanvas.getContext('2d');
                if (!ctx) return;

                const dataset = volumeBuckets
                        .filter((bucket) => Number.isFinite(bucket.start) && Number.isFinite(bucket.tokens))
                        .map((bucket) => ({ x: bucket.start, y: bucket.tokens }));

                if (!volumeChart) {
                        volumeChart = new ChartCtor(ctx, {
                                type: 'bar',
                                data: { datasets: [] },
                                options: {
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                                legend: { display: false }
                                        },
                                        scales: {
                                                x: {
                                                        type: 'time',
                                                        time: { unit: 'day' },
                                                        ticks: { color: '#9ca3af', maxRotation: 0 },
                                                        grid: { color: 'rgba(148, 163, 184, 0.15)' }
                                                },
                                                y: {
                                                        ticks: {
                                                                color: '#9ca3af',
                                                                callback: (value: string | number) => {
                                                                        const numeric = Number(value);
                                                                        if (!Number.isFinite(numeric)) return value;
                                                                        return `${numeric.toFixed(2)} tokens`;
                                                                }
                                                        },
                                                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                                                }
                                        }
                                }
                        }) as ChartInstance;
                }

                if (!volumeChart) return;

                volumeChart.data.datasets = [
                        {
                                label: 'Volume (tokens)',
                                data: dataset,
                                backgroundColor: 'rgba(14, 165, 233, 0.55)',
                                borderColor: '#0ea5e9',
                                borderWidth: 1,
                                borderRadius: 6,
                                maxBarThickness: 36,
                                parsing: false
                        }
                ];

                volumeChart.update();
        }

        function buildDepthDataset(points: DepthSeries['bids'], side: 'bids' | 'asks') {
                const sorted = [...points]
                        .filter((point) => Number.isFinite(point.price) && Number.isFinite(point.quantity) && point.quantity > 0)
                        .sort((a, b) => (side === 'bids' ? b.price - a.price : a.price - b.price));

                const cumulative: Array<{ x: number; y: number }> = [];
                let running = 0;
                for (const point of sorted) {
                        running += point.quantity;
                        cumulative.push({ x: point.price, y: running });
                }
                return cumulative;
        }

        function updateDepthChart() {
                if (!ChartCtor || !depthCanvas) return;
                const ctx = depthCanvas.getContext('2d');
                if (!ctx) return;

                const bidsData = buildDepthDataset(depth.bids, 'bids');
                const asksData = buildDepthDataset(depth.asks, 'asks');

                if (!depthChart) {
                        depthChart = new ChartCtor(ctx, {
                                type: 'line',
                                data: { datasets: [] },
                                options: {
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        interaction: { mode: 'nearest', intersect: false },
                                        plugins: {
                                                legend: { position: 'bottom', labels: { color: '#d1d5db' } }
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
                                                        ticks: {
                                                                color: '#9ca3af',
                                                                callback: (value: string | number) => {
                                                                        const numeric = Number(value);
                                                                        if (!Number.isFinite(numeric)) return value;
                                                                        return `${numeric.toFixed(2)} tokens`;
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
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                fill: 'origin',
                                stepped: 'before',
                                parsing: false,
                                tension: 0
                        },
                        {
                                label: 'Asks',
                                data: asksData,
                                borderColor: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                fill: 'origin',
                                stepped: 'after',
                                parsing: false,
                                tension: 0
                        }
                ];

                depthChart.update();
        }

        function updateCharts() {
                if (!ChartCtor) return;
                updateHistoryChart();
                updateVolumeChart();
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
                updateCharts();
        }

        $: historyEmpty = tradeHistory.length === 0;
        $: volumeEmpty = volumeBuckets.length === 0;
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
        <div class="grid gap-6 xl:grid-cols-3">
                <div class={`${containerStyles.cardBordered} flex flex-col`}> 
                        <div class="border-b border-white/5 pb-3">
                                <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Trade History</h3>
                                <p class="mt-1 text-xs text-gray-500">On-chain trade executions over the last 30 days</p>
                        </div>
                        <div class="relative flex-1 pt-4">
                                {#if !browser}
                                        <div class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-400">
                                                Charts are available in a browser environment.
                                        </div>
                                {:else}
                                        <div class="relative h-64">
                                                <canvas bind:this={historyCanvas} class="absolute inset-0 h-full w-full"></canvas>
                                                {#if (isLoading || libraryLoading) && historyEmpty}
                                                        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/60 text-sm text-gray-400">
                                                                Loading chart data...
                                                        </div>
                                                {:else if (!isLoading && !libraryLoading && historyEmpty)}
                                                        <div class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-400">
                                                                No on-chain trades recorded for this token during the selected period.
                                                        </div>
                                                {/if}
                                        </div>
                                {/if}
                        </div>
                </div>

                <div class={`${containerStyles.cardBordered} flex flex-col`}>
                        <div class="border-b border-white/5 pb-3">
                                <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Trade Volume</h3>
                                <p class="mt-1 text-xs text-gray-500">Daily token volume settled on-chain</p>
                        </div>
                        <div class="relative flex-1 pt-4">
                                {#if !browser}
                                        <div class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-400">
                                                Charts are available in a browser environment.
                                        </div>
                                {:else}
                                        <div class="relative h-64">
                                                <canvas bind:this={volumeCanvas} class="absolute inset-0 h-full w-full"></canvas>
                                                {#if (isLoading || libraryLoading) && volumeEmpty}
                                                        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/60 text-sm text-gray-400">
                                                                Loading volume data...
                                                        </div>
                                                {:else if (!isLoading && !libraryLoading && volumeEmpty)}
                                                        <div class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-400">
                                                                No settled trades to calculate volume for this period.
                                                        </div>
                                                {/if}
                                        </div>
                                {/if}
                        </div>
                </div>

                <div class={`${containerStyles.cardBordered} flex flex-col`}>
                        <div class="border-b border-white/5 pb-3">
                                <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Orderbook Depth</h3>
                                <p class="mt-1 text-xs text-gray-500">Aggregated on-chain liquidity from current quotes</p>
                        </div>
                        <div class="relative flex-1 pt-4">
                                {#if !browser}
                                        <div class="absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-400">
                                                Charts are available in a browser environment.
                                        </div>
                                {:else}
                                        <div class="relative h-64">
                                                <canvas bind:this={depthCanvas} class="absolute inset-0 h-full w-full"></canvas>
                                                {#if (isLoading || libraryLoading) && depthEmpty}
                                                        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/60 text-sm text-gray-400">
                                                                Loading orderbook data...
                                                        </div>
                                                {:else if (!isLoading && !libraryLoading && depthEmpty)}
                                                        <div class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-400">
                                                                No active on-chain quotes available for this token.
                                                        </div>
                                                {/if}
                                        </div>
                                {/if}
                        </div>
                </div>
        </div>
</div>
