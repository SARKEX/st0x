<script lang="ts">
	import { isHex } from 'viem';

	export let vaultId = '';
	export let placeholder = '0x123...';
	export let isError = false;

	let error: string | undefined = undefined;

	$: isError = error !== '' && error !== undefined;

	const validate = () => {
		error = undefined;
		if (!vaultId) {
			return null;
		}

		if (!isHex(vaultId)) {
			error = 'Invalid vault id: must be a valid hex string';
		}

		return null;
	};
</script>

<div class="vault-id-input text-left">
	<input
		class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors [appearance:textfield] focus:border-yellow-500/50 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
		type="text"
		bind:value={vaultId}
		{placeholder}
		on:blur={validate}
	/>
	{#if error}
		<span class="text-sm text-red-500">{error}</span>
	{/if}
</div>
