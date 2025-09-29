<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadTradingView } from '$lib/utils/tradingview';

	export let symbol: string | undefined;
	export let interval = '60';
	export let theme: 'dark' | 'light' = 'dark';
	export let locale = 'en';
	export let studies: string[] = [];
	export let hideTopToolbar = false;
	export let hideSideToolbar = false;
	export let withdateranges = false;
	export let autosize = true;
	export let timezone = 'Etc/UTC';
	export let containerClass = '';
	export let toolbarBg = '#1f2937';
	export let disabledFeatures: string[] = ['header_compare', 'header_symbol_search'];
	export let enabledFeatures: string[] = [];

	let containerId = `tv-widget-${Math.random().toString(36).slice(2)}`;
	let widget: { remove?: () => void } | null = null;
	let mounted = false;
	let lastSymbol: string | undefined;

	async function createWidget() {
		if (!mounted || !symbol) return;

		const currentId = containerId;
		const TradingView = await loadTradingView();
		await tick();
		if (!mounted || !symbol || currentId !== containerId) return;

		const containerEl = document.getElementById(containerId);
		if (!containerEl) return;

		try {
			widget = new TradingView.widget({
			symbol,
			interval,
			theme,
			locale,
			studies,
			autosize,
			timezone,
			container_id: containerId,
			hide_top_toolbar: hideTopToolbar,
			hide_side_toolbar: hideSideToolbar,
			withdateranges,
			toolbar_bg: toolbarBg,
			disabled_features: disabledFeatures,
			enabled_features: enabledFeatures
			});
		} catch (err) {
			console.warn('[tradingview] failed to create widget', err);
			widget = null;
			return;
		}

		lastSymbol = symbol;
	}

	onMount(() => {
		mounted = true;
		createWidget();
	});

	onDestroy(() => {
		mounted = false;
		widget = null;
	});

	$: if (mounted && symbol && symbol !== lastSymbol) {
		createWidget();
	}
</script>

<div class={`h-full w-full ${containerClass}`} id={containerId} />
