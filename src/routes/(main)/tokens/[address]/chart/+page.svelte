<script lang="ts">
  import { onMount } from 'svelte';
  import { currentToken } from '$lib/stores';

  onMount(() => {
    const container = document.getElementById('tradingview_chart');
    if (container) container.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      if (window.TradingView) {
        const symbol = $currentToken?.symbol?.replace('s1', '') || 'AAPL';
        const height = container ? container.offsetHeight : 700;
        // @ts-ignore
        new window.TradingView.widget({
          width: '100%',
          height,
          symbol,
          interval: 'M',
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          container_id: 'tradingview_chart',
        });
      }
    };
    document.body.appendChild(script);
  });
</script>

<div class="flex-1 h-[calc(100vh-0px)] flex justify-center items-center p-0 m-0">
  <div
    id="tradingview_chart"
    class="w-full h-full bg-[#181A20]"
    style="min-height:0; min-width:0;"
  ></div>
</div>