<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress, authMethod } from '$lib/stores/authStore';
	import {
		openSendFundsModal,
		openDepositModal,
		exportDynamicWallet,
		dynamicSession,
		type SendModalToken
	} from '$lib/stores/dynamicStore';
	import { currentNetwork, sfts } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits, erc20Abi } from 'viem';
	import { readContracts, getBalance } from '@wagmi/core';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { TOKENS, PAYMENT_TOKENS_BY_NETWORK, getTokenByAnyAddress } from '$lib/config/tokens';
	import { goto } from '$app/navigation';
	import { transformApiTakerTradesToDisplay } from '$lib/utils/tradeTransform';
	import Table from '$lib/components/ui/table/Table.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';
	import { parseFloatHex, getRaindexVaultUrl } from '$lib/utils/tokenMath';
	import {
		getMakerInputTokenAddress,
		getMakerOutputTokenAddress
	} from '$lib/types/orderPerspective';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';
	import { createOrderbookQuotesQuery, GLOBAL_ORDERBOOK_POLL_MS } from '$lib/queries/orderbook';
	import { createUserVaultsQuery } from '$lib/queries/vaults';
	import { createTakerTradesQuery, createBatchTradesQuery } from '$lib/queries/tradeActivity';
	import { createCostBasisQuery } from '$lib/queries/costBasis';
	import { calculatePnL } from '$lib/utils/costBasis';
	import { manualCostBasisStore, type ManualCostBasisEntry } from '$lib/stores/manualCostBasis';
	import { derived } from 'svelte/store';
	import { onDestroy } from 'svelte';
	import transactionStore from '$lib/stores/transaction';
	import OrdersTable from '$lib/components/orders/OrdersTable.svelte';
	import type { DisplayOrder } from '$lib/types/orders';

	import { addTokenToWallet } from '$lib/utils/walletUtils';
	import {
		getAllOldTokenAddresses,
		getMigrationMappingByAddress
	} from '$lib/config/tokenMigration';
	import {
		getAllUnwrappedTokenAddresses,
		getWrappingMappingByUnwrappedAddress,
		getWrappingMappingByWrappedAddress
	} from '$lib/config/tokenWrapping';
	import {
		openTokenSwapModal,
		openWrapModal,
		openUnwrapModal,
		type SwapModalToken,
		type WrapUnwrapModalToken
	} from '$lib/stores/dynamicStore';
	import TokenSwapModal from '$lib/components/TokenSwapModal.svelte';
	import WrapUnwrapModal from '$lib/components/WrapUnwrapModal.svelte';
	import { track } from '$lib/services/analytics';

	// Default vault ID (0x1 padded to 32 bytes)
	const DEFAULT_VAULT_ID = '0x0000000000000000000000000000000000000000000000000000000000000001';

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Set of valid token addresses (asset tokens + payment tokens) for filtering
	$: validTokenAddresses = (() => {
		if (!$currentNetwork) return new Set<string>();
		const addresses = new Set<string>();
		// Add asset tokens for current network
		for (const token of TOKENS) {
			if (token.chainId === $currentNetwork.chainId) {
				addresses.add(token.address.toLowerCase());
			}
		}
		// Add payment tokens for current network
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
		for (const token of paymentTokens) {
			addresses.add(token.address.toLowerCase());
		}
		return addresses;
	})();

	// Set of tStock addresses for the current network (for filtering vaults)
	$: tStockAddresses = (() => {
		if (!$currentNetwork) return new Set<string>();
		const addresses = new Set<string>();
		for (const token of TOKENS) {
			if (token.chainId === $currentNetwork.chainId && token.category === 'ST0x') {
				addresses.add(token.address.toLowerCase());
			}
		}
		return addresses;
	})();

	let isNetworkLoading = false;
	const BASE_TABS = [
		{ id: 'portfolio', label: 'Portfolio' },
		{ id: 'orders', label: 'Orders' },
		{ id: 'vaults', label: 'Vaults' }
	];
	const WALLET_TAB = { id: 'wallet', label: 'Wallet Management' };

	// Add Wallet Management tab for Dynamic users
	$: DASHBOARD_TABS = $authMethod === 'dynamic' ? [...BASE_TABS, WALLET_TAB] : BASE_TABS;

	type DashboardTabId = 'portfolio' | 'orders' | 'vaults' | 'wallet';
	let activeTab: DashboardTabId = 'portfolio';

	const handleDashboardTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (DASHBOARD_TABS.some((tab) => tab.id === nextId)) {
			activeTab = nextId as DashboardTabId;
		}
	};

	// Helper to open send modal with a specific token
	function handleWithdraw(holding: {
		symbol: string;
		address: string;
		decimals: number;
		walletBalance: bigint;
		walletBalanceNum: number;
	}) {
		const token: SendModalToken = {
			symbol: holding.symbol,
			address: holding.address,
			decimals: holding.decimals,
			balance: holding.walletBalanceNum.toFixed(holding.decimals === 6 ? 2 : 4),
			balanceRaw: holding.walletBalance
		};
		openSendFundsModal(token);
	}

	// Helper to open swap modal for legacy tokens
	function handleSwapLegacyToken(legacyToken: {
		symbol: string;
		address: string;
		decimals: number;
		walletBalance: bigint;
		balanceNum: number;
	}) {
		track('dashboard_swap_legacy_clicked', {
			token_symbol: legacyToken.symbol,
			balance: legacyToken.balanceNum
		});
		const token: SwapModalToken = {
			symbol: legacyToken.symbol,
			address: legacyToken.address,
			decimals: legacyToken.decimals,
			balance: legacyToken.balanceNum.toFixed(4),
			balanceRaw: legacyToken.walletBalance
		};
		openTokenSwapModal(token);
	}

	// Helper to open unwrap modal for wrapped tokens
	function handleUnwrapToken(holding: {
		symbol: string;
		address: string;
		decimals: number;
		walletBalance: bigint;
		walletBalanceNum: number;
	}) {
		track('dashboard_unwrap_clicked', {
			token_symbol: holding.symbol,
			balance: holding.walletBalanceNum
		});
		const token: WrapUnwrapModalToken = {
			symbol: holding.symbol,
			address: holding.address,
			decimals: holding.decimals,
			balance: holding.walletBalanceNum.toFixed(4),
			balanceRaw: holding.walletBalance
		};
		openUnwrapModal(token);
	}

	// Helper to open wrap modal for unwrapped tokens
	function handleWrapToken(token: {
		symbol: string;
		address: string;
		decimals: number;
		walletBalance: bigint;
		balanceNum: number;
	}) {
		track('dashboard_wrap_clicked', {
			token_symbol: token.symbol,
			balance: token.balanceNum
		});
		const modalToken: WrapUnwrapModalToken = {
			symbol: token.symbol,
			address: token.address,
			decimals: token.decimals,
			balance: token.balanceNum.toFixed(4),
			balanceRaw: token.walletBalance
		};
		openWrapModal(modalToken);
	}

	// Copy address to clipboard
	let addressCopied = false;
	async function copyAddress() {
		if (!$walletAddress) return;
		try {
			await navigator.clipboard.writeText($walletAddress);
			addressCopied = true;
			setTimeout(() => (addressCopied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Basescan URL for wallet
	$: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';

	// Dust threshold for vaults and token balances (in token units)
	const DUST_THRESHOLD = 0.0001;
	let showDustVaults = false;
	let hideDust = true;

	// Manual cost basis entry state
	let showCostBasisModal = false;
	let costBasisEditToken: {
		address: string;
		symbol: string;
		untrackedBalance: number;
		existingEntry?: ManualCostBasisEntry;
	} | null = null;
	let costBasisInputQuantity = '';
	let costBasisInputPrice = '';
	let costBasisInputNote = '';

	function openCostBasisModal(holding: {
		address: string;
		symbol: string;
		untrackedBalance: number;
		manualEntry?: ManualCostBasisEntry;
	}) {
		costBasisEditToken = {
			address: holding.address,
			symbol: holding.symbol,
			untrackedBalance: holding.untrackedBalance,
			existingEntry: holding.manualEntry
		};
		// Pre-fill with existing values or defaults
		costBasisInputQuantity =
			holding.manualEntry?.quantity?.toString() ?? holding.untrackedBalance.toFixed(4);
		costBasisInputPrice = holding.manualEntry?.costPerUnit?.toString() ?? '';
		costBasisInputNote = holding.manualEntry?.note ?? '';
		showCostBasisModal = true;
	}

	function closeCostBasisModal() {
		showCostBasisModal = false;
		costBasisEditToken = null;
		costBasisInputQuantity = '';
		costBasisInputPrice = '';
		costBasisInputNote = '';
	}

	function saveCostBasisEntry() {
		if (!costBasisEditToken) return;

		const quantity = parseFloat(costBasisInputQuantity);
		const costPerUnit = parseFloat(costBasisInputPrice);

		if (isNaN(quantity) || quantity <= 0) return;
		if (isNaN(costPerUnit) || costPerUnit < 0) return;

		manualCostBasisStore.setEntry({
			tokenAddress: costBasisEditToken.address,
			quantity,
			costPerUnit,
			totalCost: quantity * costPerUnit,
			note: costBasisInputNote || undefined
		});

		closeCostBasisModal();
	}

	function removeCostBasisEntry() {
		if (!costBasisEditToken) return;
		manualCostBasisStore.removeEntry(costBasisEditToken.address);
		closeCostBasisModal();
	}

	const QUERY_POLL_INTERVAL_MS = 300_000;
	const QUERY_STALE_TIME_MS = 30_000;
	const NETWORK_LOADING_DELAY_MS = 300;

	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	let networkLoadingTimer: ReturnType<typeof setTimeout> | null = null;
	let previousChainId: number | undefined = undefined;

	// Show "Switching..." only when the network identity (chainId) actually changes.
	// This prevents the loading state from sticking when the reactive block re-runs
	// repeatedly with the same network (e.g. store re-emits or parent re-renders).
	$: {
		const chainId = $currentNetwork?.chainId;

		if (networkLoadingTimer) {
			clearTimeout(networkLoadingTimer);
			networkLoadingTimer = null;
		}

		if (!$currentNetwork) {
			isNetworkLoading = false;
			previousChainId = undefined;
		} else {
			const sameNetwork = previousChainId === chainId;
			previousChainId = chainId;

			if (sameNetwork) {
				// Same network as last run — not switching, so clear loading
				isNetworkLoading = false;
			} else {
				// Network changed (or first time we have a network)
				isNetworkLoading = true;
				networkLoadingTimer = setTimeout(() => {
					isNetworkLoading = false;
					networkLoadingTimer = null;
				}, NETWORK_LOADING_DELAY_MS);
			}
		}
	}

	onDestroy(() => {
		if (networkLoadingTimer) {
			clearTimeout(networkLoadingTimer);
			networkLoadingTimer = null;
		}
	});

	// User Vaults Query - no polling, invalidated after order deployment
	$: vaultsListQuery = createUserVaultsQuery($currentNetwork, $walletAddress);

	// Query user's wallet holdings from SFTs - fetches balances via multicall (single RPC request)
	// We query balances on WRAPPED token addresses (from TOKENS config) since that's what users trade
	const walletHoldingsQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, sfts, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $sfts, $currentNetwork, $wagmiConfig]) => ({
				queryKey: ['walletHoldings', $walletAddress, $currentNetwork?.id, $sfts?.length],
				enabled: !!($isAuthenticated && $walletAddress && $sfts && $currentNetwork && $wagmiConfig),
				refetchOnMount: 'always' as const,
				refetchInterval: QUERY_POLL_INTERVAL_MS,
				staleTime: QUERY_STALE_TIME_MS,
				queryFn: async () => {
					if (!$sfts || !$walletAddress || !$wagmiConfig) return [];
					const normalizedWalletAddress = $walletAddress.toLowerCase();

					// Map subgraph SFTs to their wrapped token addresses from TOKENS config
					// The subgraph returns unwrapped addresses, but we need to query wrapped token balances
					const sftsWithWrappedAddresses = $sfts.map((sft) => {
						const tokenConfig = getTokenByAnyAddress(sft.address);
						return {
							...sft,
							wrappedAddress: tokenConfig?.address ?? sft.address // Use wrapped address if found
						};
					});

					// Build multicall contracts array for all wrapped token balances
					const contracts = sftsWithWrappedAddresses.map((sft) => ({
						abi: erc20Abi,
						address: sft.wrappedAddress as `0x${string}`,
						functionName: 'balanceOf' as const,
						args: [$walletAddress as `0x${string}`]
					}));

					try {
						// Single multicall for all token balances
						const results = await readContracts($wagmiConfig, { contracts });

						return sftsWithWrappedAddresses.map((sft, index) => {
							const result = results[index];
							let walletBalance = 0n;

							if (result.status === 'success') {
								walletBalance = result.result as bigint;
							} else {
								// Fall back to subgraph data if multicall fails for this token
								const userHolder = sft.tokenHolders.find(
									(holder: { address: string }) =>
										holder.address.toLowerCase() === normalizedWalletAddress
								);
								walletBalance = userHolder ? BigInt(userHolder.balance) : 0n;
							}

							// Use wrapped token info from config
							const tokenConfig = getTokenByAnyAddress(sft.address);

							return {
								id: sft.id,
								address: sft.wrappedAddress, // Use wrapped address
								name: tokenConfig?.name ?? sft.name,
								symbol: tokenConfig?.symbol ?? sft.symbol,
								walletBalance,
								decimals: 18
							};
						});
					} catch (error) {
						console.error('Multicall failed for wallet holdings:', error);
						// Fall back to subgraph data for all tokens
						return $sfts.map((sft) => {
							const userHolder = sft.tokenHolders.find(
								(holder: { address: string }) =>
									holder.address.toLowerCase() === normalizedWalletAddress
							);
							const tokenConfig = getTokenByAnyAddress(sft.address);
							return {
								id: sft.id,
								address: tokenConfig?.address ?? sft.address,
								name: tokenConfig?.name ?? sft.name,
								symbol: tokenConfig?.symbol ?? sft.symbol,
								walletBalance: userHolder ? BigInt(userHolder.balance) : 0n,
								decimals: 18
							};
						});
					}
				}
			})
		)
	);

	// Query USDC wallet balance via multicall
	const usdcBalanceQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $currentNetwork, $wagmiConfig]) => ({
				queryKey: ['usdcWalletBalance', $walletAddress, $currentNetwork?.chainId],
				enabled: !!($isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig),
				refetchOnMount: 'always' as const,
				refetchInterval: QUERY_POLL_INTERVAL_MS,
				staleTime: QUERY_STALE_TIME_MS,
				queryFn: async () => {
					if (!$currentNetwork || !$walletAddress || !$wagmiConfig) return [];
					const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
					if (paymentTokens.length === 0) return [];

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
							.filter((balance): balance is NonNullable<typeof balance> => balance !== null);
					} catch (error) {
						console.error('Multicall failed for USDC balance:', error);
						return [];
					}
				}
			})
		)
	);

	// Query native ETH balance
	const ethBalanceQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $currentNetwork, $wagmiConfig]) => ({
				queryKey: ['ethWalletBalance', $walletAddress, $currentNetwork?.chainId],
				enabled: !!($isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig),
				refetchOnMount: 'always' as const,
				refetchInterval: QUERY_POLL_INTERVAL_MS,
				staleTime: QUERY_STALE_TIME_MS,
				queryFn: async () => {
					if (!$walletAddress || !$wagmiConfig) return null;
					try {
						const balance = await getBalance($wagmiConfig, {
							address: $walletAddress as `0x${string}`
						});
						return {
							id: 'eth',
							address: 'native',
							name: 'Ethereum',
							symbol: 'ETH',
							walletBalance: balance.value,
							decimals: 18
						};
					} catch (error) {
						console.error('Failed to fetch ETH balance:', error);
						return null;
					}
				}
			})
		)
	);

	// Query old (legacy) token wallet balances for aggregation in dashboard holdings
	const oldTokenBalancesQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $currentNetwork, $wagmiConfig]) => ({
				queryKey: ['dashboardOldTokenBalances', $walletAddress, $currentNetwork?.chainId],
				enabled: !!($isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig),
				refetchOnMount: 'always' as const,
				refetchInterval: QUERY_POLL_INTERVAL_MS,
				staleTime: QUERY_STALE_TIME_MS,
				queryFn: async () => {
					if (!$walletAddress || !$wagmiConfig) return [];
					const oldTokenAddresses = getAllOldTokenAddresses();

					const contracts = oldTokenAddresses.map((address) => ({
						abi: erc20Abi,
						address: address as `0x${string}`,
						functionName: 'balanceOf' as const,
						args: [$walletAddress as `0x${string}`]
					}));

					try {
						const results = await readContracts($wagmiConfig, { contracts });
						const tokens = oldTokenAddresses
							.map((address, index) => {
								const result = results[index];
								if (result.status === 'success') {
									const mapping = getMigrationMappingByAddress(address);
									return {
										address,
										walletBalance: result.result as bigint,
										symbol: mapping?.oldToken.symbol ?? 'Unknown',
										name: mapping?.oldToken.name ?? 'Unknown',
										decimals: mapping?.oldToken.decimals ?? 18,
										newTokenAddress: mapping?.newToken.address ?? null
									};
								}
								return null;
							})
							.filter(
								(token): token is NonNullable<typeof token> =>
									token !== null && token.walletBalance > 0n
							);

						// Deduplicate by address (defensive - prevents duplicate entries)
						const seen = new Set<string>();
						return tokens.filter((token) => {
							const key = token.address.toLowerCase();
							if (seen.has(key)) return false;
							seen.add(key);
							return true;
						});
					} catch (error) {
						console.error('Multicall failed for old token balances:', error);
						return [];
					}
				}
			})
		)
	);

	// Query unwrapped token balances (underlying tokens of ERC4626 vaults)
	const unwrappedTokenBalancesQuery = createQuery(
		derived(
			[isAuthenticated, walletAddress, currentNetwork, wagmiConfig],
			([$isAuthenticated, $walletAddress, $currentNetwork, $wagmiConfig]) => ({
				queryKey: ['dashboardUnwrappedTokenBalances', $walletAddress, $currentNetwork?.chainId],
				enabled: !!($isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig),
				refetchOnMount: 'always' as const,
				refetchInterval: QUERY_POLL_INTERVAL_MS,
				staleTime: QUERY_STALE_TIME_MS,
				queryFn: async () => {
					if (!$walletAddress || !$wagmiConfig) return [];
					const unwrappedAddresses = getAllUnwrappedTokenAddresses();

					const contracts = unwrappedAddresses.map((address) => ({
						abi: erc20Abi,
						address: address as `0x${string}`,
						functionName: 'balanceOf' as const,
						args: [$walletAddress as `0x${string}`]
					}));

					try {
						const results = await readContracts($wagmiConfig, { contracts });
						const tokens = unwrappedAddresses
							.map((address, index) => {
								const result = results[index];
								if (result.status === 'success') {
									const mapping = getWrappingMappingByUnwrappedAddress(address);
									return {
										address,
										walletBalance: result.result as bigint,
										symbol: mapping?.unwrappedToken.symbol ?? 'Unknown',
										name: mapping?.unwrappedToken.name ?? 'Unknown',
										decimals: mapping?.unwrappedToken.decimals ?? 18,
										wrappedTokenAddress: mapping?.wrappedToken.address ?? null,
										wrappedTokenSymbol: mapping?.wrappedToken.symbol ?? null
									};
								}
								return null;
							})
							.filter(
								(token): token is NonNullable<typeof token> =>
									token !== null && token.walletBalance > 0n
							);

						// Deduplicate by address (defensive - prevents duplicate entries)
						const seen = new Set<string>();
						return tokens.filter((token) => {
							const key = token.address.toLowerCase();
							if (seen.has(key)) return false;
							seen.add(key);
							return true;
						});
					} catch (error) {
						console.error('Multicall failed for unwrapped token balances:', error);
						return [];
					}
				}
			})
		)
	);

	// Combined portfolio: wallet + vaults (new wrapped tokens only)
	$: portfolioHoldings = (() => {
		const walletHoldings = $walletHoldingsQuery?.data ?? [];
		const usdcHoldings = $usdcBalanceQuery?.data ?? [];
		const vaultPages = $vaultsListQuery?.data?.pages ?? [];
		const allVaults = vaultPages.flatMap((p) => p.vaults ?? []);

		// Build map by token address
		const holdingsMap = new Map<
			string,
			{
				id: string;
				address: string;
				name: string;
				symbol: string;
				walletBalance: bigint;
				vaultBalance: bigint;
				decimals: number;
			}
		>();

		// Add wallet holdings (SFT tokens)
		for (const h of walletHoldings) {
			holdingsMap.set(h.address.toLowerCase(), {
				...h,
				vaultBalance: 0n
			});
		}

		// Add USDC/payment token wallet holdings
		for (const h of usdcHoldings) {
			holdingsMap.set(h.address.toLowerCase(), {
				...h,
				vaultBalance: 0n
			});
		}

		// Add vault balances
		for (const item of allVaults) {
			if (!item?.vault?.token) continue; // Skip if vault or token is undefined
			const { vault } = item;
			const tokenAddr = vault.token.address?.toLowerCase() ?? vault.token.id?.toLowerCase();
			if (!tokenAddr) continue; // Skip if no token address

			const existing = holdingsMap.get(tokenAddr);
			const vaultBal = BigInt(vault.balance || 0);

			if (existing) {
				existing.vaultBalance += vaultBal;
			} else {
				// Token in vault but not in wallet holdings (e.g., payment token)
				holdingsMap.set(tokenAddr, {
					id: vault.token.id ?? tokenAddr,
					address: vault.token.address ?? vault.token.id ?? tokenAddr,
					name: vault.token.name ?? 'Unknown',
					symbol: vault.token.symbol ?? '???',
					walletBalance: 0n,
					vaultBalance: vaultBal,
					decimals: Number(vault.token.decimals ?? 18)
				});
			}
		}

		// Convert to array with prices, filtering to only valid tokens
		const costBasisMap = $costBasisQuery?.data ?? new Map();
		const manualEntries = $manualCostBasisStore;

		const result = Array.from(holdingsMap.values())
			.filter((h) => validTokenAddresses.has(h.address.toLowerCase()))
			.map((h) => {
				const totalBalance = h.walletBalance + h.vaultBalance;
				const quote = findQuoteForSymbol(h.symbol, $priceFeedsQuery?.data ?? [], ALL_TOKENS);
				const price = quote?.close ?? 0;
				const priceChange = quote?.change ?? 0;
				const priceChangePercent = quote?.changePercent ?? 0;

				const balanceNum = parseFloat(formatUnits(totalBalance, h.decimals));
				const walletBalanceNum = parseFloat(formatUnits(h.walletBalance, h.decimals));
				const vaultBalanceNum = parseFloat(formatUnits(h.vaultBalance, h.decimals));

				// Get trade-based cost basis
				const costBasis = costBasisMap.get(h.address.toLowerCase());
				const trackedBalance = Math.min(balanceNum, costBasis?.netPosition ?? 0);
				const untrackedBalance = Math.max(0, balanceNum - trackedBalance);

				// Get manual cost basis entry for untracked tokens
				const manualEntry = manualEntries.get(h.address.toLowerCase());

				// Calculate P&L from trade-based cost basis (for tracked portion)
				const tradePnlData = calculatePnL(costBasis, balanceNum, price);

				// Calculate combined P&L including manual entries
				let combinedUnrealizedPnL: number | null = null;
				let combinedUnrealizedPnLPercent: number | null = null;
				let combinedAvgCostBasis: number | null = null;

				if (tradePnlData || manualEntry) {
					const tradeCost = tradePnlData?.totalCost ?? 0;
					const tradePnL = tradePnlData?.unrealizedPnL ?? 0;

					const manualQuantity = manualEntry?.quantity ?? 0;
					const effectiveManualQuantity = Math.min(manualQuantity, untrackedBalance);
					const manualCostPerUnit = manualEntry?.costPerUnit ?? 0;
					const manualCost = effectiveManualQuantity * manualCostPerUnit;
					const manualValue = effectiveManualQuantity * price;
					const manualPnL = manualValue - manualCost;

					const totalCost = tradeCost + manualCost;
					const totalTracked = trackedBalance + effectiveManualQuantity;

					if (totalTracked > 0 && totalCost > 0) {
						combinedAvgCostBasis = totalCost / totalTracked;
						combinedUnrealizedPnL = tradePnL + manualPnL;
						combinedUnrealizedPnLPercent = (combinedUnrealizedPnL / totalCost) * 100;
					} else if (tradePnlData) {
						combinedAvgCostBasis = costBasis?.avgCostBasis ?? null;
						combinedUnrealizedPnL = tradePnlData.unrealizedPnL;
						combinedUnrealizedPnLPercent = tradePnlData.unrealizedPnLPercent;
					}
				}

				return {
					...h,
					totalBalance: balanceNum,
					walletBalanceNum,
					vaultBalanceNum,
					price,
					value: balanceNum * price,
					priceChange,
					priceChangePercent,
					// Tracked vs untracked
					trackedBalance,
					untrackedBalance,
					manualEntry,
					// P&L fields (combined from trade + manual)
					unrealizedPnL: combinedUnrealizedPnL,
					unrealizedPnLPercent: combinedUnrealizedPnLPercent,
					avgCostBasis: combinedAvgCostBasis
				};
			})
			.filter((h) => h.totalBalance > 0)
			.sort((a, b) => b.value - a.value);

		return result;
	})();

	$: totalValue = portfolioHoldings.reduce((sum, h) => sum + h.value, 0);

	// Calculate total unrealized P&L (only from holdings with cost basis data)
	$: totalUnrealizedPnL = portfolioHoldings.reduce((sum, h) => sum + (h.unrealizedPnL ?? 0), 0);

	// Split portfolio into funds (payment tokens) and holdings (asset tokens)
	$: paymentTokenAddresses = (() => {
		if (!$currentNetwork) return new Set<string>();
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
		return new Set(paymentTokens.map((t) => t.address.toLowerCase()));
	})();

	// Build funds holdings (payment tokens + ETH)
	// Always show USDC even if balance is 0
	$: fundsHoldings = (() => {
		const funds = portfolioHoldings.filter((h) =>
			paymentTokenAddresses.has(h.address.toLowerCase())
		);

		// Ensure USDC is always shown (even with 0 balance)
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork?.chainId ?? 0] ?? [];
		for (const token of paymentTokens) {
			const exists = funds.some((f) => f.address.toLowerCase() === token.address.toLowerCase());
			if (!exists) {
				funds.push({
					id: token.address,
					address: token.address,
					name: token.name,
					symbol: token.symbol,
					walletBalance: 0n,
					vaultBalance: 0n,
					decimals: token.decimals,
					totalBalance: 0,
					walletBalanceNum: 0,
					vaultBalanceNum: 0,
					price: 1, // USDC is pegged to $1
					value: 0,
					priceChange: 0,
					priceChangePercent: 0,
					unrealizedPnL: null,
					unrealizedPnLPercent: null,
					avgCostBasis: null,
					trackedBalance: 0,
					untrackedBalance: 0,
					manualEntry: undefined
				});
			}
		}

		// Add ETH if we have a balance
		const ethData = $ethBalanceQuery?.data;
		if (ethData && ethData.walletBalance > 0n) {
			const walletBalanceNum = parseFloat(formatUnits(ethData.walletBalance, 18));
			funds.unshift({
				id: 'eth',
				address: 'native',
				name: 'Ethereum',
				symbol: 'ETH',
				walletBalance: ethData.walletBalance,
				vaultBalance: 0n,
				decimals: 18,
				totalBalance: walletBalanceNum,
				walletBalanceNum,
				vaultBalanceNum: 0,
				price: 0, // ETH price not tracked in our feeds
				value: 0,
				priceChange: 0,
				priceChangePercent: 0,
				unrealizedPnL: null,
				unrealizedPnLPercent: null,
				avgCostBasis: null,
				trackedBalance: 0,
				untrackedBalance: 0,
				manualEntry: undefined
			});
		}

		return funds;
	})();
	$: assetHoldings = portfolioHoldings.filter(
		(h) =>
			!paymentTokenAddresses.has(h.address.toLowerCase()) &&
			(!hideDust || h.totalBalance >= DUST_THRESHOLD)
	);

	// Legacy token holdings (old tokens that need to be swapped)
	// Exclude addresses that are already in the unwrapped token list (handles case where unwrappedAddress === legacyAddress)
	$: legacyHoldings = (() => {
		const oldTokens = $oldTokenBalancesQuery?.data ?? [];
		const unwrappedAddresses = new Set(
			($unwrappedTokenBalancesQuery?.data ?? []).map((t) => t.address.toLowerCase())
		);
		return oldTokens
			.filter((token) => !unwrappedAddresses.has(token.address.toLowerCase()))
			.map((token) => {
				const mapping = getMigrationMappingByAddress(token.address);
				const quote = mapping
					? findQuoteForSymbol(mapping.newToken.symbol, $priceFeedsQuery?.data ?? [], ALL_TOKENS)
					: null;
				const price = quote?.close ?? 0;
				const balanceNum = parseFloat(formatUnits(token.walletBalance, token.decimals));
				return {
					...token,
					balanceNum,
					price,
					value: balanceNum * price,
					newTokenDisplay: mapping ? `Wrapped ${mapping.oldToken.symbol}` : token.symbol
				};
			})
			.filter((token) => !hideDust || token.balanceNum >= DUST_THRESHOLD);
	})();

	// Unwrapped token holdings (underlying tokens that can be wrapped)
	$: unwrappedHoldings = (() => {
		const tokens = $unwrappedTokenBalancesQuery?.data ?? [];
		return tokens
			.map((token) => {
				const mapping = getWrappingMappingByUnwrappedAddress(token.address);
				// Use the wrapped token's price since they're 1:1
				const quote = mapping
					? findQuoteForSymbol(
							mapping.wrappedToken.symbol,
							$priceFeedsQuery?.data ?? [],
							ALL_TOKENS
						)
					: null;
				const price = quote?.close ?? 0;
				const balanceNum = parseFloat(formatUnits(token.walletBalance, token.decimals));
				return {
					...token,
					balanceNum,
					price,
					value: balanceNum * price,
					wrappedTokenSymbol: mapping?.wrappedToken.symbol ?? token.symbol
				};
			})
			.filter((token) => !hideDust || token.balanceNum >= DUST_THRESHOLD);
	})();

	// Orders: Fetch orderbook quotes for all tokens
	$: orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork, GLOBAL_ORDERBOOK_POLL_MS);

	// Taker trades for market orders - poll every 10 minutes
	$: takerTradesQuery = createTakerTradesQuery($currentNetwork, $walletAddress, 600_000);

	// Cost basis query for P&L calculation - one-shot (no polling, refreshes on window focus)
	$: costBasisQuery = createCostBasisQuery($currentNetwork, $walletAddress);

	// Load manual cost basis entries when wallet changes
	$: manualCostBasisStore.loadForWallet($walletAddress);

	// Transform taker trades into display orders
	$: userMarketOrders = (() => {
		const trades = $takerTradesQuery?.data?.trades;
		if (!trades?.length || !$currentNetwork) return [];
		return transformApiTakerTradesToDisplay(trades, $currentNetwork.chainId);
	})();

	// Extract user's order hashes for batch trades query
	$: userOrderHashes = (() => {
		if (!$orderbookQuotesQuery.data?.quotes || !$walletAddress) return [] as string[];
		const myAddress = $walletAddress.toLowerCase();
		return $orderbookQuotesQuery.data.quotes
			.filter((q) => q.sgOrder?.owner?.toLowerCase() === myAddress)
			.map((q) => q.orderHash);
	})();

	// Fetch trade fill data for user's deployed orders
	$: batchTradesQuery = createBatchTradesQuery($currentNetwork, userOrderHashes, 600_000);

	// Combined orders (limit + market)
	$: allOrders = (() => {
		const displayOrders: DisplayOrder[] = [];
		const tradesMap = $batchTradesQuery?.data;

		// Add limit orders from quotes (only user's orders)
		if ($orderbookQuotesQuery.data?.quotes && $walletAddress) {
			const myAddress = $walletAddress.toLowerCase();
			const myQuotes = $orderbookQuotesQuery.data.quotes.filter(
				(q) => q.sgOrder?.owner?.toLowerCase() === myAddress
			);

			for (const quote of myQuotes) {
				const isBuy = quote.side === 'bid';
				const tokenSymbol = isBuy ? quote.inputTokenSymbol : quote.outputTokenSymbol;
				const tokenAddress = isBuy
					? getMakerInputTokenAddress(quote)
					: getMakerOutputTokenAddress(quote);
				const maxOutputBigInt = parseFloatHex(
					quote.maxOutput,
					isBuy ? quote.inputTokenDecimals || 18 : quote.outputTokenDecimals || 18
				);
				const isFilled = maxOutputBigInt === 0n;
				// Use the classified order type, defaulting to 'limit' if not set
				const orderType = quote.orderType ?? 'limit';

				// Compute filled amount from batch trades
				let filled: number | undefined;
				let filledSymbol: string | undefined;
				const trades = tradesMap?.get(quote.orderHash.toLowerCase());
				if (trades?.length) {
					let totalFilled = 0;
					for (const trade of trades) {
						// Buy: order receives asset (inputAmount), Sell: order gives asset (outputAmount)
						totalFilled += Math.abs(parseFloat(isBuy ? trade.inputAmount : trade.outputAmount));
					}
					if (totalFilled > 0) {
						filled = totalFilled;
						filledSymbol = tokenSymbol;
					}
				}

				displayOrders.push({
					type: orderType === 'dynamic-spread' ? 'custom' : orderType,
					orderHash: quote.orderHash,
					timestamp: quote.sgOrder?.timestampAdded ? Number(quote.sgOrder.timestampAdded) : 0,
					side: isBuy ? 'Buy' : 'Sell',
					quote,
					tokenSymbol,
					tokenAddress,
					inputTokenSymbol: quote.inputTokenSymbol,
					outputTokenSymbol: quote.outputTokenSymbol,
					price: quote.quotePerAsset,
					filled,
					filledSymbol,
					isActive: quote.sgOrder?.active ?? true,
					isFilled
				});
			}
		}

		// Add market orders (from REST API taker trades)
		for (const order of userMarketOrders) {
			displayOrders.push(order);
		}

		// Filter to only valid tokens, then sort by timestamp descending
		return displayOrders
			.filter((o) => validTokenAddresses.has(o.tokenAddress.toLowerCase()))
			.sort((a, b) => b.timestamp - a.timestamp);
	})();

	// Vaults: sorted with default vault first for each token, filtered to valid tokens only
	$: sortedVaults = (() => {
		const vaultPages = $vaultsListQuery?.data?.pages ?? [];
		const allVaults = vaultPages
			.flatMap((p) => p.vaults ?? [])
			.filter((v) => v?.vault?.token)
			.filter((v) => {
				const tokenAddr = v.vault.token?.address?.toLowerCase() ?? v.vault.token?.id?.toLowerCase();
				return tokenAddr && validTokenAddresses.has(tokenAddr);
			});

		// Sort: default vault (0x1) first, then by balance descending
		return allVaults.sort((a, b) => {
			// First, group by token
			const tokenA = a.vault.token?.symbol ?? '';
			const tokenB = b.vault.token?.symbol ?? '';
			if (tokenA !== tokenB) return tokenA.localeCompare(tokenB);

			// Within same token, default vault first
			const aIsDefault = a.vault.vaultId === DEFAULT_VAULT_ID;
			const bIsDefault = b.vault.vaultId === DEFAULT_VAULT_ID;
			if (aIsDefault && !bIsDefault) return -1;
			if (!aIsDefault && bIsDefault) return 1;

			// Then by balance descending
			return Number(BigInt(b.vault.balance || 0) - BigInt(a.vault.balance || 0));
		});
	})();

	// Split vaults into default and non-default (both filtered by balance > 0)
	$: defaultVaults = sortedVaults.filter(
		(v) => v.vault.vaultId === DEFAULT_VAULT_ID && BigInt(v.vault.balance) > 0n
	);

	// Build set of order hashes that involve tStock vaults
	// This includes orders where either input or output vault contains a tStock token
	$: tStockOrderHashes = (() => {
		const orderHashes = new Set<string>();
		for (const { vault } of sortedVaults) {
			const tokenAddress = vault.token?.address?.toLowerCase();
			const isTStock = tokenAddress ? tStockAddresses.has(tokenAddress) : false;
			if (isTStock) {
				// Add all orders where this tStock vault is input or output
				for (const order of vault.ordersAsInput ?? []) {
					if (order.orderHash) orderHashes.add(order.orderHash.toLowerCase());
				}
				for (const order of vault.ordersAsOutput ?? []) {
					if (order.orderHash) orderHashes.add(order.orderHash.toLowerCase());
				}
			}
		}
		return orderHashes;
	})();

	// Filter non-default vaults to only show those connected to tStock orders
	$: allNonDefaultVaults = sortedVaults.filter((v) => {
		if (v.vault.vaultId === DEFAULT_VAULT_ID) return false;
		if (BigInt(v.vault.balance) <= 0n) return false;

		// Check if vault is connected to any tStock order
		const vaultOrders = [...(v.vault.ordersAsInput ?? []), ...(v.vault.ordersAsOutput ?? [])];
		return vaultOrders.some((order) => {
			const hash = order.orderHash?.toLowerCase();
			return hash ? tStockOrderHashes.has(hash) : false;
		});
	});

	$: nonDefaultVaults = showDustVaults
		? allNonDefaultVaults
		: allNonDefaultVaults.filter((v) => {
				const balance = BigInt(v.vault.balance);
				const decimals = Number(v.vault.token?.decimals ?? 18);
				const balanceNum = parseFloat(formatUnits(balance, decimals));
				return balanceNum >= DUST_THRESHOLD;
			});
	$: dustVaultsCount = allNonDefaultVaults.length - nonDefaultVaults.length;

	$: activeOrdersCount = allOrders.filter((o) => o.type !== 'market' && o.isActive).length;
	$: activeVaultsCount = sortedVaults.filter((v) => BigInt(v.vault.balance) > 0n).length;

	// Check if wallet is embedded (hide track token buttons for embedded wallets)
	$: isEmbeddedWallet = $authMethod === 'dynamic' && $dynamicSession?.walletType === 'embedded';
</script>

<!-- Main Content -->
<div class="relative z-10 min-h-screen text-white">
	<PageContainer>
		{#if isNetworkLoading}
			<div class="flex flex-col items-center justify-center gap-4 py-8">
				<LoadingSpinner
					variant="inline"
					size="md"
					text="Switching to {$currentNetwork?.displayName || 'network'}..."
				/>
			</div>
		{:else if !$isAuthenticated}
			<WalletConnectionPrompt
				description="Connect your wallet to access your dashboard and view your portfolio, orders, and vault positions on {$currentNetwork?.displayName ||
					'this network'}."
			/>
		{:else}
			<!-- Dashboard Header -->
			<Section>
				<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">My Dashboard</h1>
						<div class="flex items-center gap-2 text-gray-400">
							<span class="sm:hidden">…{($walletAddress || '').slice(-6)}</span>
							<span class="hidden sm:inline">{truncateAddress($walletAddress || '')}</span>
							<!-- Copy button -->
							<button
								type="button"
								on:click={copyAddress}
								class="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300"
								title="Copy address"
							>
								{#if addressCopied}
									<svg
										class="h-4 w-4 text-green-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								{/if}
							</button>
							<!-- Basescan link -->
							<a
								href={basescanUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300"
								title="View on Basescan"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</a>
						</div>
					</div>
					<div class="flex gap-2">
						<Button variant="primary" size="sm" on:click={() => openDepositModal()}>
							<span class="flex items-center gap-1.5">
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
								Deposit
							</span>
						</Button>
						{#if $authMethod === 'dynamic'}
							<Button variant="secondary" size="sm" on:click={() => openSendFundsModal()}>
								<span class="flex items-center gap-1.5">
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
										/>
									</svg>
									Withdraw
								</span>
							</Button>
						{/if}
					</div>
				</div>

				<!-- Overview Stats -->
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
					<MetricCard
						label="Total Value"
						value={`$${totalValue.toFixed(2)}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
					<div class="hidden sm:block">
						<MetricCard
							label="Unrealized P&L"
							value={$costBasisQuery?.isLoading
								? 'Loading...'
								: totalUnrealizedPnL === 0
									? '$0.00'
									: `${totalUnrealizedPnL >= 0 ? '+' : ''}$${totalUnrealizedPnL.toFixed(2)}`}
							paddingClass="p-4"
							showGradient={false}
							change=""
							valueClass={`text-2xl font-bold ${
								$costBasisQuery?.isLoading
									? 'animate-pulse text-gray-400'
									: totalUnrealizedPnL > 0
										? 'text-green-400'
										: totalUnrealizedPnL < 0
											? 'text-red-400'
											: 'text-gray-400'
							}`}
						/>
					</div>
					<MetricCard
						label="Active Orders"
						value={`${activeOrdersCount}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
					<MetricCard
						label="Active Vaults"
						value={`${activeVaultsCount}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
				</div>
			</Section>

			<!-- Tab Navigation -->
			<TabNav activeId={activeTab} on:change={handleDashboardTabChange} tabs={DASHBOARD_TABS} />

			<!-- Portfolio Tab -->
			{#if activeTab === 'portfolio'}
				<!-- Hide Dust Checkbox -->
				<div class="flex justify-end px-1 pb-2 pt-1">
					<label
						class="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400 sm:gap-2 sm:text-sm"
					>
						<input
							type="checkbox"
							bind:checked={hideDust}
							class="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 sm:h-4 sm:w-4"
						/>
						Hide dust
					</label>
				</div>
				{#if $walletHoldingsQuery.isLoading || $vaultsListQuery.isLoading || $usdcBalanceQuery.isLoading}
					<Section>
						<LoadingSpinner variant="inline" size="md" text="Loading portfolio..." />
					</Section>
				{:else}
					<!-- Funds Section (Payment Tokens) -->
					<Section>
						<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Funds</h2>
						<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
							Payment tokens available for trading
						</p>
						{#if fundsHoldings.length > 0}
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Wallet</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Vaults</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Total</th
											>
											{#if $authMethod === 'dynamic'}
												<th
													class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												></th>
											{/if}
										</tr>
									</thead>
									<tbody>
										{#each fundsHoldings as holding}
											{@const isEth = holding.address === 'native'}
											{@const paymentToken = isEth
												? null
												: (PAYMENT_TOKENS_BY_NETWORK[$currentNetwork?.chainId ?? 0] ?? []).find(
														(t) => t.address.toLowerCase() === holding.address.toLowerCase()
													)}
											{@const logoUrl = isEth ? '/images/ETH.svg' : paymentToken?.logoUrl}
											{@const decimalsForDisplay = holding.decimals === 6 ? 2 : 4}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<TokenDisplay {logoUrl} symbol={holding.symbol} name={holding.name} />
												</td>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.walletBalanceNum.toFixed(decimalsForDisplay)}</td
												>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.vaultBalanceNum.toFixed(decimalsForDisplay)}</td
												>
												<td class="px-2 py-2 text-xs font-medium sm:px-4 sm:py-3 sm:text-sm"
													>{holding.totalBalance.toFixed(decimalsForDisplay)}</td
												>
												{#if $authMethod === 'dynamic'}
													<td class="px-2 py-2 sm:px-4 sm:py-3">
														{#if holding.walletBalanceNum > 0}
															<Button
																variant="secondary"
																size="sm"
																on:click={() => handleWithdraw(holding)}
															>
																Withdraw
															</Button>
														{:else}
															<span class="text-gray-500">—</span>
														{/if}
													</td>
												{/if}
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						{:else}
							<EmptyState description="No funds found in your wallet or vaults." />
						{/if}
					</Section>

					<!-- Holdings Section (Asset Tokens) -->
					<Section>
						<div id="holdings"></div>
						<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Holdings</h2>
						<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
							Wrapped tokens combined across wallet and vaults. We recommend only using wrapped
							tokens for DEX/DeFi usage.
						</p>
						{#if assetHoldings.length > 0}
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Wallet</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Vaults</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Holdings</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Price</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Cost Basis</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Value</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>P&L</th
											>
											<th
												class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											></th>
										</tr>
									</thead>
									<tbody>
										{#each assetHoldings as holding}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<TokenDisplay
														logoUrl={getTokenByAnyAddress(holding.address)?.logoUrl}
														symbol={holding.symbol}
														name={holding.name}
														hideNameOnMobile={true}
													/>
												</td>
												<td
													class="hidden px-2 py-2 text-sm text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.walletBalanceNum.toFixed(4)}</td
												>
												<td
													class="hidden px-2 py-2 text-sm text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.vaultBalanceNum.toFixed(4)}</td
												>
												<td class="px-2 py-2 text-xs font-medium sm:px-4 sm:py-3 sm:text-sm"
													>{holding.totalBalance.toFixed(4)}</td
												>
												<td class="hidden px-2 py-2 text-sm sm:table-cell sm:px-4 sm:py-3"
													>${holding.price.toFixed(2)}</td
												>
												<td class="hidden px-2 py-2 text-sm sm:table-cell sm:px-4 sm:py-3">
													{#if $costBasisQuery?.isLoading}
														<span class="animate-pulse text-gray-400">Loading...</span>
													{:else}
														<div class="flex items-center gap-1">
															{#if holding.avgCostBasis !== null}
																<span>${holding.avgCostBasis.toFixed(2)}</span>
															{:else}
																<span class="text-gray-500">—</span>
															{/if}
															{#if holding.untrackedBalance > 0.0001}
																<button
																	type="button"
																	on:click={() => openCostBasisModal(holding)}
																	class="ml-1 rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-yellow-400"
																	title={holding.manualEntry
																		? `Edit cost basis for ${holding.untrackedBalance.toFixed(
																				4
																			)} untracked tokens`
																		: `Add cost basis for ${holding.untrackedBalance.toFixed(
																				4
																			)} untracked tokens`}
																>
																	<svg
																		class="h-3.5 w-3.5"
																		fill="none"
																		stroke="currentColor"
																		viewBox="0 0 24 24"
																	>
																		<path
																			stroke-linecap="round"
																			stroke-linejoin="round"
																			stroke-width="2"
																			d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
																		/>
																	</svg>
																</button>
															{/if}
														</div>
														{#if holding.untrackedBalance > 0.0001 && !holding.manualEntry}
															<div class="mt-0.5 text-xs text-yellow-500/70">
																{holding.untrackedBalance.toFixed(2)} untracked
															</div>
														{/if}
													{/if}
												</td>
												<td class="px-2 py-2 text-xs font-medium sm:px-4 sm:py-3 sm:text-sm"
													>${holding.value.toFixed(2)}</td
												>
												<td class="px-2 py-2 text-sm sm:px-4 sm:py-3">
													{#if $costBasisQuery?.isLoading}
														<span class="animate-pulse text-gray-400">Loading...</span>
													{:else if holding.unrealizedPnL !== null}
														<div
															class={holding.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}
														>
															<div class="font-medium">
																{holding.unrealizedPnLPercent !== null
																	? `${
																			holding.unrealizedPnLPercent >= 0 ? '+' : ''
																		}${holding.unrealizedPnLPercent.toFixed(1)}%`
																	: '—'}
															</div>
															<div class="hidden text-xs opacity-75 sm:block">
																{holding.unrealizedPnL >= 0
																	? '+'
																	: ''}${holding.unrealizedPnL.toFixed(2)}
															</div>
														</div>
													{:else if holding.untrackedBalance > 0.0001}
														<button
															type="button"
															on:click={() => openCostBasisModal(holding)}
															class="text-yellow-500/70 underline decoration-dotted underline-offset-2 transition hover:text-yellow-400"
														>
															Add cost basis
														</button>
													{:else}
														<span class="text-gray-500">—</span>
													{/if}
												</td>
												<td class="px-2 py-2 sm:px-4 sm:py-3">
													<div class="flex justify-center gap-2">
														<Button
															size="sm"
															variant="primary"
															on:click={() => goto(`/trade/${holding.id}`)}>Trade</Button
														>
														{#if getWrappingMappingByWrappedAddress(holding.address) && holding.walletBalanceNum > 0}
															<Button
																size="sm"
																variant="secondary"
																on:click={() => handleUnwrapToken(holding)}
															>
																Unwrap
															</Button>
														{/if}
														{#if $authMethod === 'dynamic' && holding.walletBalanceNum > 0}
															<Button
																size="sm"
																variant="secondary"
																on:click={() => handleWithdraw(holding)}
															>
																Transfer
															</Button>
														{/if}
														{#if !isEmbeddedWallet}
															<button
																type="button"
																on:click={() =>
																	addTokenToWallet({
																		address: holding.address,
																		symbol: holding.symbol,
																		decimals: holding.decimals,
																		image: getTokenByAnyAddress(holding.address)?.logoUrl
																	})}
																class="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300"
																title="Track in Wallet"
																aria-label="Track in Wallet"
															>
																<svg
																	class="h-4 w-4"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="2"
																>
																	<path
																		d="M12 5v14M5 12h14"
																		stroke-linecap="round"
																		stroke-linejoin="round"
																	/>
																</svg>
															</button>
														{/if}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						{:else}
							<EmptyState description="No asset holdings found in your wallet or vaults." />
						{/if}
					</Section>

					<!-- Unwrapped Tokens Section -->
					{#if unwrappedHoldings.length > 0}
						<Section>
							<h2 class="mb-3 text-base font-semibold text-yellow-500 sm:mb-4 sm:text-lg">
								Unwrapped Tokens
							</h2>
							<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
								Unwrapped tokens are always redeemable for 1 unit of off-chain equity. We recommend
								wrapping them for safe use with DEX/DeFi protocols.
							</p>
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Balance</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Value</th
											>
											<th
												class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											></th>
										</tr>
									</thead>
									<tbody>
										{#each unwrappedHoldings as token (token.address)}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<span class="font-medium">{token.symbol}</span>
												</td>
												<td class="px-2 py-2 text-sm sm:px-4 sm:py-3"
													>{token.balanceNum.toFixed(4)}</td
												>
												<td class="px-2 py-2 text-sm sm:px-4 sm:py-3">${token.value.toFixed(2)}</td>
												<td class="px-2 py-2 sm:px-4 sm:py-3">
													<div class="flex justify-center gap-2">
														<Button
															size="sm"
															variant="primary"
															on:click={() => handleWrapToken(token)}
														>
															Wrap
														</Button>
														{#if $authMethod === 'dynamic'}
															<Button
																size="sm"
																variant="secondary"
																on:click={() =>
																	handleWithdraw({
																		symbol: token.symbol,
																		address: token.address,
																		decimals: token.decimals,
																		walletBalance: token.walletBalance,
																		walletBalanceNum: token.balanceNum
																	})}
															>
																Transfer
															</Button>
														{/if}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						</Section>
					{/if}

					<!-- Legacy Tokens Section -->
					{#if legacyHoldings.length > 0}
						<Section>
							<h2 class="mb-3 text-base font-semibold text-yellow-500 sm:mb-4 sm:text-lg">
								Legacy Tokens
							</h2>
							<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
								Legacy tokens maintain full equity backing and right of redemption, but should be
								swapped ASAP to receive dividends, stock splits, and be compatible with DeFi
								protocols.
							</p>
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Balance</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Value</th
											>
											<th
												class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											></th>
										</tr>
									</thead>
									<tbody>
										{#each legacyHoldings as token (token.address)}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<span class="font-medium">{token.symbol}</span>
												</td>
												<td class="px-2 py-2 text-sm sm:px-4 sm:py-3"
													>{formatUnits(token.walletBalance, token.decimals)}</td
												>
												<td class="px-2 py-2 text-sm sm:px-4 sm:py-3">${token.value.toFixed(2)}</td>
												<td class="px-2 py-2 sm:px-4 sm:py-3">
													<div class="flex justify-center">
														<Button
															size="sm"
															variant="primary"
															className="bg-yellow-500 hover:bg-yellow-400"
															on:click={() => handleSwapLegacyToken(token)}
														>
															Swap
														</Button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						</Section>
					{/if}
				{/if}

				<!-- Orders Tab -->
			{:else if activeTab === 'orders'}
				<Section>
					<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Your Orders</h2>
					<OrdersTable
						orders={allOrders}
						isLoading={$orderbookQuotesQuery.isLoading}
						isError={$orderbookQuotesQuery.isError}
						errorMessage={$orderbookQuotesQuery.error?.message ?? ''}
						showOwnerFilter={false}
					/>
				</Section>

				<!-- Vaults Tab -->
			{:else if activeTab === 'vaults'}
				<Section>
					{#if $vaultsListQuery.isLoading}
						<LoadingSpinner variant="inline" size="md" text="Loading vaults..." />
					{:else if $vaultsListQuery.isError}
						<div class="py-8 text-center text-sm text-red-400">
							Error loading vaults: {$vaultsListQuery.error?.message}
						</div>
					{:else if sortedVaults.length === 0}
						<EmptyState description="No vaults found." />
					{:else}
						<!-- Default Vaults Section -->
						<div class="mb-6 sm:mb-8">
							<h2 class="mb-2 text-base font-semibold sm:text-lg">Default Vaults</h2>
							<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
								Your primary vault for each token
							</p>
							{#if defaultVaults.length === 0}
								<div class="py-4 text-sm text-gray-500">
									No default vaults found. Default vaults are created automatically when you make a
									limit or DCA order.
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
												<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Token</th>
												<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Balance</th>
												<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
													>Orders</th
												>
												<th class="pb-2 font-medium sm:pb-3"></th>
											</tr>
										</thead>
										<tbody>
											{#each defaultVaults as { vault, raindexVault }}
												{@const balance = BigInt(vault.balance)}
												{@const decimals = Number(vault.token.decimals ?? 18)}
												{@const balanceNum = parseFloat(formatUnits(balance, decimals))}
												{@const ordersCount =
													(vault.ordersAsInput?.length ?? 0) + (vault.ordersAsOutput?.length ?? 0)}
												<tr class="hover:bg-white/5">
													<td class="py-2 pr-2 sm:py-3 sm:pr-4">
														<div class="flex items-center gap-2">
															<span class="text-xs text-gray-200 sm:text-sm"
																>{vault.token.symbol}</span
															>
															<a
																href={getRaindexVaultUrl(
																	$currentNetwork?.chainId ?? 8453,
																	vault.orderbook.id,
																	vault.id
																)}
																target="_blank"
																rel="noopener noreferrer"
																class="text-blue-400 hover:text-blue-300"
																title="View on Raindex"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-3.5 w-3.5 sm:h-4 sm:w-4"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		stroke-width="2"
																		d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
																	/>
																</svg>
															</a>
														</div>
													</td>
													<td class="py-2 pr-2 text-xs text-gray-300 sm:py-3 sm:pr-4 sm:text-sm"
														>{balanceNum.toFixed(4)}</td
													>
													<td class="hidden py-2 pr-2 text-gray-400 sm:table-cell sm:py-3 sm:pr-4"
														>{ordersCount}</td
													>
													<td class="py-2 sm:py-3">
														{#if balance > 0n}
															<Button
																variant="danger"
																size="sm"
																on:click={() => transactionStore.handleWithdraw(raindexVault)}
																>Withdraw</Button
															>
														{:else}
															<span class="text-gray-500">—</span>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>

						<!-- Non-Default Vaults Section -->
						{#if allNonDefaultVaults.length > 0}
							<div>
								<div class="mb-3 flex items-center justify-between sm:mb-4">
									<div>
										<h2 class="text-base font-semibold sm:text-lg">Other Vaults</h2>
										<p class="hidden text-sm text-gray-400 sm:block">
											Additional vaults with custom IDs
										</p>
									</div>
									{#if dustVaultsCount > 0 || showDustVaults}
										<label
											class="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400 sm:gap-2 sm:text-sm"
										>
											<input
												type="checkbox"
												bind:checked={showDustVaults}
												class="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 sm:h-4 sm:w-4"
											/>
											<span class="sm:hidden">Dust ({dustVaultsCount})</span>
											<span class="hidden sm:inline"
												>Show dust ({dustVaultsCount} vault{dustVaultsCount === 1 ? '' : 's'})</span
											>
										</label>
									{/if}
								</div>
								{#if nonDefaultVaults.length > 0}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
													<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Token</th>
													<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
														>Vault ID</th
													>
													<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Balance</th>
													<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
														>Orders</th
													>
													<th class="pb-2 font-medium sm:pb-3"></th>
												</tr>
											</thead>
											<tbody>
												{#each nonDefaultVaults as { vault, raindexVault }}
													{@const balance = BigInt(vault.balance)}
													{@const decimals = Number(vault.token.decimals ?? 18)}
													{@const balanceNum = parseFloat(formatUnits(balance, decimals))}
													{@const ordersCount =
														(vault.ordersAsInput?.length ?? 0) +
														(vault.ordersAsOutput?.length ?? 0)}
													<tr class="hover:bg-white/5">
														<td class="py-2 pr-2 sm:py-3 sm:pr-4">
															<span class="text-xs text-gray-200 sm:text-sm"
																>{vault.token.symbol}</span
															>
														</td>
														<td class="hidden py-2 pr-2 sm:table-cell sm:py-3 sm:pr-4">
															<a
																href={getRaindexVaultUrl(
																	$currentNetwork?.chainId ?? 8453,
																	vault.orderbook.id,
																	vault.id
																)}
																target="_blank"
																rel="noopener noreferrer"
																class="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
																title={vault.vaultId}
															>
																{vault.vaultId.slice(0, 10)}...{vault.vaultId.slice(-6)}
															</a>
														</td>
														<td class="py-2 pr-2 text-xs text-gray-300 sm:py-3 sm:pr-4 sm:text-sm"
															>{balanceNum.toFixed(4)}</td
														>
														<td class="hidden py-2 pr-2 text-gray-400 sm:table-cell sm:py-3 sm:pr-4"
															>{ordersCount}</td
														>
														<td class="py-2 sm:py-3">
															{#if balance > 0n}
																<Button
																	variant="danger"
																	size="sm"
																	on:click={() => transactionStore.handleWithdraw(raindexVault)}
																	>Withdraw</Button
																>
															{:else}
																<span class="text-gray-500">—</span>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<div class="py-4 text-sm text-gray-500">
										All other vaults contain only dust amounts.
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</Section>

				<!-- Wallet Management Tab (Dynamic only) -->
			{:else if activeTab === 'wallet' && $authMethod === 'dynamic'}
				<Section>
					<div class="space-y-6">
						<!-- Wallet Actions -->
						<div>
							<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Wallet Actions</h2>
							<div class="flex flex-wrap gap-3">
								<Button variant="primary" on:click={() => openDepositModal()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 4v16m8-8H4"
											/>
										</svg>
										Deposit
									</span>
								</Button>
								<Button variant="secondary" on:click={() => openSendFundsModal()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
											/>
										</svg>
										Withdraw
									</span>
								</Button>
								<Button variant="ghost" on:click={() => exportDynamicWallet()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
											/>
										</svg>
										Export Private Key
									</span>
								</Button>
							</div>
						</div>

						<!-- Transaction History -->
						<div>
							<div class="mb-3 flex items-center justify-between sm:mb-4">
								<div>
									<h2 class="text-base font-semibold sm:text-lg">Transaction History</h2>
									<p class="text-sm text-gray-400">Raw blockchain transactions from your wallet</p>
								</div>
								<a
									href={basescanUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
								>
									View all on Basescan
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
								</a>
							</div>
							<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center">
								<p class="text-sm text-gray-400">
									Transaction history is available on Basescan. Click the link above to view all
									your wallet transactions.
								</p>
							</div>
						</div>
					</div>
				</Section>
			{/if}
		{/if}
	</PageContainer>

	<!-- Footer -->
	<Footer />
</div>

<!-- Manual Cost Basis Entry Modal -->
{#if showCostBasisModal && costBasisEditToken}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		on:click={closeCostBasisModal}
		on:keydown={(e) => e.key === 'Escape' && closeCostBasisModal()}
		role="presentation"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="cost-basis-modal-title"
		>
			<h3 id="cost-basis-modal-title" class="mb-4 text-lg font-semibold text-white">
				{costBasisEditToken.existingEntry ? 'Edit' : 'Add'} Cost Basis for {costBasisEditToken.symbol}
			</h3>

			<p class="mb-4 text-sm text-gray-400">
				You have <span class="font-medium text-yellow-400"
					>{costBasisEditToken.untrackedBalance.toFixed(4)}</span
				> tokens without trade history. Enter the cost basis for these tokens.
			</p>

			<div class="space-y-4">
				<div>
					<label for="cb-quantity" class="mb-1 block text-sm font-medium text-gray-300">
						Quantity
					</label>
					<input
						id="cb-quantity"
						type="number"
						step="any"
						min="0"
						max={costBasisEditToken.untrackedBalance}
						bind:value={costBasisInputQuantity}
						class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
						placeholder="0.0000"
					/>
					<p class="mt-1 text-xs text-gray-500">
						Max: {costBasisEditToken.untrackedBalance.toFixed(4)}
					</p>
				</div>

				<div>
					<label for="cb-price" class="mb-1 block text-sm font-medium text-gray-300">
						Cost per Token (USD)
					</label>
					<input
						id="cb-price"
						type="number"
						step="any"
						min="0"
						bind:value={costBasisInputPrice}
						class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
						placeholder="0.00 (use 0 for gifts/airdrops)"
					/>
				</div>

				<div>
					<label for="cb-note" class="mb-1 block text-sm font-medium text-gray-300">
						Note <span class="text-gray-500">(optional)</span>
					</label>
					<input
						id="cb-note"
						type="text"
						bind:value={costBasisInputNote}
						class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
						placeholder="e.g., Gift, Purchased on Coinbase"
					/>
				</div>

				{#if costBasisInputQuantity && costBasisInputPrice}
					<div class="rounded-lg bg-gray-800/50 p-3">
						<div class="flex justify-between text-sm">
							<span class="text-gray-400">Total Cost:</span>
							<span class="font-medium text-white">
								${(parseFloat(costBasisInputQuantity) * parseFloat(costBasisInputPrice)).toFixed(2)}
							</span>
						</div>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex gap-3">
				{#if costBasisEditToken.existingEntry}
					<button
						type="button"
						on:click={removeCostBasisEntry}
						class="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
					>
						Remove
					</button>
				{/if}
				<div class="flex-1"></div>
				<button
					type="button"
					on:click={closeCostBasisModal}
					class="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5"
				>
					Cancel
				</button>
				<button
					type="button"
					on:click={saveCostBasisEntry}
					class="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-yellow-400"
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Token Swap Modal for migrating old tokens -->
<TokenSwapModal />

<!-- Wrap/Unwrap Modal for ERC4626 token wrapping -->
<WrapUnwrapModal />
