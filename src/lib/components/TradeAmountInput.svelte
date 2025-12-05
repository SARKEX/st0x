<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits, parseUnits } from 'viem';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import type { Token } from '$lib/types';
	import type { ValidateFunction } from '$lib/utils/validation';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	export let amountToken: Token;
	export let balanceToken: Token | undefined = undefined;
	let inputAmount: string | undefined;
	export let amount: bigint | undefined = undefined;

	export let validate: ValidateFunction = () => undefined;
	export let isError: boolean = false;

	export let dataTestId: string = '';
	export let showUnit: boolean = true;
	export let showMaxButton: boolean = true;
	export let compact: boolean = false;

	// Expose balance to parent component
	export let balance: bigint = 0n;
	export let balanceDecimals: number | null = null;
	let amountDecimals: number | null = null;
	let amountTokenFingerprint: string | undefined;

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

	const getTokenFingerprint = (token?: Token) => {
		if (!token) return undefined;
		const address = token.address ? token.address.toString().toLowerCase() : '';
		const chainId = token.chainId ?? '';
		return `${address}:${chainId}`;
	};

	$: if (amountToken) {
		const fingerprint = getTokenFingerprint(amountToken);
		const fallbackDecimals = parseDecimals((amountToken as Partial<Token>).decimals);
		const tokenChanged = amountTokenFingerprint !== fingerprint;
		amountTokenFingerprint = fingerprint;
		if (tokenChanged) {
			resetInputAmount();
		}
		if (tokenChanged || !canParseDecimals(amountDecimals)) {
			amountDecimals = fallbackDecimals;
		}
	}

	const resetInputAmount = () => {
		inputAmount = undefined;
		amount = undefined;
	};

	$: if (inputAmount && canParseDecimals(amountDecimals)) {
		try {
			amount = parseUnits(inputAmount, amountDecimals);
		} catch {
			amount = undefined;
		}
	} else if (!inputAmount) {
		amount = undefined;
	}

	// Expose function to set amount from parent (for percentage buttons)
	export function setAmountValue(newAmount: bigint) {
		if (!canParseDecimals(amountDecimals)) return;
		amount = newAmount;
		inputAmount = formatUnits(newAmount, amountDecimals);
	}

	$: balancePromise = (async () => {
		const token = balanceToken ?? amountToken;
		if (!token) return null;
		if (!$signerAddress) return null;
		const fingerprint = getTokenFingerprint(token);
		const [tokenBalance, tokenDecimals] = await Promise.all([
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: token.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$signerAddress as Hex]
			}),
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: token.address as `0x${string}`,
				functionName: 'decimals',
				args: []
			})
		]);
		return { balance: tokenBalance, decimals: tokenDecimals, fingerprint };
	})();

	$: balancePromise
		.then((data) => {
			if (!data) return;
			const activeFingerprint = getTokenFingerprint(balanceToken ?? amountToken);
			if (!activeFingerprint || data.fingerprint !== activeFingerprint) {
				return;
			}
			balance = data.balance;
			const resolvedDecimals = parseDecimals(data.decimals);
			balanceDecimals = resolvedDecimals;
			if (resolvedDecimals !== null && activeFingerprint === amountTokenFingerprint) {
				amountDecimals = resolvedDecimals;
			}
		})
		.catch(() => {
			// Handle promise rejection silently
		});

	const setValueToMax = () => {
		const displayToken = balanceToken ?? amountToken;
		if (!displayToken) {
			return;
		}
		const matchesAmountToken = getTokenFingerprint(displayToken) === amountTokenFingerprint;
		if (!matchesAmountToken) {
			return;
		}
		if (!canParseDecimals(amountDecimals)) {
			return;
		}
		inputAmount = formatUnits(balance, amountDecimals);
		amount = balance;
	};
</script>

<div class="flex flex-col {compact ? '' : 'gap-2'}">
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
	{#if !compact}
		<span class="text-left text-sm text-gray-400">
			{#await balancePromise}
				<span class="inline-flex items-center gap-2">
					<LoadingSpinner variant="inline" size="sm" text="Loading balance..." />
				</span>
			{:then data}
				{#if data}
					{@const balanceFormatted = parseFloat(formatUnits(data.balance, data.decimals))}
					{@const balanceRounded = Math.round(balanceFormatted * 1000) / 1000}
					Balance: {balanceRounded.toFixed(3)}
					{(balanceToken ?? amountToken)?.symbol}
				{:else}
					Balance: —
				{/if}
			{/await}
		</span>
	{/if}
</div>
