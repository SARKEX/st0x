<script lang="ts">
	import { STOXs } from '$lib/network';
	import { onMount } from 'svelte';
	import { onDestroy } from 'svelte';
	let container: HTMLDivElement;
	let paused = false;
	let tapTimeout: ReturnType<typeof setTimeout> | null = null;

	// Pause on tap for mobile, block navigation on first tap
	function handleTap(event: TouchEvent) {
		if (window.innerWidth < 640) {
			if (!paused) {
				paused = true;
				event.preventDefault();
				event.stopPropagation();
				// Auto-unpause after 10 seconds
				if (tapTimeout) clearTimeout(tapTimeout);
				tapTimeout = setTimeout(() => (paused = false), 10000);
			} else {
				paused = false;
				if (tapTimeout) clearTimeout(tapTimeout);
			}
		}
	}

	onDestroy(() => {
		if (tapTimeout) clearTimeout(tapTimeout);
	});

	onMount(() => {
		if (container) {
			// Build the symbols array for all STOXs, with fallback for undefined symbol
			const symbols = STOXs.map(stox => {
				const baseSymbol = stox.symbol ? stox.symbol.replace('s1', '') : '';
				return {
					proName: `NASDAQ:${baseSymbol}`,
					title: stox.name || baseSymbol
				};
			});

			// Set up the widget container
			container.innerHTML = `
				<div class="tradingview-widget-container">
					<div class="tradingview-widget-container__widget"></div>
				</div>
			`;
			// Create the TradingView script
			const script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
			script.async = true;
			script.innerHTML = `{
				"symbols": [
					${symbols.map(s => `{ \"proName\": \"${s.proName}\", \"title\": \"${s.title}\" }`).join(',\n')}
				],
				"showSymbolLogo": true,
				"colorTheme": "dark",
				"isTransparent": false,
				"displayMode": "adaptive",
				"locale": "en"
			}`;
			// Append the script to the widget container
			const widgetContainer = container.querySelector('.tradingview-widget-container__widget');
			if (widgetContainer) {
				widgetContainer.appendChild(script);
			} else {
				container.appendChild(script);
			}
		}
	});
</script>

<div class="ticker-tape-wrapper" style="position:relative; width:100%; max-width:100vw;">
	<div
		bind:this={container}
		class="w-full ticker-tape-inner"
		on:touchstart|preventDefault|stopPropagation={handleTap}
	/>
	{#if paused}
		<div class="ticker-tape-overlay" on:touchstart|preventDefault|stopPropagation={() => {}}></div>
	{/if}
</div>

<style>
	/* Custom styles for the ticker tape */
	:global(#ticker-tape-container) {
		background: transparent !important;
	}
	
	:global(#ticker-tape-container .tv-ticker-tape) {
		background: transparent !important;
	}

	.ticker-tape-wrapper {
		width: 100%;
		max-width: 100vw;
		overflow-x: auto;
		min-height: 48px;
	}
	.ticker-tape-inner {
		width: 100%;
		min-width: 0;
	}
	.ticker-tape-overlay {
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		z-index: 10;
		background: rgba(0,0,0,0.01); /* nearly transparent, just to block pointer events */
		cursor: not-allowed;
		pointer-events: all;
	}
	@media (hover: hover) and (pointer: fine) {
		.ticker-tape-wrapper:hover .ticker-tape-overlay {
			display: block;
		}
		.ticker-tape-overlay {
			display: none;
		}
	}
	@media (max-width: 640px) {
		.ticker-tape-wrapper {
			min-height: 40px;
			padding-left: 0;
			padding-right: 0;
		}
	}
</style> 