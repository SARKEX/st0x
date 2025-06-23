<script lang="ts">
	import { onMount } from 'svelte';
	import { createChart, type Time } from 'lightweight-charts';
	import type { DeepPartial, ChartOptions } from 'lightweight-charts';

	interface RawStockDailyAdjustedTimeSeries {
		'1. open': string;
		'2. high': string;
		'3. low': string;
		'4. close': string;
		'5. adjusted close': string;
		'6. volume': string;
		'7. dividend amount': string;
		'8. split coefficient': string;
	}
	interface RawStockDailyAdjusted {
		'Meta Data': {
			'1. Information': string;
			'2. Symbol': string;
			'3. Last Refreshed': string;
			'4. Output Size': string;
			'5. Time Zone': string;
		};
		'Time Series (Daily)': {
			[date: string]: RawStockDailyAdjustedTimeSeries | undefined;
		};
	}
	export let timeseriesData: RawStockDailyAdjusted;
	let chartContainer: HTMLElement;

	onMount(() => {
		if (!chartContainer) return;

		const chartOptions: DeepPartial<ChartOptions> = {
			layout: {
				background: { color: 'transparent' },
				textColor: '#d1d5db'
			},
			grid: {
				vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
				horzLines: { color: 'rgba(255, 255, 255, 0.1)' }
			},
			timeScale: {
				borderColor: 'rgba(255, 255, 255, 0.2)'
			},
			rightPriceScale: {
				borderColor: 'rgba(255, 255, 255, 0.2)'
			},
			crosshair: {
				mode: 1 // CrosshairMode.Magnet
			},
			handleScale: {
				mouseWheel: false,
				pinch: true
			},
			handleScroll: {
				mouseWheel: false
			}
		};

		const chart = createChart(chartContainer, chartOptions);

		const areaSeries = chart.addAreaSeries({
			lineColor: '#38bdf8',
			topColor: 'rgba(56, 189, 248, 0.4)',
			bottomColor: 'rgba(56, 189, 248, 0)'
		});

		if (timeseriesData && timeseriesData['Time Series (Daily)']) {
			const fiveYearsAgo = new Date();
			fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

			const formattedData = Object.entries(timeseriesData['Time Series (Daily)'])
				.filter(([dateString, values]) => values && new Date(dateString) >= fiveYearsAgo)
				.map(([date, values]) => ({
					time: date as Time,
					value: parseFloat((values as RawStockDailyAdjustedTimeSeries)['4. close'] ?? '0')
				}))
				.reverse(); // Data needs to be in ascending order

			areaSeries.setData(formattedData);
			chart.timeScale().fitContent();
		}

		const handleResize = () => chart.applyOptions({ width: chartContainer.clientWidth });
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			chart.remove();
		};
	});
</script>

<div bind:this={chartContainer} class="h-96 w-full" />
