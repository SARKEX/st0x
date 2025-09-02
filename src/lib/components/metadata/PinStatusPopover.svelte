<script lang="ts">
  export let cid: string;
  let status: 'unknown' | 'pinned' | 'not_found' | 'error' = 'unknown';
  let message = '';

  async function checkStatus() {
    try {
      const res = await fetch('/pinata/pin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid })
      });
      const data = await res.json();
      if (res.ok && data.pinStatus) {
        status = 'pinned';
        message = data.message || 'Pinned';
      } else if (res.status === 404) {
        status = 'not_found';
        message = data.error || 'Not found';
      } else {
        status = 'error';
        message = data.error || 'Error checking status';
      }
    } catch (e) {
      status = 'error';
      message = 'Network error';
    }
  }

  $: cid && checkStatus();
</script>

<div class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-gray-800/70 px-2 py-1 text-xs">
  <span class="text-gray-300">IPFS</span>
  {#if status === 'pinned'}
    <span class="rounded bg-green-500/20 px-1.5 py-0.5 text-green-400">Pinned</span>
  {:else if status === 'not_found'}
    <span class="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400">Not found</span>
  {:else if status === 'error'}
    <span class="rounded bg-red-500/20 px-1.5 py-0.5 text-red-400">Error</span>
  {:else}
    <span class="text-gray-400">Checking…</span>
  {/if}
</div>

