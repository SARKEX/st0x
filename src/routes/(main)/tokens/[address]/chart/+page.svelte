<script lang="ts">
	import { onMount } from 'svelte';
	import { currentToken } from '$lib/stores';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	onMount(() => {
		const container = document.getElementById('tradingview_chart');
		if (container) container.innerHTML = '';
		const script = document.createElement('script');
		script.src = 'https://s3.tradingview.com/tv.js';
		script.async = true;
		script.onload = () => {
			// @ts-expect-error - TradingView is a global variable
			if (window.TradingView) {
				const symbol = $currentToken?.symbol?.replace('s1', '') || 'AAPL';
				const height = container ? container.offsetHeight : 700;
				// @ts-expect-error - TradingView is a global variable
				new window.TradingView.widget({
					width: '100%',
					height,
					symbol,
					interval: 'M',
					timezone: 'Etc/UTC',
					theme: 'dark',
					style: '1',
					locale: 'en',
					container_id: 'tradingview_chart'
				});
			}
		};
		document.body.appendChild(script);
	});

	function goBack() {
		// Navigate back to the main token page
		goto($page.url.pathname.replace('/chart', ''));
	}
</script>

<div class="flex h-[calc(100vh-0px)] flex-1 flex-col">
	<!-- Header with Back Button -->
	<div class="flex items-center justify-between border-b border-white/10 bg-gray-800/50 px-6 py-4">
		<button
			on:click={goBack}
			class="flex items-center gap-2 rounded-lg border border-white/20 bg-gray-700/80 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:border-yellow-500/50 hover:bg-gray-600/80"
		>
			← Back
		</button>
		<div class="text-lg font-semibold text-white">
			{$currentToken?.name} {$currentToken?.symbol?.replace('s1', '') || 'Token'}
		</div>
		<div class="w-24"></div> <!-- Spacer for centering -->
	</div>

	<!-- Chart Container -->
	<div class="flex-1">
		<div
			id="tradingview_chart"
			class="h-full w-full bg-[#181A20]"
			style="min-height:0; min-width:0;"
		></div>
	</div>
</div>
