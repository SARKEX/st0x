<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits, parseUnits } from 'viem';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import type { Token } from 'sushi/currency';
	import type { ValidateFunction } from '$lib/validateDeploymentArgs';

	export let amountToken: Token;
	let inputAmount: string | undefined;
	export let amount: bigint | undefined = undefined;

	export let validate: ValidateFunction = () => undefined;
	export let isError: boolean = false;

	export let dataTestId: string = '';

	let balance: bigint = 0n;
	let decimals: number = 0;

	$: if (amountToken) {
		resetInputAmount();
	}

	const resetInputAmount = () => {
		inputAmount = undefined;
		amount = undefined;
	};

	$: if (inputAmount) {
		amount = parseUnits(inputAmount, decimals);
	}

	$: balancePromise = (async () => {
		if (!amountToken) return;
		if (!$signerAddress) return;
		const [balance, decimals] = await Promise.all([
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: amountToken.address,
				functionName: 'balanceOf',
				args: [$signerAddress as Hex]
			}),
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: amountToken.address,
				functionName: 'decimals',
				args: []
			})
		]);
		return { balance, decimals };
	})();

	$: balancePromise.then((data) => {
		if (!data) return;
		balance = data.balance;
		decimals = data.decimals;
	});

	const setValueToMax = () => {
		inputAmount = formatUnits(balance, decimals);
		amount = balance;
	};
</script>

<div class="flex flex-col gap-2">
	<Input
		bind:amount={inputAmount}
		type="number"
		unit={amountToken.symbol}
		maxButton
		on:setValueToMax={setValueToMax}
		{dataTestId}
		{validate}
		bind:isError
	/>
	<span class="text-left text-sm text-gray-400">
		{#await balancePromise}
			Loading balance...
		{:then data}
			{#if data}
				Balance: {formatUnits(data.balance, data.decimals)} {amountToken.symbol}
			{/if}
		{/await}
	</span>
</div>
