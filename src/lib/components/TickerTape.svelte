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

<div class="w-screen max-w-screen bg-[#23272f] border-b border-white/10 z-[100] relative overflow-x-auto min-h-[48px] sm:min-h-[48px] min-w-0" style="width:100vw;max-width:100vw;">
	<div
		bind:this={container}
		class="w-full min-w-0"
	/>
	{#if paused}
		<div class="absolute inset-0 z-10 bg-black/5 cursor-not-allowed flex items-center justify-center pointer-events-auto min-h-[48px] sm:min-h-[48px] min-w-0"
			on:touchstart|preventDefault|stopPropagation={handleOverlayTap}>
			{#if isMobile}
				<span class="bg-black/80 text-white text-[0.95rem] px-4 py-2 rounded-xl shadow">
					Tap to unlock ticker
				</span>
			{/if}
		</div>
	{/if}
</div>
