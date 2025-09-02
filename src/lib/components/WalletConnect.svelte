<script lang="ts">
	import { wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { CheckCircleSolid } from 'flowbite-svelte-icons';
    import Button from '$lib/components/ui/Button.svelte';
</script>

<Button
    on:click={() => $web3Modal.open()}
    tabindex={0}
    dataTestId="wallet-connect"
    variant="primary"
    size="md"
    fullWidth={true}
    className="sm:w-auto"
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
</Button>
