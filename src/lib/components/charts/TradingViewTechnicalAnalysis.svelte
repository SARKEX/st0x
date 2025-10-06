<script lang="ts">
	import TradingViewEmbed from './TradingViewEmbed.svelte';

	export let symbol: string | undefined;
	export let interval = '1D';
	export let locale = 'en';
	export let colorTheme: 'light' | 'dark' = 'dark';
	export let width = '100%';
	export let height = '480';
	export let isTransparent = false;
	export let showIntervalTabs = true;

	const src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';

	$: config = symbol
		? {
				symbol,
				interval,
				width,
				height,
				locale,
				colorTheme,
				isTransparent,
				showIntervalTabs
			}
		: null;
</script>

{#if symbol}
	<TradingViewEmbed {src} {config} />
{:else}
	<slot name="fallback" />
{/if}
