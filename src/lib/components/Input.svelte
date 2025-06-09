<script lang="ts">
	import { signerAddress } from 'svelte-wagmi';
	import { createEventDispatcher } from 'svelte';
	import { handleDecimalSeparator } from '$lib/handleDecimalSeparator';
	import type { ValidateFunction } from '$lib/validateDeploymentArgs';

	export let amount: string = '';
	export let unit: string = '';
	export let maxButton: boolean = false;
	export let placeholder: string = '';

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

<div class="flex w-full flex-col gap-2 border border-gray-200">
	<div
		class="flex h-full w-full items-center justify-end rounded-sm border border-white text-lg text-gray-500 outline-none"
	>
		<input
			class="mr-2 w-full min-w-0 rounded border-none bg-gray-900 px-2 py-0 text-left text-base text-gray-500 outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			{...$$restProps}
			on:input={handleInput}
			min={0}
			placeholder={placeholder}
			step="0.1"
			type="text"
			value={displayValue}
			data-testid={dataTestId}
		/>
		{#if unit}
			<span
				data-testid="unit"
				class="h-full content-center self-center bg-gray-900 pr-2 text-left text-base text-gray-500 sm:text-lg"
			>
				{unit}</span
			>
		{/if}
		{#if maxButton}
			<button
				disabled={!$signerAddress}
				data-testid={'set-val-to-max'}
				on:click={setValueToMax}
				class="flex cursor-pointer items-center self-stretch border-l border-gray-200 bg-gray-900 pl-3 pr-2 text-sm sm:text-base"
				>MAX</button
			>
		{/if}
	</div>
</div>
{#if error}
	<span class="text-left text-sm text-red-500">{error}</span>
{/if}
