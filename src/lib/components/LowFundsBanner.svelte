<script lang="ts">
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import { openDepositModal } from '$lib/stores/dynamicStore';
	import { createQuery } from '@tanstack/svelte-query';
	import { erc20Abi } from 'viem';
	import { readContracts } from '@wagmi/core';
	import { createApiTokensQuery } from '$lib/queries/tokens';

	let dismissed = false;
	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: paymentTokens = ($apiTokensQuery.data ?? []).filter((token) => token.category === 'CRYPTO');

	// Share the same query key as dashboard to avoid duplicate RPC calls
	// Uses same settings as dashboard - invalidation happens after transactions
	$: usdcBalanceQuery = createQuery({
		queryKey: [
			'usdcWalletBalance',
			$walletAddress,
			$currentNetwork?.chainId,
			paymentTokens.map((token) => token.address).join(',')
		],
		enabled: !!(
			$isAuthenticated &&
			$walletAddress &&
			$currentNetwork &&
			$wagmiConfig &&
			paymentTokens.length
		),
		staleTime: 30_000, // Consider data fresh for 30 seconds
		queryFn: async () => {
			if (paymentTokens.length === 0 || !$walletAddress) return [];

			// Build multicall contracts array
			const contracts = paymentTokens.map((token) => ({
				abi: erc20Abi,
				address: token.address as `0x${string}`,
				functionName: 'balanceOf' as const,
				args: [$walletAddress as `0x${string}`]
			}));

			try {
				const results = await readContracts($wagmiConfig, { contracts });

				return paymentTokens
					.map((token, index) => {
						const result = results[index];
						if (result.status === 'success') {
							return {
								id: token.address,
								address: token.address,
								name: token.name,
								symbol: token.symbol,
								walletBalance: result.result as bigint,
								decimals: token.decimals
							};
						}
						return null;
					})
					.filter((b): b is NonNullable<typeof b> => b !== null);
			} catch (e) {
				console.error('Multicall failed for USDC balance:', e);
				return [];
			}
		}
	});

	// Check if USDC balance is 0
	$: usdcBalance = $usdcBalanceQuery.data?.find((t) => t.symbol === 'USDC')?.walletBalance ?? 0n;
	$: hasNoFunds = usdcBalance === 0n && $usdcBalanceQuery.isSuccess;
	$: showBanner = $isAuthenticated && hasNoFunds && !dismissed;

	function handleDeposit() {
		openDepositModal();
	}

	function handleDismiss() {
		dismissed = true;
	}
</script>

{#if showBanner}
	<div class="relative z-50 bg-iris px-4 py-2.5 text-center text-sm text-text">
		<div class="mx-auto flex max-w-4xl items-center justify-center gap-2">
			<svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>No USDC found in your wallet.</span>
			<button
				type="button"
				on:click={handleDeposit}
				class="ml-1 font-semibold underline underline-offset-2 transition hover:text-iris"
			>
				Deposit to start trading
			</button>
			<button
				type="button"
				on:click={handleDismiss}
				class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-text-2 transition hover:bg-surface-3 hover:text-text"
				aria-label="Dismiss"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}
