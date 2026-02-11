<script lang="ts">
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { erc20Abi } from 'viem';
	import { readContracts } from '@wagmi/core';
	import { TOKEN_MIGRATION_MAPPINGS } from '$lib/config/tokenMigration';
	import { goto } from '$app/navigation';
	import { track } from '$lib/services/analytics';

	let dismissed = false;
	let bannerTracked = false;

	// Query to check if user has any old tokens
	$: oldTokensQuery = createQuery({
		queryKey: ['hasOldTokens', $walletAddress, $currentNetwork?.chainId],
		enabled: !!($isAuthenticated && $walletAddress && $wagmiConfig),
		staleTime: 60_000, // Check every minute
		queryFn: async () => {
			if (!$walletAddress || !$wagmiConfig) return { hasOldTokens: false, count: 0 };

			const contracts = TOKEN_MIGRATION_MAPPINGS.map((mapping) => ({
				abi: erc20Abi,
				address: mapping.oldToken.address as `0x${string}`,
				functionName: 'balanceOf' as const,
				args: [$walletAddress as `0x${string}`]
			}));

			try {
				const results = await readContracts($wagmiConfig, { contracts });

				let count = 0;
				for (const result of results) {
					if (result.status === 'success') {
						const balance = result.result as bigint;
						if (balance > 0n) {
							count++;
						}
					}
				}

				return { hasOldTokens: count > 0, count };
			} catch (e) {
				console.error('Failed to check old token balances:', e);
				return { hasOldTokens: false, count: 0 };
			}
		}
	});

	$: hasOldTokens = $oldTokensQuery.data?.hasOldTokens ?? false;
	$: oldTokenCount = $oldTokensQuery.data?.count ?? 0;
	$: showBanner = $isAuthenticated && hasOldTokens && !dismissed;

	$: if (showBanner && !bannerTracked) {
		bannerTracked = true;
		track('legacy_tokens_banner_shown', { token_count: oldTokenCount });
	}

	function handleSwapClick() {
		track('legacy_tokens_banner_swap_clicked', { token_count: oldTokenCount });
		// Navigate to portfolio page with hash to focus on holdings
		goto('/dashboard#holdings');
	}

	function handleDismiss() {
		track('legacy_tokens_banner_dismissed', { token_count: oldTokenCount });
		dismissed = true;
	}
</script>

{#if showBanner}
	<div class="relative z-40 bg-yellow-600 px-4 py-2.5 text-center text-sm text-white">
		<div class="mx-auto flex max-w-4xl items-center justify-center gap-2">
			<svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span>
				You have {oldTokenCount} legacy token{oldTokenCount === 1 ? '' : 's'} that need{oldTokenCount ===
				1
					? 's'
					: ''} to be swapped to the new wrapped version.
			</span>
			<button
				type="button"
				on:click={handleSwapClick}
				class="ml-1 font-semibold underline underline-offset-2 transition hover:text-yellow-100"
			>
				Click here to swap
			</button>
			<button
				type="button"
				on:click={handleDismiss}
				class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
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
