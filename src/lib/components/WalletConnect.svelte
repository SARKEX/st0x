<script lang="ts">
	import { targetNetwork, wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { CheckCircleSolid, CloseCircleSolid } from 'flowbite-svelte-icons';
</script>

<button
	on:click={() => $web3Modal.open()}
	tabindex={0}
	data-testid="wallet-connect"
	class="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-600 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-100 sm:w-auto sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:text-base"
>
	{#if $wrongNetwork || !$signerAddress || !$connected}
		<div class="flex items-center gap-1 sm:gap-1.5" data-testid="not-connected">
			<CloseCircleSolid class="h-3.5 w-3.5 text-red-500 sm:h-4 sm:w-4" />
			<span>Connect</span><span class="hidden sm:inline">{''} to {$targetNetwork.name}</span>
		</div>
	{:else}
		<div class="flex items-center gap-1 sm:gap-1.5" data-testid="connected">
			<CheckCircleSolid class="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
			<span>Connected</span><span class="hidden sm:inline"
				>{''} {$signerAddress.slice(0, 6)}...{$signerAddress.slice(-4)}</span
			>
		</div>
	{/if}
</button>
