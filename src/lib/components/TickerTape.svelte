<script lang="ts">
	import { STOXs } from '$lib/network';
	import { onMount } from 'svelte';
	import { onDestroy } from 'svelte';
	let container: HTMLDivElement;
	let paused = false;
	let tapTimeout: ReturnType<typeof setTimeout> | null = null;
	let isMobile = false;

	function checkMobile() {
		isMobile = window.innerWidth < 640;
	}

	// On mobile, overlay is present by default
	onMount(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);
		if (isMobile) paused = true;

		// Build the symbols array for all STOXs, with fallback for undefined symbol
		if (container) {
			const symbols = STOXs.map((stox) => {
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
					${symbols.map((s) => `{ "proName": "${s.proName}", "title": "${s.title}" }`).join(',\n')}
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

	onDestroy(() => {
		if (tapTimeout) clearTimeout(tapTimeout);
		window.removeEventListener('resize', checkMobile);
	});

	// On mobile, tap overlay to unlock ticker for 10s
	function handleOverlayTap() {
		if (isMobile) {
			paused = false;
			if (tapTimeout) clearTimeout(tapTimeout);
			tapTimeout = setTimeout(() => (paused = true), 10000);
		}
	}
</script>

<div class="ticker-tape-wrapper" style="position:relative; width:100%; max-width:100vw;">
	<div
		bind:this={container}
		class="ticker-tape-inner w-full"
		on:touchstart|preventDefault|stopPropagation={handleOverlayTap}
	/>
	{#if paused}
		<div class="ticker-tape-overlay" on:touchstart|preventDefault|stopPropagation={handleOverlayTap}>
			{#if isMobile}
				<span class="ticker-tape-overlay-message">Tap to unlock ticker</span>
			{/if}
		</div>
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
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		background: rgba(0, 0, 0, 0.01); /* nearly transparent, just to block pointer events */
		cursor: not-allowed;
		pointer-events: all;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ticker-tape-overlay-message {
		background: rgba(30,30,30,0.85);
		color: #fff;
		font-size: 0.95rem;
		padding: 0.4em 1em;
		border-radius: 1em;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
