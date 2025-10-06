<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	export let src: string;
	export let config: Record<string, unknown> | null = null;
	export let containerClass = '';

	let container: HTMLDivElement | null = null;
	let currentKey = '';
	let widgetKey = '';

	function renderWidget() {
		if (!container) return;
		if (!config) {
			container.innerHTML = '';
			currentKey = '';
			return;
		}

		const configString = JSON.stringify(config, null, 2);
		const nextKey = `${src}:${configString}`;

		if (currentKey === nextKey) return;
		currentKey = nextKey;

		container.innerHTML = '';

		const widgetContainer = document.createElement('div');
		widgetContainer.className = 'tradingview-widget-container';

		const widget = document.createElement('div');
		widget.className = 'tradingview-widget-container__widget';
		widgetContainer.appendChild(widget);

		const script = document.createElement('script');
		script.type = 'text/javascript';
		script.async = true;
		script.src = src;
		if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
			script.referrerPolicy = 'no-referrer';
		}
		script.innerHTML = configString;

		widgetContainer.appendChild(script);
		container.appendChild(widgetContainer);
	}

	onMount(() => {
		renderWidget();
	});

	$: widgetKey = JSON.stringify([src, config]);
	$: if (container) {
		// Access widgetKey inside the reactive block so config/src changes trigger rerender
		widgetKey;
		renderWidget();
	}

	onDestroy(() => {
		if (container) container.innerHTML = '';
	});
</script>

<div bind:this={container} class={`h-full w-full ${containerClass}`} />
