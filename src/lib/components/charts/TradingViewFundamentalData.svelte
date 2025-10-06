<script lang="ts">
	import TradingViewEmbed from './TradingViewEmbed.svelte';

	export let symbol: string | undefined;
	export let locale = 'en';
	export let colorTheme: 'light' | 'dark' = 'dark';
	export let width = '100%';
	export let height: string | number = 550;
	export let isTransparent = false;
	export let displayMode: 'regular' | 'compact' = 'regular';

	const src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';

	function normaliseHeight(value: string | number): string | number {
		if (typeof value === 'number') return value;
		return value || '100%';
	}

	$: config = symbol
		? {
				symbol,
				colorTheme,
				displayMode,
				isTransparent,
				locale,
				width,
				height: normaliseHeight(height)
			}
		: null;
</script>

{#if symbol}
	<TradingViewEmbed {src} {config} />
{:else}
	<slot name="fallback">
		<div class="px-4 py-6 text-sm text-gray-400">
			TradingView fundamentals are unavailable for this token.
		</div>
	</slot>
{/if}
