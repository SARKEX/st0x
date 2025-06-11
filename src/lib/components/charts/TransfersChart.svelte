<script lang="ts">
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';

	import { onMount } from 'svelte';
	import { createChart, type IChartApi } from 'lightweight-charts';
	import moment from 'moment';

	export let vaults;
	let chartContainer: HTMLElement;
	let howManyDays = 30;

	type VaultChartEvent = {
		type: string;
		timestamp: number;
		date: string;
		eventDetails: ShareTransfer;
	};

	interface ShareTransfer {
		id: string;
		timestamp: string;
		from: {
			address: string;
		};
		to: {
			address: string;
		};
		value: string;
	}

	interface DayWithActivities {
		date: string;
		events: VaultChartEvent[];
		totalValue?: number;
	}

	function formatDate(timestamp: string): string {
		return moment(parseInt(timestamp) * 1000).fromNow();
	}

	function aggregateEvents(vaults: OffchainAssetReceiptVault[]): VaultChartEvent[] {
		let events: VaultChartEvent[] = [];

		vaults.forEach((vault) => {
			let shareTransferEvents = vault.shareTransfers.map((transfer: ShareTransfer) => ({
				type: 'shareTransfer',
				timestamp: +transfer.timestamp,
				date: formatDate(transfer.timestamp),
				eventDetails: transfer
			}));

			events = events.concat(shareTransferEvents);
		});

		return events.sort((a, b) => b.timestamp - a.timestamp);
	}

	function getLastNDaysActivities(activities: VaultChartEvent[], n: number) {
		const today = new Date();
		const nDaysAgo = new Date(today.getTime() - n * 24 * 60 * 60 * 1000); // Calculate date n days ago

		// Filter activities that occurred in the last n days
		const lastNDaysActivities = activities.filter((activity) => {
			const timestamp = activity.timestamp * 1000; // Convert timestamp to milliseconds
			const activityDate = new Date(timestamp);
			return activityDate >= nDaysAgo; // Check if the activity date is within the last n days
		});

		return lastNDaysActivities;
	}

	let activities = aggregateEvents(vaults);
	let lastNDaysActivities = getLastNDaysActivities(activities, howManyDays);

	function splitActivitiesByDate(activities: VaultChartEvent[], howManyDays: number) {
		const today = new Date();
		const nDaysAgo = new Date(today.getTime() - howManyDays * 24 * 60 * 60 * 1000);

		const activitiesArray: DayWithActivities[] = [];

		for (let i = 0; i < howManyDays; i++) {
			const currentDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(
				currentDate.getMonth() + 1
			)
				.toString()
				.padStart(2, '0')}/${currentDate.getFullYear()}`;

			const dayObject = {
				date: formattedDate,
				events: []
			};

			activitiesArray.push(dayObject);
		}

		activities.forEach((activity) => {
			const timestamp = activity.timestamp * 1000;
			const activityDate = new Date(timestamp);

			if (activityDate >= nDaysAgo) {
				const formattedDate = `${activityDate.getDate().toString().padStart(2, '0')}/${(
					activityDate.getMonth() + 1
				)
					.toString()
					.padStart(2, '0')}/${activityDate.getFullYear()}`;

				const dayObject = activitiesArray.find((day) => day.date === formattedDate);

				dayObject?.events?.push(activity);
			}
		});
		return activitiesArray;
	}

	let activitiesByDate = splitActivitiesByDate(lastNDaysActivities, howManyDays);
	let activitiesWithTotal = activitiesByDate.map((date) => {
		return {
			...date,
			totalValue: date.events.reduce((acc, curr) => acc + +curr.eventDetails.value, 0)
		};
	});

	$: if (howManyDays) {
		lastNDaysActivities = getLastNDaysActivities(activities, howManyDays);
		activitiesByDate = splitActivitiesByDate(lastNDaysActivities, howManyDays);
		activitiesByDate.forEach((key) => {
			datesArray.push(key.date);
		});
		activitiesByDate.forEach((key) => {
			eventCountsArray.push(key.events.length);
		});
	}

	export let datesArray: string[] = [];
	export let eventCountsArray: number[] = [];

	onMount(() => {
		const mappedTransfersData = activitiesWithTotal
			.map((key) => {
				return {
					time: moment(key.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
					value: key.totalValue
				};
			})
			.reverse();

		const chart: IChartApi = createChart(chartContainer, {
			width: chartContainer.clientWidth,
			handleScale: {
				mouseWheel: false,
				pinch: false
			},
			handleScroll: false,
			height: window.innerWidth < 640 ? 250 : 300,
			layout: {
				textColor: '#fff',
				background: { color: '#181A20' },
				fontSize: window.innerWidth < 640 ? 10 : 12
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
				borderVisible: false,
				scaleMargins: {
					top: 0.1,
					bottom: 0.1
				}
			},
			rightPriceScale: {
				visible: false
			},
			timeScale: {
				borderVisible: false,
				fixLeftEdge: true,
				fixRightEdge: true,
				timeVisible: true,
				secondsVisible: false
			}
		});

		chart.timeScale().fitContent();

		let transferSeries = chart.addHistogramSeries({
			color: '#2196F3',
			priceFormat: {
				type: 'volume'
			}
		});

		transferSeries.setData(mappedTransfersData);

		chart.priceScale('left').applyOptions({
			autoScale: true
		});

		// Responsively handle resizing
		const handleResize = () => {
			const isMobile = window.innerWidth < 640;
			chart.applyOptions({
				width: chartContainer.clientWidth,
				height: isMobile ? 250 : 300,
				layout: {
					fontSize: isMobile ? 10 : 12
				}
			});
			chart.timeScale().fitContent();
		};
		window.addEventListener('resize', handleResize);

		// Cleanup
		return () => {
			window.removeEventListener('resize', handleResize);
			chart.remove();
		};
	});
</script>

<div
	class="relative h-fit w-full rounded-xl border border-white/10 px-2 py-2 sm:px-4 sm:py-4"
	data-testid="chart-container"
>
	<!-- Legend above chart -->
	<div class="mb-2 flex flex-row justify-start gap-3 text-xs sm:mb-4 sm:gap-6 sm:text-sm">
		<div class="flex items-center">
			<span
				class="mr-1.5 h-2.5 w-2.5 rounded-full sm:mr-2 sm:h-3.5 sm:w-3.5"
				style="background-color: #2196F3;"
			></span>
			<span class="text-gray-200">Tokens transfers</span>
		</div>
	</div>
	<div class="flex w-full flex-row items-center justify-center">
		<!-- Y Axis Label -->
		<span class="-rotate-90 whitespace-nowrap text-[10px] font-medium text-gray-400 sm:text-xs"
			>Transfers</span
		>
		<!-- Chart Area -->
		<div class="flex-1 overflow-x-auto" style="max-width:100%;">
			<div
				class="w-full rounded-lg p-1 sm:p-2"
				style="max-width:100%;min-width:0;"
				bind:this={chartContainer}
			></div>
		</div>
	</div>
	<!-- X Axis Label -->
	<div class="mt-1 flex justify-center sm:mt-2">
		<span class="text-[10px] font-medium text-gray-400 sm:text-xs">Days</span>
	</div>
</div>
