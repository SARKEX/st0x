<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createChart,
		LineType,
		type DeepPartial,
		type IChartApi,
		type PriceFormat
	} from 'lightweight-charts';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import moment from 'moment';
	import type { Activity } from '$lib/types/ActivityTypes';

	let chartContainer: HTMLElement;
	export let vaults;
	let howManyDays = 30;

	interface Withdraw {
		timestamp: string;
		caller: {
			address: string;
		};
		amount: string;
	}

	interface Deposit {
		timestamp: string;
		caller: {
			address: string;
		};
		amount: string;
	}

	function formatDate(timestamp: string): string {
		return moment(parseInt(timestamp) * 1000).fromNow();
	}

	let depositEvents = [];
	let withdrawEvents = [];

	function aggregateEvents(vaults: OffchainAssetReceiptVault[]): unknown[] {
		let events: unknown[] = [];

		vaults.forEach((vault) => {
			withdrawEvents = vault.withdraws.map((withdraw: Withdraw) => ({
				type: 'withdraw',
				timestamp: +withdraw.timestamp,
				date: formatDate(withdraw.timestamp),
				alt: 'Withdraw image alt here'
			}));

			depositEvents = vault.deposits.map((deposit: Deposit) => ({
				type: 'deposit',
				timestamp: +deposit.timestamp,
				date: formatDate(deposit.timestamp),
				alt: 'Deposit image alt here'
			}));

			events = events.concat(withdrawEvents, depositEvents);
		});

		return events.sort((a, b) => b.timestamp - a.timestamp);
	}

	function getLastNDaysActivities(activities: Activity[], n: number) {
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

	function splitActivitiesByDate(activities, howManyDays: number) {
		const today = new Date();
		const twentyOneDaysAgo = new Date(today.getTime() - howManyDays * 24 * 60 * 60 * 1000);

		const activitiesArray = [];

		for (let i = 0; i < howManyDays; i++) {
			const currentDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`;

			const dayObject = {
				date: formattedDate,
				events: []
			};

			activitiesArray.push(dayObject);
		}

		// Fill in activities for each day
		activities.forEach((activity) => {
			const timestamp = activity.timestamp * 1000; // Convert timestamp to milliseconds
			const activityDate = new Date(timestamp);

			// Check if the activity date is within the last 21 days
			if (activityDate >= twentyOneDaysAgo) {
				// Format the activity date as "DD/MM/YYYY"
				const formattedDate = `${activityDate.getDate().toString().padStart(2, '0')}/${(activityDate.getMonth() + 1).toString().padStart(2, '0')}/${activityDate.getFullYear()}`;
				// Find the corresponding day object in the activities array
				const dayObject = activitiesArray.find((day) => day.date === formattedDate);
				// Push the activity to the events array of the corresponding day object
				dayObject?.events?.push(activity);
			}
		});
		return activitiesArray;
	}

	let activitiesByDate = splitActivitiesByDate(lastNDaysActivities, howManyDays);
	let withdrawsByDate = splitActivitiesByDate(
		lastNDaysActivities.filter((act) => act.type === 'withdraw'),
		howManyDays
	);
	let depositsByDate = splitActivitiesByDate(
		lastNDaysActivities.filter((act) => act.type === 'deposit'),
		howManyDays
	);

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
		const mappedDepositData = depositsByDate
			.map((key) => {
				return {
					time: moment(key.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
					value: key.events.length
				};
			})
			.reverse();

		const mappedWithdrawsData = withdrawsByDate
			.map((key) => {
				return {
					time: moment(key.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
					value: key.events.length
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
			height: 300,
			layout: {
				textColor: '#fff',
				background: { type: 'solid', color: '#181A20' }
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

		const noDecimalsFormatter = {
			type: 'custom',
			formatter: (price: number) => price.toFixed(0)
		};

		const withdrawsSeries = chart.addLineSeries({
			lineType: LineType.Simple,
			color: 'rgba(239, 83, 80, 1)',
			lineWidth: 2,
			priceFormat: noDecimalsFormatter as DeepPartial<PriceFormat>
		});
		withdrawsSeries.setData(mappedWithdrawsData);

		const depositsSeries = chart.addLineSeries({
			lineType: LineType.Simple,
			color: 'rgba(33, 150, 243, 1)',
			lineWidth: 2,
			priceFormat: noDecimalsFormatter as DeepPartial<PriceFormat>
		});
		depositsSeries.setData(mappedDepositData);

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
</script>

<div class="relative h-fit w-full px-2 sm:px-4 py-2 sm:py-4 bg-gray-900 rounded-xl border border-white/10">
	<!-- Legend above chart -->
	<div class="mb-2 sm:mb-4 flex flex-col sm:flex-row justify-start gap-2 sm:gap-6 text-xs sm:text-sm">
		<div class="flex items-center">
			<span class="mr-1.5 sm:mr-2 h-2.5 sm:h-3.5 w-2.5 sm:w-3.5 rounded-full" style="background-color: rgba(33, 150, 243, 1);"></span>
			<span class="text-gray-200">Number of Deposit events</span>
		</div>
		<div class="flex items-center">
			<span class="mr-1.5 sm:mr-2 h-2.5 sm:h-3.5 w-2.5 sm:w-3.5 rounded-full" style="background-color: rgba(255, 82, 82, 1);"></span>
			<span class="text-gray-200">Number of Withdraw events</span>
		</div>
	</div>
	<div class="flex flex-row items-center">
		<!-- Y Axis Label -->
		<div class="flex flex-col items-center justify-center mr-1 sm:mr-2" style="min-width: 20px;">
			<span class="text-[10px] sm:text-xs font-medium text-gray-400 -rotate-90 whitespace-nowrap">Events</span>
		</div>
		<!-- Chart Area -->
		<div class="flex-1 overflow-x-auto" style="max-width:100%;">
			<div class="bg-gray-800 rounded-lg p-1 sm:p-2 w-full" style="max-width:100%;min-width:0;" bind:this={chartContainer}></div>
		</div>
	</div>
	<!-- X Axis Label -->
	<div class="flex justify-center mt-1 sm:mt-2">
		<span class="text-[10px] sm:text-xs font-medium text-gray-400">Days</span>
	</div>
</div>
