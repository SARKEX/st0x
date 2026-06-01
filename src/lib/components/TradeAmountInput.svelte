<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits, parseUnits } from 'viem';
	import { wagmiConfig } from 'svelte-wagmi';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import type { Token } from '$lib/types';
	import type { ValidateFunction } from '$lib/utils/validation';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { walletAddress } from '$lib/stores/authStore';

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
	export let noBorder: boolean = false;

	// Optional label override — when set, this string is shown as the input's
	// trailing unit instead of `amountToken.symbol`. Used by the trade panel
	// to flip wtX ↔ tX when the user toggles share-denominated display on.
	export let unitOverride: string | undefined = undefined;

	// Display-only scale factor. When > 0 and !== 1, the user types values
	// in the SCALED denomination (e.g. tSGOV shares) while `amount` remains
	// in the token's native denomination (wtSGOV wei). Math is:
	//   amount  = parseUnits(inputString / displayScale, decimals)
	//   display = formatUnits(amount * displayScale, decimals)
	// `displayScale` is a float — the wrap ratio is bounded (1.0–~2.0) and
	// only has ~4 significant digits in practice, so float precision is fine.
	export let displayScale: number = 1;

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

	function activeScale(): number {
		return Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
	}

	// Convert a user-typed string (in the displayed denomination) into a wt-
	// denominated BigInt at `amountDecimals` precision. When `displayScale`
	// is 1 (the default) this is just `parseUnits`. When >1, we divide by
	// the ratio first so the stored BigInt is the on-chain (wt) amount.
	function parseDisplayInput(input: string, decimals: number): bigint {
		const scale = activeScale();
		if (scale === 1) return parseUnits(input, decimals);
		// `parseFloat` is OK here: the wrap ratio's significant digits (~4) and
		// typical user inputs (≤ 10^10) stay well within float64 precision.
		const tValue = parseFloat(input);
		if (!Number.isFinite(tValue)) throw new Error('invalid input');
		const wtValue = tValue / scale;
		// Clamp to the token's decimals so we never exceed parseUnits' digit
		// budget. toFixed(decimals) gives a fixed-point string with up to
		// `decimals` fractional digits — safe input for parseUnits.
		return parseUnits(wtValue.toFixed(decimals), decimals);
	}

	function formatWtAsDisplay(wt: bigint, decimals: number): string {
		const scale = activeScale();
		const native = formatUnits(wt, decimals);
		if (scale === 1) return native;
		const tValue = parseFloat(native) * scale;
		return tValue.toFixed(decimals);
	}

	$: if (inputAmount && canParseDecimals(amountDecimals)) {
		try {
			amount = parseDisplayInput(inputAmount, amountDecimals);
		} catch {
			amount = undefined;
		}
	} else if (!inputAmount) {
		amount = undefined;
	}

	// Expose function to set amount from parent (for percentage buttons).
	// Parent always speaks wt-denominated BigInts; we render the display
	// string in whichever denomination is active.
	export function setAmountValue(newAmount: bigint) {
		if (!canParseDecimals(amountDecimals)) return;
		amount = newAmount;
		inputAmount = formatWtAsDisplay(newAmount, amountDecimals);
	}

	$: balancePromise = (async () => {
		const token = balanceToken ?? amountToken;
		if (!token) return null;
		if (!$walletAddress) return null;
		if (!$wagmiConfig) return null;
		const fingerprint = getTokenFingerprint(token);
		const [tokenBalance, tokenDecimals] = await Promise.all([
			readContract($wagmiConfig, {
				abi: erc20Abi,
				address: token.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$walletAddress as Hex]
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
		inputAmount = formatWtAsDisplay(balance, amountDecimals);
		amount = balance;
	};
</script>

<div class="flex flex-col {compact ? '' : 'gap-2'}">
	<Input
		{...$$restProps}
		bind:amount={inputAmount}
		type="number"
		unit={showUnit ? unitOverride ?? amountToken.symbol : ''}
		maxButton={showMaxButton}
		on:setValueToMax={setValueToMax}
		{dataTestId}
		{validate}
		{noBorder}
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
					{@const balanceFormatted =
						parseFloat(formatUnits(data.balance, data.decimals)) * activeScale()}
					{@const balanceRounded = Math.round(balanceFormatted * 1000) / 1000}
					Balance: {balanceRounded.toFixed(3)}
					{unitOverride ?? (balanceToken ?? amountToken)?.symbol}
				{:else}
					Balance: —
				{/if}
			{/await}
		</span>
	{/if}
</div>
