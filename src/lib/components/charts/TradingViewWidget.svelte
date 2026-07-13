<script lang="ts">
	import TradingViewEmbed from './TradingViewEmbed.svelte';
	import { theme as appTheme } from '$lib/stores/themeStore';

	export let widgetType:
		| 'symbol-profile'
		| 'symbol-overview'
		| 'financials'
		| 'timeline'
		| 'technical-analysis'
		| 'symbol-info';
	export let symbol: string | undefined;
	export let locale = 'en';
	// Follows the app theme by default so widgets aren't stuck light in dark mode.
	// An explicit prop still wins; otherwise it tracks themeStore and re-renders on toggle.
	export let colorTheme: 'light' | 'dark' | undefined = undefined;
	$: effectiveColorTheme = colorTheme ?? $appTheme;
	export let width = '100%';
	export let height: string | number = '480';
	export let isTransparent = false;
	// TradingView quirk (verified empirically): isTransparent:true forces a LIGHT skin
	// even when colorTheme is 'dark', which left every widget white in dark mode. So only
	// keep transparency in light mode — where it renders correctly — and force an opaque
	// (dark) background in dark mode.
	$: effectiveTransparent = isTransparent && effectiveColorTheme === 'light';
	export let containerClass = '';

	// Widget-specific props
	export let displayMode: 'regular' | 'compact' | 'adaptive' = 'regular';
	export let showIntervalTabs = true;
	export let interval = '1D';
	export let displayName: string | undefined = undefined;
	export let autosize = true;
	export let showVolume = false;
	export let showMA = false;
	export let dateRange = '1D';
	export let lineWidth = 2;

	const widgetSources: Record<typeof widgetType, string> = {
		'symbol-profile':
			'https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js',
		'symbol-overview':
			'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js',
		financials: 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',
		timeline: 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js',
		'technical-analysis':
			'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js',
		'symbol-info': 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js'
	};

	function normaliseHeight(value: string | number): string | number {
		if (typeof value === 'number') return value;
		return value || '100%';
	}

	$: src = widgetSources[widgetType];

	$: config = (() => {
		if (!symbol) return null;

		const baseConfig = {
			symbol,
			width,
			height: normaliseHeight(height),
			locale,
			colorTheme: effectiveColorTheme,
			isTransparent: effectiveTransparent
		};

		switch (widgetType) {
			case 'symbol-profile':
				return baseConfig;

			case 'symbol-overview':
				return {
					...baseConfig,
					autosize,
					symbols: [[displayName ?? symbol, `${symbol}|${dateRange}`]],
					showSymbolLogo: true,
					lineWidth,
					chartOnly: false,
					showVolume,
					showMA,
					maLineColor: '#f59e0b',
					headerFontSize: 'medium'
				};

			case 'financials':
				return {
					...baseConfig,
					displayMode
				};

			case 'timeline':
				return {
					...baseConfig,
					feedMode: 'symbol',
					displayMode
				};

			case 'technical-analysis':
				return {
					...baseConfig,
					interval,
					showIntervalTabs
				};

			case 'symbol-info':
				return {
					...baseConfig,
					showIntervalTabs
				};

			default:
				return baseConfig;
		}
	})();
</script>

{#if symbol}
	<TradingViewEmbed {src} {config} {containerClass} />
{:else}
	<slot name="fallback">
		{#if widgetType === 'financials'}
			<div class="px-4 py-6 text-sm text-text-2">
				TradingView fundamentals are unavailable for this token.
			</div>
		{/if}
	</slot>
{/if}
