<script lang="ts">
	import { wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { CheckCircleSolid } from 'flowbite-svelte-icons';
</script>

<button
	on:click={() => $web3Modal.open()}
	tabindex={0}
	data-testid="wallet-connect"
	class="w-full sm:w-auto rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-3 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold transition-transform hover:scale-105 flex items-center justify-center"
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
