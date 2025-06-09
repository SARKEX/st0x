<script lang="ts">
	import { targetNetwork, wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { CheckCircleSolid, CloseCircleSolid } from 'flowbite-svelte-icons';
</script>

<button
	on:click={() => $web3Modal.open()}
	tabindex={0}
	data-testid="wallet-connect"
	class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-105"
>
	{#if $wrongNetwork || !$signerAddress || !$connected}
		<div class="flex items-center gap-1.5" data-testid="not-connected">
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
