<script lang="ts">
	import { signerAddress } from 'svelte-wagmi';
	import { createEventDispatcher } from 'svelte';
	import { handleDecimalSeparator } from '$lib/utils/input';
	import type { ValidateFunction } from '$lib/utils/validation';

	export let amount: string = '';
	export let unit: string = '';
	export let maxButton: boolean = false;
	export let placeholder: string = '';
	export let noBorder: boolean = false;

	export let validate: ValidateFunction = () => undefined;

	export let isError: boolean = false;
	let error: string | undefined = undefined;
	$: isError = error !== '' && error !== undefined;

	export let dataTestId: string = '';

	let displayValue = amount.toString();

	const dispatch = createEventDispatcher();

	function setValueToMax() {
		dispatch('setValueToMax');
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const formattedValue = handleDecimalSeparator({ target: { value: target.value } });
		displayValue = formattedValue;
		amount = formattedValue;
		dispatch('input', { value: formattedValue });

		validateInput();
	}

	// Keep display value in sync when amount changes externally
	$: if (amount && amount.toString() !== displayValue) {
		displayValue = amount.toString();
	} else if (!amount) {
		displayValue = '';
	}

	const validateInput = () => {
		error = undefined;
		error = validate(displayValue);
	};
</script>

<div class="flex w-full flex-col gap-2">
	<div
		class="flex h-full w-full items-center justify-end text-white transition-colors focus-within:outline-none {noBorder
			? 'bg-transparent'
			: 'rounded-lg border border-white/10 bg-gray-700/50 focus-within:border-yellow-500/50'}"
	>
		<input
			class="mr-2 w-full min-w-0 rounded border-none bg-transparent px-4 py-3 text-left text-base text-white outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			{...$$restProps}
			on:input={handleInput}
			min={0}
			{placeholder}
			step="0.1"
			type="text"
			value={displayValue}
			data-testid={dataTestId}
		/>
		{#if unit}
			<span
				data-testid="unit"
				class="h-full content-center self-center bg-transparent pr-4 text-left text-base text-white sm:text-lg"
			>
				{unit}</span
			>
		{/if}
		{#if maxButton}
			<button
				disabled={!$signerAddress}
				data-testid={'set-val-to-max'}
				on:click={setValueToMax}
				class="flex cursor-pointer items-center self-stretch border-l border-white/10 bg-transparent pl-3 pr-4 text-sm text-white transition-colors hover:bg-gray-600/50 sm:text-base"
				>MAX</button
			>
		{/if}
	</div>
</div>
{#if error}
	<span class="text-left text-sm text-red-500">{error}</span>
{/if}
