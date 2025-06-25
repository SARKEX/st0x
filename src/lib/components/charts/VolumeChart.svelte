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
	import moment from 'moment';
	import type { SgTrade, SgErc20 } from '@rainlanguage/orderbook/js_api';

	import Select from '$lib/components/Select.svelte';

	let chartContainer: HTMLElement;
	export let trades: SgTrade[] = [];
	let howManyDays = 30;

	// Get unique tokens from trades
	function getUniqueTokens(trades: SgTrade[]): SgErc20[] {
		const tokens = new Map<string, SgErc20>();

		trades.forEach((trade) => {
			// Add input token
			const inputToken = trade.inputVaultBalanceChange.vault.token;
			tokens.set(inputToken.address, inputToken);

			// Add output token
			const outputToken = trade.outputVaultBalanceChange.vault.token;
			tokens.set(outputToken.address, outputToken);
		});

		return Array.from(tokens.values());
	}

	const availableTokens = getUniqueTokens(trades);
	let selectedToken: SgErc20 = availableTokens[0] || {
		address: '',
		symbol: '',
		name: '',
		decimals: ''
	};

	function getTokenLabel(token: SgErc20): string {
		return token.symbol || '';
	}

	// Calculate volume for a specific token
	function calculateTokenVolume(
		trades: SgTrade[],
		tokenAddress: string
	): { date: string; volume: number }[] {
		const volumeByDate = new Map<string, number>();

		trades.forEach((trade) => {
			// Check if this trade involves the selected token
			const inputToken = trade.inputVaultBalanceChange.vault.token;
			const outputToken = trade.outputVaultBalanceChange.vault.token;

			let volume = 0;
			let tradeDate = '';
			let decimals = 0;

			if (inputToken.address === tokenAddress) {
				const amount = Math.abs(parseInt(trade.inputVaultBalanceChange.amount) || 0);
				decimals = parseInt(inputToken.decimals || '0') || 0;
				volume = amount / Math.pow(10, decimals);
				// Use the actual trade timestamp
				tradeDate = moment.unix(Number(trade.timestamp)).format('DD/MM/YYYY');
			} else if (outputToken.address === tokenAddress) {
				const amount = Math.abs(parseInt(trade.outputVaultBalanceChange.amount) || 0);
				decimals = parseInt(outputToken.decimals || '0') || 0;
				volume = amount / Math.pow(10, decimals);
				tradeDate = moment.unix(Number(trade.timestamp)).format('DD/MM/YYYY');
			}

			if (volume > 0 && tradeDate) {
				const existingVolume = volumeByDate.get(tradeDate) || 0;
				volumeByDate.set(tradeDate, existingVolume + volume);
			}
		});

		return Array.from(volumeByDate.entries()).map(([date, volume]) => ({
			date,
			volume
		}));
	}

	function splitVolumeByDate(volumeData: { date: string; volume: number }[], howManyDays: number) {
		const today = new Date();

		const volumeArray: { date: string; volume: number }[] = [];

		for (let i = 0; i < howManyDays; i++) {
			const currentDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(
				currentDate.getMonth() + 1
			)
				.toString()
				.padStart(2, '0')}/${currentDate.getFullYear()}`;

			const volumeDataPoint = volumeData.find((v) => v.date === formattedDate);
			volumeArray.push({
				date: formattedDate,
				volume: volumeDataPoint?.volume || 0
			});
		}

		return volumeArray.reverse();
	}

	$: if (selectedToken && trades) {
		const tokenVolumeData = calculateTokenVolume(trades, selectedToken.address);
		volumeByDate = splitVolumeByDate(tokenVolumeData, howManyDays);
	}

	let volumeByDate: { date: string; volume: number }[] = [];
	let chart: IChartApi | null = null;

	onMount(() => {
		if (!selectedToken || !trades.length) return;

		const mappedVolumeData = volumeByDate.map((key) => {
			return {
				time: moment(key.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
				value: key.volume
			};
		});

		chart = createChart(chartContainer, {
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

		const volumeFormatter = {
			type: 'custom',
			formatter: (price: number) => {
				if (price >= 1000000) {
					return (price / 1000000).toFixed(1) + 'M';
				} else if (price >= 1000) {
					return (price / 1000).toFixed(1) + 'K';
				}
				return price.toFixed(0);
			}
		};

		const volumeSeries = chart.addLineSeries({
			lineType: LineType.Simple,
			color: 'rgba(76, 175, 80, 1)', // Green color for volume
			lineWidth: 2,
			priceFormat: volumeFormatter as DeepPartial<PriceFormat>
		});
		volumeSeries.setData(mappedVolumeData);

		// Responsively handle resizing
		const handleResize = () => {
			if (chart) {
				chart.applyOptions({ width: chartContainer.clientWidth });
				chart.resize(chartContainer.clientWidth, 300);
				chart.timeScale().fitContent();
			}
		};
		window.addEventListener('resize', handleResize);

		// Cleanup
		return () => {
			window.removeEventListener('resize', handleResize);
			if (chart) {
				chart.remove();
			}
		};
	});

	// Reactive statement to update chart when token selection changes
	$: if (selectedToken && chartContainer && chart) {
		const tokenVolumeData = calculateTokenVolume(trades, selectedToken.address);
		volumeByDate = splitVolumeByDate(tokenVolumeData, howManyDays);

		const mappedVolumeData = volumeByDate.map((key) => {
			return {
				time: moment(key.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
				value: key.volume
			};
		});

		// Clear existing series and add new data
		chart.remove();
		chart = createChart(chartContainer, {
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

		const volumeFormatter = {
			type: 'custom',
			formatter: (price: number) => {
				if (price >= 1000000) {
					return (price / 1000000).toFixed(1) + 'M';
				} else if (price >= 1000) {
					return (price / 1000).toFixed(1) + 'K';
				}
				return price.toFixed(0);
			}
		};

		const volumeSeries = chart.addLineSeries({
			lineType: LineType.Simple,
			color: 'rgba(76, 175, 80, 1)', // Green color for volume
			lineWidth: 2,
			priceFormat: volumeFormatter as DeepPartial<PriceFormat>
		});
		volumeSeries.setData(mappedVolumeData);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
		<h3 class="text-base sm:text-lg font-semibold text-white">Trading Volume</h3>
		<div class="w-full sm:w-48">
			<Select
				options={availableTokens}
				bind:selected={selectedToken}
				getOptionLabel={getTokenLabel}
				dataTestId="token-selector"
			/>
		</div>
	</div>

	<div class="rounded-lg bg-gray-800/50 p-3 sm:p-4">
		<div bind:this={chartContainer} class="w-full"></div>
	</div>

	<div class="text-xs sm:text-sm text-gray-400">
		Showing volume for {selectedToken.symbol} over the last {howManyDays} days
	</div>
</div>
