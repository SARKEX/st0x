<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits, parseUnits } from 'viem';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import type { Token } from 'sushi';
	import type { ValidateFunction } from '$lib/validateDeploymentArgs';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	export let amountToken: Token;
	let inputAmount: string | undefined;
	export let amount: bigint | undefined = undefined;

	export let validate: ValidateFunction = () => undefined;
	export let isError: boolean = false;

	export let dataTestId: string = '';
	export let showUnit: boolean = true;
	export let showMaxButton: boolean = true;

	let balance: bigint = 0n;
	let decimals: number | null = null;
	let tokenFingerprint: string | undefined;

	const parseDecimals = (value: unknown): number | null => {
		if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
			return value;
		}
		if (typeof value === 'string' && value.trim().length > 0) {
			const parsed = Number(value);
			return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
		}
		return null;
	};

	const canParseDecimals = (value: number | null | undefined): value is number =>
		typeof value === 'number' && Number.isInteger(value) && value >= 0;

	$: if (amountToken) {
		resetInputAmount();
	}

	$: if (amountToken) {
		const fingerprint = `${amountToken.address ?? ''}:${amountToken.chainId ?? ''}`;
		const fallbackDecimals = parseDecimals((amountToken as Partial<Token>).decimals);
		const tokenChanged = tokenFingerprint !== fingerprint;
		tokenFingerprint = fingerprint;
		if (tokenChanged || !canParseDecimals(decimals)) {
			decimals = fallbackDecimals;
		}
	}

	const resetInputAmount = () => {
		inputAmount = undefined;
		amount = undefined;
	};

	$: if (inputAmount && canParseDecimals(decimals)) {
		try {
			amount = parseUnits(inputAmount, decimals);
		} catch {
			amount = undefined;
		}
	}

	$: balancePromise = (async () => {
		if (!amountToken) return;
		if (!$signerAddress) return;
		const [balance, decimals] = await Promise.all([
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: amountToken.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$signerAddress as Hex]
			}),
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: amountToken.address as `0x${string}`,
				functionName: 'decimals',
				args: []
			})
		]);
		return { balance, decimals };
	})();

	$: balancePromise
		.then((data) => {
			if (!data) return;
			balance = data.balance;
			const resolvedDecimals = parseDecimals(data.decimals);
			if (resolvedDecimals !== null) {
				decimals = resolvedDecimals;
			}
			if (inputAmount && canParseDecimals(decimals)) {
				try {
					amount = parseUnits(inputAmount, decimals);
				} catch {
					amount = undefined;
				}
			}
		})
		.catch(() => {
			// Handle promise rejection silently
		});

	const setValueToMax = () => {
		if (!canParseDecimals(decimals)) {
			return;
		}
		inputAmount = formatUnits(balance, decimals);
		amount = balance;
	};
</script>

<div class="flex flex-col gap-2">
	<Input
		{...$$restProps}
		bind:amount={inputAmount}
		type="number"
		unit={showUnit ? amountToken.symbol : ''}
		maxButton={showMaxButton}
		on:setValueToMax={setValueToMax}
		{dataTestId}
		{validate}
		bind:isError
	/>
	<span class="text-left text-sm text-gray-400">
		{#await balancePromise}
			<span class="inline-flex items-center gap-2">
				<LoadingSpinner variant="inline" size="sm" text="Loading balance..." />
			</span>
		{:then data}
			{#if data}
				Balance: {formatUnits(data.balance, data.decimals)} {amountToken.symbol}
			{/if}
		{/await}
	</span>
</div>
