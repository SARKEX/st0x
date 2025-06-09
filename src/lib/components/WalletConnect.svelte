<script lang="ts">
	import { targetNetwork, wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { CheckCircleSolid, CloseCircleSolid } from 'flowbite-svelte-icons';
</script>

<button
	on:click={() => $web3Modal.open()}
	tabindex={0}
	data-testid="wallet-connect"
	class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
>
	{#if $wrongNetwork || !$signerAddress || !$connected}
		<div class="flex items-center gap-1.5" data-testid="not-connected">
			<CloseCircleSolid class="h-4 w-4 text-red-500" />
			<span>Connect</span><span class="hidden sm:inline">{''} Wallet</span>
		</div>
	{:else}
		<div class="flex items-center gap-1.5" data-testid="connected">
			<CheckCircleSolid class="h-4 w-4 text-yellow-500" />
			<span>Connected</span><span class="hidden sm:inline"
				>{''} {$signerAddress.slice(0, 6)}...{$signerAddress.slice(-4)}</span
			>
		</div>
	{/if}
</button>
