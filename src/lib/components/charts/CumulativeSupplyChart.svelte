<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createChart,
		LineType,
		type DeepPartial,
		type IChartApi,
		type PriceFormat,
		type ColorType
	} from 'lightweight-charts';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import moment from 'moment';
	import { formatUnits } from 'viem';

	let chartContainer: HTMLElement;
	export let vaults: OffchainAssetReceiptVault[];
	let howManyDays = 30;

	interface SupplyEvent {
		timestamp: number;
		amount: number;
		type: 'deposit' | 'withdraw';
		date: string;
	}

	function aggregateSupplyEvents(vaults: OffchainAssetReceiptVault[]): SupplyEvent[] {
		let events: SupplyEvent[] = [];

		vaults.forEach((vault) => {
			// Add deposits
			vault.deposits.forEach((deposit) => {
				const amount = parseFloat(formatUnits(BigInt(deposit.amount), 18));
				events.push({
					timestamp: parseInt(deposit.timestamp),
					amount: amount,
					type: 'deposit',
					date: moment(parseInt(deposit.timestamp) * 1000).format('DD/MM/YYYY')
				});
			});

			// Add withdrawals (negative amounts)
			vault.withdraws.forEach((withdraw) => {
				const amount = parseFloat(formatUnits(BigInt(withdraw.amount), 18));
				events.push({
					timestamp: parseInt(withdraw.timestamp),
					amount: -amount, // Negative for withdrawals
					type: 'withdraw',
					date: moment(parseInt(withdraw.timestamp) * 1000).format('DD/MM/YYYY')
				});
			});
		});

		return events.sort((a, b) => a.timestamp - b.timestamp);
	}

	function getLastNDaysEvents(events: SupplyEvent[], n: number): SupplyEvent[] {
		const today = new Date();
		const nDaysAgo = new Date(today.getTime() - n * 24 * 60 * 60 * 1000);

		return events.filter((event) => {
			const timestamp = event.timestamp * 1000;
			const eventDate = new Date(timestamp);
			return eventDate >= nDaysAgo;
		});
	}

	function calculateCumulativeSupply(
		events: SupplyEvent[],
		howManyDays: number
	): Array<{ time: string; value: number }> {
		const today = new Date();
		const nDaysAgo = new Date(today.getTime() - howManyDays * 24 * 60 * 60 * 1000);

		// Create daily buckets
		const dailyData = new Map<string, number>();

		// Initialize all days with 0
		for (let i = 0; i < howManyDays; i++) {
			const currentDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const formattedDate = moment(currentDate).format('YYYY-MM-DD');
			dailyData.set(formattedDate, 0);
		}

		// Sort events by timestamp
		const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);

		let cumulativeSupply = 0;
		const cumulativeData: Array<{ time: string; value: number }> = [];

		// Process events chronologically
		sortedEvents.forEach((event) => {
			const eventDate = new Date(event.timestamp * 1000);
			if (eventDate >= nDaysAgo) {
				cumulativeSupply += event.amount;
				const formattedDate = moment(eventDate).format('YYYY-MM-DD');

				// Update the daily data
				dailyData.set(formattedDate, cumulativeSupply);
			}
		});

		// Convert to array and fill gaps
		const sortedDates = Array.from(dailyData.keys()).sort();
		let lastValue = 0;

		sortedDates.forEach((date) => {
			const value = dailyData.get(date) || lastValue;
			if (value > 0) {
				lastValue = value;
			}
			cumulativeData.push({
				time: date,
				value: lastValue
			});
		});

		return cumulativeData;
	}

	let allEvents = aggregateSupplyEvents(vaults);
	let lastNDaysEvents = getLastNDaysEvents(allEvents, howManyDays);
	let cumulativeData = calculateCumulativeSupply(lastNDaysEvents, howManyDays);

	$: if (howManyDays) {
		lastNDaysEvents = getLastNDaysEvents(allEvents, howManyDays);
		cumulativeData = calculateCumulativeSupply(lastNDaysEvents, howManyDays);
	}

	onMount(() => {
		const chart: IChartApi = createChart(chartContainer, {
			width: chartContainer.clientWidth,
			handleScale: {
				mouseWheel: false,
				pinch: false
			},
			handleScroll: false,
			height: 300,
			layout: {
				textColor: '#fff',
				background: { type: 'solid' as ColorType, color: '#181A20' }
			},
			grid: {
				vertLines: {
					color: 'rgba(255,255,255,0.05)'
				},
				horzLines: {
					color: 'rgba(255,255,255,0.1)'
				}
			},
			leftPriceScale: {
				visible: true,
				borderVisible: false
			},
			rightPriceScale: {
				visible: false
			},
			timeScale: {
				borderVisible: false
			}
		});

		chart.timeScale().fitContent();

		const supplyFormatter = {
			type: 'custom',
			formatter: (price: number) => {
				if (price >= 1000000) {
					return (price / 1000000).toFixed(2) + 'M';
				} else if (price >= 1000) {
					return (price / 1000).toFixed(2) + 'K';
				}
				return price.toFixed(2);
			}
		};

		const supplySeries = chart.addLineSeries({
			lineType: LineType.Simple,
			color: 'rgba(76, 175, 80, 1)', // Green color for supply
			lineWidth: 3,
			priceFormat: supplyFormatter as DeepPartial<PriceFormat>
		});
		supplySeries.setData(cumulativeData);

		// Responsively handle resizing
		const handleResize = () => {
			chart.applyOptions({ width: chartContainer.clientWidth });
			chart.resize(chartContainer.clientWidth, 300);
			chart.timeScale().fitContent();
		};
		window.addEventListener('resize', handleResize);

		// Cleanup
		return () => {
			window.removeEventListener('resize', handleResize);
			chart.remove();
		};
	});

	// Reactive statement to update chart when data changes
	$: if (chartContainer && cumulativeData.length > 0) {
		// This will trigger chart updates when cumulativeData changes
	}
</script>

<div
	class="relative h-fit w-full rounded-xl border border-white/10 bg-gray-900 px-2 py-2 sm:px-4 sm:py-4"
>
	<!-- Legend above chart -->
	<div
		class="mb-2 flex flex-col justify-start gap-2 text-xs sm:mb-4 sm:flex-row sm:gap-6 sm:text-sm"
	>
		<div class="flex items-center">
			<span
				class="mr-1.5 h-2.5 w-2.5 rounded-full sm:mr-2 sm:h-3.5 sm:w-3.5"
				style="background-color: rgba(76, 175, 80, 1);"
			></span>
			<span class="text-gray-200">Cumulative Supply</span>
		</div>
	</div>
	<div class="flex flex-row items-center">
		<!-- Y Axis Label -->
		<div class="mr-1 flex flex-col items-center justify-center sm:mr-2" style="min-width: 20px;">
			<span class="-rotate-90 whitespace-nowrap text-[10px] font-medium text-gray-400 sm:text-xs"
				>Supply</span
			>
		</div>
		<!-- Chart Area -->
		<div class="flex-1 overflow-x-auto" style="max-width:100%;">
			<div
				class="w-full rounded-lg bg-gray-800 p-1 sm:p-2"
				style="max-width:100%;min-width:0;"
				bind:this={chartContainer}
			></div>
		</div>
	</div>
	<!-- X Axis Label -->
	<div class="mt-1 flex justify-center sm:mt-2">
		<span class="text-[10px] font-medium text-gray-400 sm:text-xs">Time</span>
	</div>
</div>
