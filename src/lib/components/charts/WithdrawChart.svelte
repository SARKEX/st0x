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

	// Define Activity type
	interface Activity {
		type: 'withdraw';
		timestamp: number;
		date: string;
		alt: string;
	}

	let chartContainer: HTMLElement;
	export let vaults: OffchainAssetReceiptVault[];
	let howManyDays = 30;

	interface Withdraw {
		timestamp: string;
		caller: {
			address: string;
		};
		amount: string;
	}

	function formatDate(timestamp: string): string {
		return moment(parseInt(timestamp) * 1000).fromNow();
	}

	let withdrawEvents: Activity[] = [];

	function aggregateEvents(vaults: OffchainAssetReceiptVault[]): Activity[] {
		let events: Activity[] = [];

		vaults.forEach((vault) => {
			withdrawEvents = vault.withdraws.map((withdraw: Withdraw) => ({
				type: 'withdraw' as const,
				timestamp: +withdraw.timestamp,
				date: formatDate(withdraw.timestamp),
				alt: 'Withdraw image alt here'
			}));

			events = events.concat(withdrawEvents);
		});

		return events.sort((a: Activity, b: Activity) => b.timestamp - a.timestamp);
	}

	function getLastNDaysActivities(activities: Activity[], n: number): Activity[] {
		const today = new Date();
		const nDaysAgo = new Date(today.getTime() - n * 24 * 60 * 60 * 1000);

		return activities.filter((activity) => {
			const timestamp = activity.timestamp * 1000;
			const activityDate = new Date(timestamp);
			return activityDate >= nDaysAgo;
		});
	}

	let activities = aggregateEvents(vaults);
	let lastNDaysActivities = getLastNDaysActivities(activities, howManyDays);

	interface DayObject {
		date: string;
		events: Activity[];
	}

	function splitActivitiesByDate(activities: Activity[], howManyDays: number): DayObject[] {
		const today = new Date();
		const twentyOneDaysAgo = new Date(today.getTime() - howManyDays * 24 * 60 * 60 * 1000);

		const activitiesArray: DayObject[] = [];

		for (let i = 0; i < howManyDays; i++) {
			const currentDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(
				currentDate.getMonth() + 1
			)
				.toString()
				.padStart(2, '0')}/${currentDate.getFullYear()}`;

			const dayObject: DayObject = {
				date: formattedDate,
				events: []
			};

			activitiesArray.push(dayObject);
		}

		activities.forEach((activity) => {
			const timestamp = activity.timestamp * 1000;
			const activityDate = new Date(timestamp);

			if (activityDate >= twentyOneDaysAgo) {
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
	let withdrawsByDate = splitActivitiesByDate(
		lastNDaysActivities.filter((act) => act.type === 'withdraw'),
		howManyDays
	);

	$: if (howManyDays) {
		lastNDaysActivities = getLastNDaysActivities(activities, howManyDays);
		activitiesByDate = splitActivitiesByDate(lastNDaysActivities, howManyDays);
		datesArray = activitiesByDate.map((key) => key.date);
		eventCountsArray = activitiesByDate.map((key) => key.events.length);
	}

	export let datesArray: string[] = [];
	export let eventCountsArray: number[] = [];

	onMount(() => {
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
				style="background-color: rgba(239, 83, 80, 1);"
			></span>
			<span class="text-gray-200">Number of Withdraw events</span>
		</div>
	</div>
	<div class="flex flex-row items-center">
		<!-- Y Axis Label -->
		<div class="mr-1 flex flex-col items-center justify-center sm:mr-2" style="min-width: 20px;">
			<span class="-rotate-90 whitespace-nowrap text-[10px] font-medium text-gray-400 sm:text-xs"
				>Events</span
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
		<span class="text-[10px] font-medium text-gray-400 sm:text-xs">Days</span>
	</div>
</div>
