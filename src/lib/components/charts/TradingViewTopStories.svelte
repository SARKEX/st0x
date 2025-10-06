<script lang="ts">
	import TradingViewEmbed from './TradingViewEmbed.svelte';

	export let symbol: string | undefined;
	export let locale = 'en';
	export let colorTheme: 'light' | 'dark' = 'dark';
	export let width = '100%';
	export let height = '600';
	export let isTransparent = false;
	export let displayMode: 'regular' | 'compact' | 'adaptive' = 'adaptive';
	export let containerClass = 'bg-gray-900 text-white';

	const src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';

	$: config = symbol
		? {
				feedMode: 'symbol',
				symbol,
				width,
				height,
				locale,
				colorTheme,
				isTransparent,
				displayMode
			}
		: null;
</script>

{#if symbol}
	<TradingViewEmbed {src} {config} {containerClass} />
{:else}
	<slot name="fallback" />
{/if}
