<script lang="ts">
	import TradingViewEmbed from './TradingViewEmbed.svelte';

	export let symbol: string | undefined;
	export let displayName: string | undefined;
	export let locale = 'en';
	export let colorTheme: 'light' | 'dark' = 'dark';
	export let autosize = true;
	export let showVolume = false;
	export let showMA = false;
	export let dateRange = '1D';
	export let lineWidth = 2;
	export let height = '100%';

	const src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';

	$: config = symbol
		? {
			width: '100%',
			height,
			autosize,
			symbols: [
				[
					displayName ?? symbol,
					`${symbol}|${dateRange}`
				]
			],
			showSymbolLogo: true,
			isTransparent: false,
			locale,
			lineWidth,
			colorTheme,
			chartOnly: false,
			showVolume,
			showMA,
			maLineColor: '#f59e0b',
			headerFontSize: 'medium'
		}
		: null;
</script>

{#if symbol}
	<TradingViewEmbed {src} {config} />
{:else}
	<slot name="fallback" />
{/if}
