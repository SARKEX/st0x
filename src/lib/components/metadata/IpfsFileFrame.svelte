<script lang="ts">
  export let cid: string;
  let contentType = '';
  let text: string | null = null;
  let blobUrl: string | null = null;
  let error: string | null = null;

  async function load() {
    error = null; text = null; blobUrl = null; contentType='';
    try {
      const res = await fetch('/pinata/retrieve', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cid })
      });
      const data = await res.json();
      if (!res.ok) { error = data?.message || 'Failed to load'; return; }
      contentType = data.contentType || '';
      if (typeof data.data === 'string' && (contentType.startsWith('text/plain') || contentType.startsWith('text/csv'))) {
        text = data.data;
      } else if (Array.isArray(data.data)) {
        const bytes = new Uint8Array(data.data);
        const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
        blobUrl = URL.createObjectURL(blob);
      } else {
        error = 'Unsupported content';
      }
    } catch {
      error = 'Network error';
    }
  }

  $: cid && load();
</script>

{#if error}
  <div class="rounded border border-red-500/30 bg-red-900/30 p-3 text-sm text-red-300">{error}</div>
{:else if text !== null}
  <pre class="overflow-x-auto whitespace-pre-wrap rounded border border-white/10 bg-gray-900 p-3 text-xs text-gray-200">{text}</pre>
{:else if blobUrl}
  {#if contentType.startsWith('image/')}
    <img src={blobUrl} alt="IPFS file" class="max-h-80 rounded border border-white/10" />
  {:else}
    <a href={blobUrl} download class="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">Download</a>
  {/if}
{:else}
  <div class="text-sm text-gray-400">Loading file…</div>
{/if}

