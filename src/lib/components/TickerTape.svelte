<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import { currentNetwork } from '$lib/stores';
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

		// Build the symbols array for all TOKENS, with fallback for undefined symbol
		if (container && $currentNetwork) {
			const networkTokens = getAllTokensByNetwork($currentNetwork.chainId);
			const symbols = networkTokens.map((stox) => {
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

<div
	class="max-w-screen relative z-[100] min-h-[48px] w-screen min-w-0 overflow-x-auto border-b border-white/10 bg-[#23272f] sm:min-h-[48px]"
	style="width:100vw;max-width:100vw;"
>
	<div bind:this={container} class="w-full min-w-0" />
	{#if paused}
		<div
			class="pointer-events-auto absolute inset-0 z-10 flex min-h-[48px] min-w-0 cursor-not-allowed items-center justify-center bg-black/5 sm:min-h-[48px]"
			on:touchstart|preventDefault|stopPropagation={handleOverlayTap}
		>
			{#if isMobile}
				<span class="rounded-xl bg-black/80 px-4 py-2 text-[0.95rem] text-white shadow">
					Tap to unlock ticker
				</span>
			{/if}
		</div>
	{/if}
</div>
