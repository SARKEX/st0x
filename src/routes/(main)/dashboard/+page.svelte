<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import WrapUnwrapModal from '$lib/components/WrapUnwrapModal.svelte';
	import { wagmiConfig } from 'svelte-wagmi';
	import { createQuery } from '@tanstack/svelte-query';
	import { derived } from 'svelte/store';
	import { readContracts } from '@wagmi/core';
	import { erc20Abi, formatUnits } from 'viem';
	import { currentNetwork, sfts } from '$lib/stores';
	import { isAuthenticated, walletAddress, authMethod } from '$lib/stores/authStore';
	import {
		dynamicSession,
		exportDynamicWallet,
		openDepositModal,
		openSendFundsModal,
		openUnwrapModal,
		openWrapModal,
		type SendModalToken,
		type WrapUnwrapModalToken
	} from '$lib/stores/dynamicStore';
	import { createApiTokensQuery, findApiTokenByAnyAddress } from '$lib/queries/tokens';
	import {
		getAllUnwrappedTokenAddresses,
		getWrappingMappingByUnwrappedAddress,
		getWrappingMappingByWrappedAddress
	} from '$lib/config/tokenWrapping';
	import { truncateAddress } from '$lib/utils/format';
	import { track } from '$lib/services/analytics';

	type WalletHolding = {
		address: string;
		name: string;
		symbol: string;
		decimals: number;
		walletBalance: bigint;
	};

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];

	const walletBalancesQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, sfts, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $sfts, $currentNetwork, $wagmiConfig]) => ({
				queryKey: [
					'walletPortfolioBalances',
					$walletAddress,
					$currentNetwork?.chainId,
					$sfts?.length
				],
				enabled: Boolean(
					$isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig && $sfts
				),
				refetchOnMount: 'always' as const,
				refetchInterval: 300_000,
				staleTime: 30_000,
				queryFn: async (): Promise<WalletHolding[]> => {
					if (!$walletAddress || !$wagmiConfig) return [];

					const byAddress = new Map<string, Omit<WalletHolding, 'walletBalance'>>();
					for (const token of $sfts ?? []) {
						byAddress.set(token.address.toLowerCase(), {
							address: token.address,
							name: token.name,
							symbol: token.symbol,
							decimals: 18
						});
					}

					for (const address of getAllUnwrappedTokenAddresses()) {
						const mapping = getWrappingMappingByUnwrappedAddress(address);
						if (!mapping) continue;
						byAddress.set(address.toLowerCase(), {
							address,
							name: mapping.unwrappedToken.name,
							symbol: mapping.unwrappedToken.symbol,
							decimals: mapping.unwrappedToken.decimals
						});
					}

					const tokens = [...byAddress.values()];
					if (!tokens.length) return [];
					const results = await readContracts($wagmiConfig, {
						contracts: tokens.map((token) => ({
							abi: erc20Abi,
							address: token.address as `0x${string}`,
							functionName: 'balanceOf' as const,
							args: [$walletAddress as `0x${string}`]
						}))
					});

					return tokens
						.map((token, index) => ({
							...token,
							walletBalance:
								results[index]?.status === 'success' ? (results[index].result as bigint) : 0n
						}))
						.filter((token) => token.walletBalance > 0n);
				}
			})
		)
	);

	function toModalToken(holding: WalletHolding): WrapUnwrapModalToken {
		return {
			symbol: holding.symbol,
			address: holding.address,
			decimals: holding.decimals,
			balance: formatUnits(holding.walletBalance, holding.decimals),
			balanceRaw: holding.walletBalance
		};
	}

	function handleWrap(holding: WalletHolding) {
		track('dashboard_wrap_clicked', { token_symbol: holding.symbol });
		openWrapModal(toModalToken(holding));
	}

	function handleUnwrap(holding: WalletHolding) {
		track('dashboard_unwrap_clicked', { token_symbol: holding.symbol });
		openUnwrapModal(toModalToken(holding));
	}

	function handleSend(holding: WalletHolding) {
		const token: SendModalToken = {
			symbol: holding.symbol,
			address: holding.address,
			decimals: holding.decimals,
			balance: formatUnits(holding.walletBalance, holding.decimals),
			balanceRaw: holding.walletBalance
		};
		openSendFundsModal(token);
	}

	let addressCopied = false;
	async function copyAddress() {
		if (!$walletAddress) return;
		await navigator.clipboard.writeText($walletAddress);
		addressCopied = true;
		setTimeout(() => (addressCopied = false), 2000);
	}

	$: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';
</script>

<svelte:head>
	<title>Wallet &amp; Token Management | ST0x</title>
	<meta
		name="description"
		content="View token balances and manage ST0x token wrapping and unwrapping from a self-custodied wallet."
	/>
</svelte:head>

<div class="relative z-10 min-h-screen text-text">
	<PageContainer className="mx-auto max-w-5xl">
		{#if !$isAuthenticated}
			<WalletConnectionPrompt
				description="Connect your wallet to view token balances and manage wrapping or unwrapping on {$currentNetwork?.displayName ||
					'this network'}."
			/>
		{:else}
			<Section>
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">My wallet</h1>
						<div class="mt-1 flex items-center gap-2 font-mono text-sm text-text-2">
							<span>{truncateAddress($walletAddress || '')}</span>
							<button
								type="button"
								on:click={copyAddress}
								class="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"
								aria-label="Copy wallet address"
							>
								{addressCopied ? 'Copied' : 'Copy'}
							</button>
							<a
								href={basescanUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"
								aria-label="View wallet on Basescan"
							>
								<Icon name="arrowUpRight" className="h-4 w-4" />
							</a>
						</div>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button variant="primary" size="sm" on:click={() => openDepositModal()}>Deposit</Button>
						<Button variant="secondary" size="sm" on:click={() => openSendFundsModal()}>
							Send
						</Button>
						{#if $authMethod === 'dynamic' && $dynamicSession?.walletType === 'embedded'}
							<Button variant="secondary" size="sm" on:click={() => exportDynamicWallet()}>
								Export wallet
							</Button>
						{/if}
					</div>
				</div>
			</Section>

			<Section>
				<div class="mb-5">
					<h2 class="text-xl font-semibold">Token balances</h2>
					<p class="mt-1 text-sm text-text-2">
						Wrapping deposits an issued token into its ERC-4626 vault. Unwrapping redeems vault
						shares for the issued token.
					</p>
				</div>

				{#if $walletBalancesQuery.isLoading}
					<LoadingSpinner variant="inline" size="md" text="Loading token balances..." />
				{:else if $walletBalancesQuery.isError}
					<EmptyState
						title="Balances unavailable"
						description="Token balances could not be loaded. Please try again."
					/>
				{:else if !$walletBalancesQuery.data?.length}
					<EmptyState
						title="No token balances"
						description="No supported ST0x token balances were found in this wallet."
					/>
				{:else}
					<div
						class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-overlay-1"
					>
						{#each $walletBalancesQuery.data as holding (holding.address)}
							{@const tokenInfo = findApiTokenByAnyAddress(apiTokens, holding.address)}
							{@const wrapping = getWrappingMappingByUnwrappedAddress(holding.address)}
							{@const unwrapping = getWrappingMappingByWrappedAddress(holding.address)}
							<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex items-center gap-3">
									<TokenDisplay
										logoUrl={tokenInfo?.logoUrl}
										symbol={holding.symbol}
										name={holding.name}
										showName={true}
									/>
									<div class="font-mono text-sm text-text-2">
										{Number(formatUnits(holding.walletBalance, holding.decimals)).toLocaleString(
											undefined,
											{ maximumFractionDigits: 6 }
										)}
									</div>
								</div>
								<div class="flex flex-wrap gap-2 sm:justify-end">
									{#if wrapping}
										<Button variant="primary" size="sm" on:click={() => handleWrap(holding)}>
											Wrap
										</Button>
									{/if}
									{#if unwrapping}
										<Button variant="primary" size="sm" on:click={() => handleUnwrap(holding)}>
											Unwrap
										</Button>
									{/if}
									<Button variant="secondary" size="sm" on:click={() => handleSend(holding)}>
										Send
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Section>
		{/if}
	</PageContainer>

	<WrapUnwrapModal />
	<Footer />
</div>
