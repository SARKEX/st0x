<script lang="ts">
	import { wrongNetwork } from '$lib/stores';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<Button
	on:click={() => $web3Modal.open()}
	tabindex={0}
	dataTestId="wallet-connect"
	variant="primary"
	size="sm"
	fullWidth={false}
	className="px-2 py-1 text-xs sm:px-3 sm:py-2 sm:text-sm shrink-0"
>
	{#if $wrongNetwork || !$signerAddress || !$connected}
		<div class="flex items-center gap-1.5" data-testid="not-connected">
			<span>Connect</span>
			<span class="hidden sm:inline">Wallet</span>
		</div>
	{:else}
		<div class="flex items-center gap-1.5" data-testid="connected">
			<svg class="h-4 w-4 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414L9 13l4.707-4.707z"
					clip-rule="evenodd"
				/>
			</svg>
			<!-- Mobile: last 6 only -->
			<span class="sm:hidden">…{$signerAddress.slice(-6)}</span>
			<!-- Desktop: full truncated 6...4 -->
			<span class="hidden sm:inline"
				>Connected {$signerAddress.slice(0, 6)}...{$signerAddress.slice(-4)}</span
			>
		</div>
	{/if}
</Button>
