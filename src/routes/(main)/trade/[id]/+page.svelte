<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { currentNetwork, oracleQuotes, tradePanelOpen } from '$lib/stores';
	import { formatUnits } from 'viem';
	import { TOKENS, getTokenByAnyAddress } from '$lib/config/network';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import LimitOrder from '$lib/components/orders/LimitOrder.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import TradingViewChart from '$lib/components/charts/TradingViewChart.svelte';
	import TradingViewWidget from '$lib/components/charts/TradingViewWidget.svelte';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Select from '$lib/components/ui/Select.svelte';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import TokenMarketCharts from '$lib/components/charts/TokenMarketCharts.svelte';
	import type {
		DepthSeries,
		TradeHistoryPoint,
		VolumeBucket,
		OHLCBucket
	} from '$lib/components/charts/token-chart-types';
	import MarketOrder from '$lib/components/orders/MarketOrder.svelte';
	import DcaOrder from '$lib/components/orders/DcaOrder.svelte';
	import { extractBaseSymbol } from '$lib/utils/tradingViewSymbols';
	import {
		analyzeTrade,
		createTokenLookup,
		normalizeAddress,
		ratioToNumber,
		toDecimal,
		getRaindexVaultUrl
	} from '$lib/utils/tokenMath';
	import type { OracleQuote } from '$lib/queries/oracleQuotes';
	type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';
	import {
		createTokenOrderbookQuotesQuery,
		prefetchGlobalOrders,
		refreshLegacyTokenQuotes,
		type OrderbookQuoteCache
	} from '$lib/queries/orderbook';
	import { getTrades } from '$lib/api/subgraph';
	import type { QueryObserverResult } from '@tanstack/query-core';
	import { createTradeActivityQuery } from '$lib/queries/tradeActivity';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress, authMethod } from '$lib/stores/authStore';
	import { dynamicSession } from '$lib/stores/dynamicStore';
	import { promptWalletConnection, promptLogin, walletRegistered } from '$lib/stores/accessStore';
	import { tutorialWantsTradePanel } from '$lib/stores/tutorialStore';
	import { startVaultTutorial, vaultTutorialActive } from '$lib/stores/vaultTutorialStore';
	import VaultTutorial from '$lib/components/VaultTutorial.svelte';
	import { isVaultTutorialHidden } from '$lib/utils/tutorialStorage';
	import type { RaindexVault } from '@rainlanguage/orderbook';
	import transactionStore from '$lib/stores/transaction';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import {
		createSingleVaultQuery,
		createUserVaultsQuery,
		prefetchUserVaults
	} from '$lib/queries/vaults';
	import OrdersTable from '$lib/components/orders/OrdersTable.svelte';
	import type { DisplayOrder } from '$lib/types/orders';
	import { transformTradeToDisplayOrder } from '$lib/utils/tradeTransform';
	import { addTokenToWallet } from '$lib/utils/walletUtils';
	$: tokenId = $page.params.id;

	// Hide track in wallet buttons for embedded wallets
	$: isEmbeddedWallet = $authMethod === 'dynamic' && $dynamicSession?.walletType === 'embedded';

	// Get queryClient for cache lookup
	const queryClient = useQueryClient();

	// Use single token query - checks global cache first, falls back to single fetch
	$: singleTokenQuery = createSingleVaultQuery(tokenId, $currentNetwork, queryClient);
	$: currentToken = $singleTokenQuery.data;
	const tokensLookup = createTokenLookup(TOKENS);
	let orderbookQuotesQuery = createTokenOrderbookQuotesQuery(
		$currentNetwork,
		currentToken?.address ?? null
	);
	let tradeActivityQuery = createTradeActivityQuery($currentNetwork);
	let oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	$: {
		orderbookQuotesQuery = createTokenOrderbookQuotesQuery(
			$currentNetwork,
			currentToken?.address ?? null
		);
		tradeActivityQuery = createTradeActivityQuery($currentNetwork);
		oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	}

	// One-shot: fetch trades from inactive subgraph(s) once for trade history
	let inactiveTrades: SgTrade[] = [];
	let inactiveTradesFetchedForNetwork: number | null = null;
	$: if (browser && $currentNetwork && inactiveTradesFetchedForNetwork !== $currentNetwork.id) {
		const net = $currentNetwork;
		if (net.orderbook_subgraph_urls_inactive?.length) {
			inactiveTradesFetchedForNetwork = net.id;
			const now = Math.floor(Date.now() / 1000);
			const from = now - TRADE_HISTORY_LOOKBACK_SECONDS;
			getTrades(from, now, net, true)
				.then((trades) => {
					inactiveTrades = trades;
				})
				.catch(() => {
					inactiveTrades = [];
				});
		}
	}

	// One-shot: fetch legacy address quotes once per token
	let legacyQuotesFetchedFor: string | null = null;
	$: if (
		browser &&
		$currentNetwork &&
		currentToken?.address &&
		legacyQuotesFetchedFor !== currentToken.address
	) {
		legacyQuotesFetchedFor = currentToken.address;
		refreshLegacyTokenQuotes($currentNetwork.id, currentToken.address).catch(() => {});
	}

	// Filter trades from tradeActivityQuery to get user's market orders
	$: userMarketOrders = (() => {
		if (!$walletAddress || !currentToken?.address || !$tradeActivityQuery.data?.trades) {
			return [];
		}
		const normalizedSender = $walletAddress.toLowerCase();
		const normalizedToken = currentToken.address.toLowerCase();

		return $tradeActivityQuery.data.trades.filter((trade: SgTrade) => {
			// Check if user is the sender (taker)
			const tradeSender = trade.tradeEvent?.sender?.toLowerCase();
			if (tradeSender !== normalizedSender) return false;

			// Check if trade involves the current token
			const inputTokenAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
			const outputTokenAddr = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
			return inputTokenAddr === normalizedToken || outputTokenAddr === normalizedToken;
		});
	})();

	// Transform quotes and market orders into DisplayOrder format for OrdersTable
	// Note: Filtering by owner/type and closed orders are handled by OrdersTable component
	$: tokenOrders = (() => {
		const displayOrders: DisplayOrder[] = [];
		const tokenAddress = currentToken?.address?.toLowerCase() ?? '';

		// Add limit orders from quotes (for current token only; match wrapped or legacy address)
		if (currentToken?.address && $orderbookQuotesQuery.data?.quotes) {
			const quotes = $orderbookQuotesQuery.data.quotes;

			// Filter by token (input or output matches current token's wrapped or legacy address)
			const filtered = quotes.filter(
				(q) =>
					assetAddressSet.has(q.inputTokenAddress?.toLowerCase() ?? '') ||
					assetAddressSet.has(q.outputTokenAddress?.toLowerCase() ?? '')
			);

			// Transform to DisplayOrder
			for (const quote of filtered) {
				const isBuy = quote.side === 'bid';
				const tokenSymbol = isBuy ? quote.inputTokenSymbol : quote.outputTokenSymbol;
				// Use the classified order type, defaulting to 'limit' if not set
				const orderType = quote.orderType ?? 'limit';
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
					isActive: quote.sgOrder?.active ?? true
				});
			}
		}

		// Add market orders (user's trades for this token)
		if (userMarketOrders.length > 0 && tokenAddress) {
			for (const trade of userMarketOrders) {
				const displayOrder = transformTradeToDisplayOrder(trade, {
					targetTokenAddress: tokenAddress
				});
				if (displayOrder) {
					displayOrders.push(displayOrder);
				}
			}
		}

		// Sort by timestamp descending
		displayOrders.sort((a, b) => b.timestamp - a.timestamp);

		return displayOrders;
	})();

	// User vaults query - uses centralized query with 15s polling (trade page)
	$: userVaultsQuery = createUserVaultsQuery($currentNetwork, $walletAddress, 15_000);

	// Background prefetch of global caches when page loads
	$: if (browser && $currentNetwork && $walletAddress) {
		// Prefetch global orders and vaults in background (non-blocking)
		prefetchGlobalOrders($currentNetwork.id).catch(() => {});
		prefetchUserVaults($currentNetwork.id, $walletAddress).catch(() => {});
	}

	// Wallet balance query for this token
	$: walletBalanceQuery = createQuery({
		queryKey: ['walletBalance', $currentNetwork?.id, currentToken?.address, $walletAddress],
		queryFn: async () => {
			if (!currentToken?.address || !$walletAddress || !$wagmiConfig) {
				return 0n;
			}
			const balance = await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: currentToken.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$walletAddress as `0x${string}`]
			});
			return balance as bigint;
		},
		enabled: Boolean(currentToken?.address && $walletAddress && $wagmiConfig)
	});
	// Use tokenId from URL params to find the token config (supports wrapped, legacy, or unwrapped address)
	// Note: currentToken.address from subgraph may differ from the wrapped token address
	$: currentPythToken = (() => {
		if (!tokenId || !$currentNetwork?.chainId) return undefined;
		const byAddress = TOKENS.find(
			(token) =>
				token.address.toLowerCase() === tokenId.toLowerCase() &&
				token.chainId === $currentNetwork.chainId
		);
		if (byAddress) return byAddress;
		const byAnyAddress = getTokenByAnyAddress(tokenId);
		return byAnyAddress?.chainId === $currentNetwork.chainId ? byAnyAddress : undefined;
	})();
	$: baseSymbol = extractBaseSymbol(currentToken?.symbol);
	$: tradingViewSymbol = currentPythToken?.tradingViewSymbol ?? baseSymbol;
	const ASSET_TABS = [
		{ id: 'company', label: 'Company Info' },
		{ id: 'fundamentals', label: 'Fundamentals' },
		{ id: 'technical', label: 'Technical' },
		{ id: 'news', label: 'Top Stories' }
	] as const;
	type AssetTabId = (typeof ASSET_TABS)[number]['id'];
	let activeAssetTab: AssetTabId = 'company';
	const TOKEN_TABS = [
		{ id: 'contract', label: 'Contract' },
		{ id: 'supply', label: 'Supply' },
		{ id: 'mints', label: 'Mints' },
		{ id: 'burns', label: 'Burns' }
	] as const;
	type TokenTabId = (typeof TOKEN_TABS)[number]['id'];
	let activeTokenTab: TokenTabId = 'contract';
	const ONCHAIN_TABS = [
		{ id: 'market', label: 'Market Data' },
		{ id: 'orders', label: 'Orders' },
		{ id: 'vaults', label: 'Holdings' }
	] as const;
	type OnchainTabId = (typeof ONCHAIN_TABS)[number]['id'];
	let activeOnchainTab: OnchainTabId = 'market';
	let isAboutCollapsed = false; // Not collapsed by default

	// Pagination state for vaults (orders pagination is handled by OrdersTable component)
	let currentVaultsPage = 1;

	function handleOnchainTabChange(event: CustomEvent<{ id: string }>) {
		activeOnchainTab = event.detail.id as OnchainTabId;
	}

	function vaultBalanceToBigInt(vault: RaindexVault): bigint {
		const fixedResult = vault.balance.toFixedDecimalLossy(vault.token.decimals);
		if (fixedResult.error || !fixedResult.value) return 0n;
		const value = (fixedResult.value as { value: string }).value;
		return typeof value === 'string' ? BigInt(value) : 0n;
	}

	let showTradePanel = false;
	let panelOrderSide: 'Buy' | 'Sell' = 'Buy';
	let panelStrategy: 'limit' | 'dca' | 'market' = 'market';
	let panelOpenedFromTerminal = false;

	// Sync trade panel state with store (for layout squishing on lg screens)
	$: tradePanelOpen.set(showTradePanel);

	// Track if the trade panel was opened by the tutorial
	let panelOpenedByTutorial = false;

	// Open trade panel when tutorial requests it
	$: if ($tutorialWantsTradePanel && !showTradePanel) {
		showTradePanel = true;
		panelOrderSide = 'Buy';
		panelStrategy = 'market';
		panelOpenedByTutorial = true;
	} else if (!$tutorialWantsTradePanel && showTradePanel && panelOpenedByTutorial) {
		// Close the panel when tutorial no longer wants it open (only if tutorial opened it)
		showTradePanel = false;
		panelOpenedByTutorial = false;
	}
	const PANEL_STRATEGY_OPTIONS: Array<'limit' | 'dca' | 'market'> = ['limit', 'dca', 'market'];
	const PANEL_STRATEGY_SELECT_ID = 'panel-strategy-select';
	const PANEL_STRATEGY_LABEL_ID = 'panel-strategy-label';

	// Track if we've shown the vault tutorial trigger for this session
	let vaultTutorialTriggered = false;
	let tradePanelWasOpenBeforeVaultTutorial = false;

	// Trigger vault tutorial when user first selects limit or dca
	$: if (
		browser &&
		(panelStrategy === 'limit' || panelStrategy === 'dca') &&
		!vaultTutorialTriggered
	) {
		if (!isVaultTutorialHidden()) {
			vaultTutorialTriggered = true;
			// Remember if trade panel was open and hide it
			tradePanelWasOpenBeforeVaultTutorial = showTradePanel;
			showTradePanel = false;
			startVaultTutorial();
		}
	}

	// Restore trade panel when vault tutorial ends
	$: if (
		browser &&
		vaultTutorialTriggered &&
		!$vaultTutorialActive &&
		tradePanelWasOpenBeforeVaultTutorial
	) {
		showTradePanel = true;
		tradePanelWasOpenBeforeVaultTutorial = false;
	}

	// Callback to change DEX activity tab from vault tutorial
	function handleVaultTutorialTabChange(tab: 'orders' | 'vaults') {
		activeOnchainTab = tab;
	}
	const TRADE_HISTORY_LOOKBACK_SECONDS = 30 * 24 * 60 * 60; // 30 days (max window)
	const OHLC_BUCKET_SECONDS = 60; // 1 minute buckets for candles
	$: settlementTokenConfig = $currentNetwork?.defaultPaymentToken;
	$: settlementTokenSymbol = settlementTokenConfig?.symbol ?? 'Quote';
	$: settlementTokenLogo = settlementTokenConfig?.logoUrl ?? '/images/USDC.png';
	type HistoryRangeKey = '1D' | '7D' | '30D';
	const HISTORY_RANGE_CONFIG: Record<HistoryRangeKey, { label: string; seconds: number }> = {
		'1D': { label: '1D', seconds: 24 * 60 * 60 },
		'7D': { label: '7D', seconds: 7 * 24 * 60 * 60 },
		'30D': { label: '30D', seconds: 30 * 24 * 60 * 60 }
	};
	const HISTORY_RANGE_OPTIONS: Array<{ key: HistoryRangeKey; label: string }> = [
		{ key: '1D', label: '1D' },
		{ key: '7D', label: '7D' },
		{ key: '30D', label: '30D' }
	];
	const tradeToPoint = (
		trade: SgTrade,
		assetAddress: string,
		assetDecimals: number,
		quoteToken: { address: string; decimals: number; symbol: string }
	): TradeHistoryPoint | null => {
		if (!trade) return null;
		const rawTimestamp = Number(trade.tradeEvent?.transaction?.timestamp ?? trade.timestamp ?? 0);
		if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;
		const timestamp = rawTimestamp * 1000;
		const normalizedAsset = normalizeAddress(assetAddress);
		const lookup = (address: string | null | undefined) => {
			const normalized = normalizeAddress(address);
			if (normalized && normalized === normalizedAsset) {
				return { address: normalized, decimals: assetDecimals };
			}
			return tokensLookup(address);
		};
		const analysis = analyzeTrade(
			trade as unknown as {
				inputVaultBalanceChange?: {
					vault?: { token?: { address?: string; decimals?: number; symbol?: string } };
					amount?: string;
				};
				outputVaultBalanceChange?: {
					vault?: { token?: { address?: string; decimals?: number; symbol?: string } };
					amount?: string;
				};
			},
			quoteToken,
			lookup
		);
		if (!analysis) return null;
		if (normalizedAsset && analysis.assetAddress !== normalizedAsset) return null;
		const { tokens, quote, price, side } = analysis;
		if (!Number.isFinite(tokens) || !Number.isFinite(quote) || !Number.isFinite(price)) return null;
		return { timestamp, price, tokens, quote, side };
	};
	// Convert trade points to OHLC candles
	const tradesToOHLCBuckets = (
		trades: TradeHistoryPoint[],
		bucketSeconds: number
	): OHLCBucket[] => {
		if (trades.length === 0) return [];
		const buckets = new Map<number, TradeHistoryPoint[]>();
		for (const trade of trades) {
			const bucketTime = Math.floor(trade.timestamp / 1000 / bucketSeconds) * bucketSeconds * 1000;
			if (!buckets.has(bucketTime)) {
				buckets.set(bucketTime, []);
			}
			buckets.get(bucketTime)!.push(trade);
		}
		const ohlcData: OHLCBucket[] = [];
		const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
		for (const [time, bucketTrades] of sortedBuckets) {
			if (bucketTrades.length === 0) continue;
			// Sort trades within bucket by timestamp
			const sortedTrades = bucketTrades
				.filter((t) => Number.isFinite(t.price))
				.sort((a, b) => a.timestamp - b.timestamp);
			if (sortedTrades.length === 0) continue;
			const prices = sortedTrades.map((t) => t.price);
			ohlcData.push({
				x: time,
				o: sortedTrades[0].price, // first trade = open
				h: Math.max(...prices), // highest price
				l: Math.min(...prices), // lowest price
				c: sortedTrades[sortedTrades.length - 1].price // last trade = close
			});
		}
		return ohlcData;
	};
	// Aggregate volume by candlestick bucket size for proper alignment
	const tradesToVolumeBuckets = (
		trades: TradeHistoryPoint[],
		bucketSeconds: number
	): VolumeBucket[] => {
		if (trades.length === 0) return [];
		const bucketMap = new Map<number, number>();
		for (const trade of trades) {
			const bucketTime = Math.floor(trade.timestamp / 1000 / bucketSeconds) * bucketSeconds * 1000;
			bucketMap.set(bucketTime, (bucketMap.get(bucketTime) ?? 0) + trade.tokens);
		}
		return Array.from(bucketMap.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([start, tokens]) => ({ start, tokens }));
	};
	let historyRange: HistoryRangeKey = '7D';
	let historyRangeStartMs = 0;
	let historyRangeEndMs = 0;
	let tradeHistoryPoints: TradeHistoryPoint[] = [];
	let visibleTradeHistoryPoints: TradeHistoryPoint[] = [];
	let ohlcData: OHLCBucket[] = [];
	let tradeVolumeBuckets: VolumeBucket[] = [];
	let orderbookDepth: DepthSeries = { bids: [], asks: [] };
	let chartsLoading = false;
	let tradeQueryError: string | null = null;
	let oracleResource: {
		status: ResourceStatus;
		data: Record<string, OracleQuote> | null;
		updatedAt: number | null;
		error: unknown | null;
	} | null = null;
	let oracleEntry: OracleQuote | undefined;
	let oraclePriceData: { price: number | null; confidence: number | null } | null = null;
	let oracleLoading = false;
	let oracleError: string | null = null;
	let buyPrice: number | null = null;
	let sellPrice: number | null = null;
	type OrderbookQuoteUiState = {
		status: QueryObserverResult<OrderbookQuoteCache, Error>['status'];
		hasData: boolean;
		loadingWithoutData: boolean;
	};
	const mapOrderbookQuoteState = (
		resource: QueryObserverResult<OrderbookQuoteCache, Error> | null
	): OrderbookQuoteUiState => {
		if (!resource) {
			return { status: 'pending', hasData: false, loadingWithoutData: true };
		}
		const hasData = (resource.data?.quotes?.length ?? 0) > 0;
		const status = resource.status;
		return {
			status,
			hasData,
			loadingWithoutData: resource.isPending && !hasData
		};
	};
	let orderbookQuoteUiState: OrderbookQuoteUiState = mapOrderbookQuoteState($orderbookQuotesQuery);
	$: {
		orderbookQuoteUiState = mapOrderbookQuoteState($orderbookQuotesQuery);
	}
	function formatNumeric(value: number | null | undefined): string {
		if (value === null || value === undefined || Number.isNaN(value)) {
			return '—';
		}
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: value > 1 ? 2 : 4,
			maximumFractionDigits: value > 1 ? 2 : 6
		}).format(value);
	}
	function formatResourceError(error: unknown, fallback: string): string {
		if (!error) return fallback;
		if (typeof error === 'string') return error;
		if (error instanceof Error) {
			return error.message || fallback;
		}
		return fallback;
	}
	$: oracleResource = (() => {
		const q = $oracleQuotesQuery;
		const status: ResourceStatus =
			q?.status === 'success' ? 'ready' : q?.status === 'error' ? 'error' : 'loading';
		return {
			status,
			data: q?.data ?? null,
			updatedAt: q?.dataUpdatedAt ?? null,
			error: q?.error ?? null,
			refreshInterval: 15_000,
			timerId: null,
			subscribers: 0
		};
	})();
	$: currentTokenAddress = currentPythToken?.address?.toLowerCase?.() ?? null;
	// Include legacy address so bid/ask and depth match quotes for tokens like tSTOX/wtSTOX
	$: assetAddressSet = (() => {
		const set = new Set<string>();
		if (currentPythToken?.address) set.add(currentPythToken.address.toLowerCase());
		if (currentPythToken?.legacyAddress) set.add(currentPythToken.legacyAddress.toLowerCase());
		// Also add currentToken.address in case subgraph uses a different id
		if (currentToken?.address) set.add(currentToken.address.toLowerCase());
		return set;
	})();
	$: oracleEntry = currentTokenAddress ? $oracleQuotes[currentTokenAddress] : undefined;
	$: oraclePriceData = oracleEntry
		? {
				price: oracleEntry.price ?? null,
				confidence: oracleEntry.confidence ?? null
			}
		: null;
	$: oracleLoading =
		!!currentFeedId && (oracleResource?.status === 'idle' || oracleResource?.status === 'loading');
	$: oracleError = (() => {
		if (!currentFeedId) return null;
		if (oracleResource?.status === 'error') {
			return 'Failed to fetch oracle data';
		}
		if (oracleResource?.status === 'ready' && !oracleEntry) {
			return 'Oracle data unavailable';
		}
		return null;
	})();
	onMount(() => {
		return () => {};
	});
	const handleAssetTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (ASSET_TABS.some((tab) => tab.id === nextId)) {
			activeAssetTab = nextId as AssetTabId;
		}
	};
	$: currentFeedId = browser ? currentPythToken?.priceFeedId ?? null : null;
	const handleTokenTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (TOKEN_TABS.some((tab) => tab.id === nextId)) {
			activeTokenTab = nextId as TokenTabId;
		}
	};
	let showChartModal = false;
	function openChartModal(event?: Event) {
		event?.stopPropagation?.();
		showChartModal = true;
	}
	const closeTradePanel = () => {
		panelOpenedFromTerminal = false;
		showTradePanel = false;
	};
	const closeChartModal = () => {
		showChartModal = false;
		if (panelOpenedFromTerminal) {
			closeTradePanel();
		}
	};
	const openTradePanel = (side: 'Buy' | 'Sell', options: { closeTerminal?: boolean } = {}) => {
		// Check if wallet is connected before opening trade panel
		if (!$isAuthenticated) {
			promptWalletConnection();
			return;
		}
		// Check if wallet is registered
		if (!$walletRegistered) {
			promptLogin();
			return;
		}
		panelOrderSide = side;
		panelStrategy = 'market';
		const shouldCloseTerminal = options.closeTerminal ?? true;
		panelOpenedFromTerminal = !shouldCloseTerminal;
		showTradePanel = true;
		if (shouldCloseTerminal) {
			showChartModal = false;
		}
	};
	const handleGlobalKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			let handled = false;
			if (showTradePanel) {
				handled = true;
				closeTradePanel();
			}
			if (showChartModal) {
				handled = true;
				closeChartModal();
			}
			if (handled) {
				event.preventDefault();
			}
		}
	};
	const resetOnChainPrices = () => {
		buyPrice = null;
		sellPrice = null;
	};
	$: {
		if (!browser || !currentToken || !$currentNetwork) {
			resetOnChainPrices();
		} else {
			const settlementToken = $currentNetwork.defaultPaymentToken;
			if (!settlementToken) {
				resetOnChainPrices();
			} else {
				const quotes = $orderbookQuotesQuery?.data?.quotes ?? [];
				const quoteAddress = settlementToken.address?.toLowerCase();
				let bestBid: number | null = null;
				let bestAsk: number | null = null;
				quotes.forEach((quote) => {
					const ratioValue = ratioToNumber(quote.ratio);
					const ratio = ratioValue ?? 0;
					if (!Number.isFinite(ratio) || ratio <= 0) return;
					const inputAddress = quote.inputTokenAddress.toLowerCase();
					const outputAddress = quote.outputTokenAddress.toLowerCase();
					const inputIsAsset = assetAddressSet.has(inputAddress);
					const outputIsAsset = assetAddressSet.has(outputAddress);
					// ASK: quote token -> asset (what you pay when buying)
					if (inputAddress === quoteAddress && outputIsAsset) {
						const tokenAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
						const price = ratio;
						if (tokenAmount !== null && Number.isFinite(price) && tokenAmount > 0 && price > 0) {
							bestAsk = bestAsk === null ? price : Math.min(bestAsk, price);
						}
					}
					// BID: asset -> quote token (what you get when selling)
					if (inputIsAsset && outputAddress === quoteAddress) {
						const quoteAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
						const price = 1 / ratio;
						if (quoteAmount !== null && quoteAmount > 0 && Number.isFinite(price) && price > 0) {
							const tokenAmount = quoteAmount / price;
							if (Number.isFinite(tokenAmount) && tokenAmount > 0) {
								bestBid = bestBid === null ? price : Math.max(bestBid, price);
							}
						}
					}
				});
				buyPrice = bestBid; // Best bid - what you get when selling
				sellPrice = bestAsk; // Best ask - what you pay when buying
			}
		}
	}
	$: tradeHistoryPoints = (() => {
		if (!browser || !currentToken || !$currentNetwork) return [];
		const settlementToken = $currentNetwork.defaultPaymentToken;
		if (!settlementToken) return [];
		// Use wrapped address as the primary asset address for trade matching
		// (currentToken.address from subgraph is the unwrapped address, but
		// orderbook trades use the wrapped token address)
		const assetAddress = (currentPythToken?.address ?? currentToken.address)?.toLowerCase();
		const quoteAddress = settlementToken.address;
		if (!assetAddress || !quoteAddress) return [];
		const assetDecimals = Number(currentPythToken?.decimals ?? 18);
		const quoteDecimals = Number(settlementToken.decimals ?? 6);
		const range = $tradeActivityQuery?.data?.range ?? null;
		const now = Date.now();
		const cutoff = range ? range.from * 1000 : now - TRADE_HISTORY_LOOKBACK_SECONDS * 1000;
		const rangeEnd = range ? range.to * 1000 : now;
		// TODO: Display range label in UI if needed
		// Possible values: "Last X days", "Last 24 hours", "Recent activity", or "Last 30 days"
		const activeTrades = ($tradeActivityQuery?.data?.trades ?? []) as SgTrade[];
		// Merge active + inactive trades, dedup by trade ID
		const tradeIdSet = new Set<string>();
		const trades: SgTrade[] = [];
		for (const trade of [...activeTrades, ...inactiveTrades]) {
			const id = trade.id;
			if (id && !tradeIdSet.has(id)) {
				tradeIdSet.add(id);
				trades.push(trade);
			}
		}
		// Collect points for all address variants (wrapped from new orderbook + legacy from old)
		const points: TradeHistoryPoint[] = [];
		for (const addr of assetAddressSet) {
			for (const trade of trades) {
				const point = tradeToPoint(trade, addr, assetDecimals, {
					address: quoteAddress,
					decimals: quoteDecimals,
					symbol: settlementToken.symbol || ''
				});
				if (point && point.timestamp >= cutoff && point.timestamp <= rangeEnd) {
					points.push(point);
				}
			}
		}
		// Deduplicate by timestamp (same trade matched via different address variants)
		const seen = new Set<string>();
		return points
			.filter((p) => {
				const key = `${p.timestamp}-${p.price}-${p.tokens}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.sort((a, b) => a.timestamp - b.timestamp);
	})();
	$: {
		const rangeSeconds = HISTORY_RANGE_CONFIG[historyRange].seconds;
		const nowMs = Date.now();
		const latestTradeMs = tradeHistoryPoints.length
			? tradeHistoryPoints[tradeHistoryPoints.length - 1].timestamp
			: 0;
		const rangeEnd = Math.max(nowMs, latestTradeMs || nowMs);
		const rangeStart = Math.max(0, rangeEnd - rangeSeconds * 1000);
		// Determine bucket resolution (1 minute for 1D, 15 min for 7D, 1 hour for 30D)
		let candleBucketSeconds = OHLC_BUCKET_SECONDS;
		if (historyRange === '7D') {
			candleBucketSeconds = 15 * 60;
		} else if (historyRange === '30D') {
			candleBucketSeconds = 60 * 60;
		}
		historyRangeStartMs = rangeStart;
		historyRangeEndMs = rangeEnd;
		visibleTradeHistoryPoints = tradeHistoryPoints.filter((point) => point.timestamp >= rangeStart);
		// Calculate OHLC candles and volume using the same bucket size
		ohlcData = tradesToOHLCBuckets(visibleTradeHistoryPoints, candleBucketSeconds);
		tradeVolumeBuckets = tradesToVolumeBuckets(visibleTradeHistoryPoints, candleBucketSeconds);
	}
	$: orderbookDepth = (() => {
		if (!currentToken || !$currentNetwork) return { bids: [], asks: [] };
		const quotes = $orderbookQuotesQuery?.data?.quotes ?? [];
		if (!quotes.length) {
			return { bids: [], asks: [] };
		}
		const settlementToken = $currentNetwork.defaultPaymentToken;
		if (!settlementToken) return { bids: [], asks: [] };
		const quoteAddress = settlementToken.address?.toLowerCase();
		if (!quoteAddress) {
			return { bids: [], asks: [] };
		}

		const bids: DepthSeries['bids'] = [];
		const asks: DepthSeries['asks'] = [];
		quotes.forEach((quote) => {
			const ratioValue = ratioToNumber(quote.ratio);
			const ratio = ratioValue ?? 0;
			if (!Number.isFinite(ratio) || ratio <= 0) {
				return;
			}
			const inputAddress = quote.inputTokenAddress.toLowerCase();
			const outputAddress = quote.outputTokenAddress.toLowerCase();
			if (!inputAddress || !outputAddress) {
				return;
			}
			const inputIsAsset = assetAddressSet.has(inputAddress);
			const outputIsAsset = assetAddressSet.has(outputAddress);

			// ASK: quote token -> asset (buying the asset)
			if (inputAddress === quoteAddress && outputIsAsset) {
				const tokenAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
				const price = ratio;
				if (tokenAmount === null || !Number.isFinite(price) || tokenAmount <= 0 || price <= 0) {
					return;
				}
				asks.push({ price, quantity: tokenAmount });
				return;
			}

			// BID: asset -> quote token (selling the asset)
			if (inputIsAsset && outputAddress === quoteAddress) {
				const quoteAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
				if (quoteAmount === null || quoteAmount <= 0) {
					return;
				}

				// Determine price based on ratio magnitude
				// If ratio > 1: it's already in USD/token form
				// If ratio < 1: it's in token/USD form, so invert it
				const price = ratio >= 1 ? ratio : 1 / ratio;
				const tokenAmount = quoteAmount / price;

				if (!Number.isFinite(price) || price <= 0) {
					return;
				}
				if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
					return;
				}

				bids.push({ price, quantity: tokenAmount });
				return;
			}
		});
		return { bids, asks };
	})();
	$: {
		const tradeResource = $tradeActivityQuery;
		const tradeStatus = tradeResource?.status ?? 'pending';
		const tradeHasData = (tradeResource?.data?.trades?.length ?? 0) > 0;
		const tradeLoading = (tradeResource?.isPending ?? tradeStatus === 'pending') && !tradeHasData;
		const quoteLoading =
			orderbookQuoteUiState.loadingWithoutData ||
			(orderbookQuoteUiState.status === 'pending' && !orderbookQuoteUiState.hasData);
		// Don't show loading if we have volume data OR orderbook depth data
		const hasVolumeData = tradeVolumeBuckets.length > 0;
		const hasDepthData = orderbookDepth.bids.length > 0 || orderbookDepth.asks.length > 0;
		chartsLoading = Boolean((tradeLoading || quoteLoading) && !hasVolumeData && !hasDepthData);
		tradeQueryError =
			tradeStatus === 'error'
				? formatResourceError(tradeResource?.error, 'Failed to load trade history.')
				: null;
	}
	$: tokenDisplayName = currentToken?.name ?? currentToken?.symbol ?? 'Token';
	$: tokenDisplaySymbol = currentToken?.symbol ?? '';
	$: pageTitle = `Trade ${tokenDisplayName}`;
	$: modalTitle = tokenDisplaySymbol
		? `Advanced Chart — ${tokenDisplayName} (${tokenDisplaySymbol})`
		: `Advanced Chart — ${tokenDisplayName}`;
	$: panelTokenLabel = tokenDisplaySymbol || currentToken?.symbol || tokenDisplayName;
	$: panelSummaryVerb = panelOrderSide === 'Buy' ? 'Buying' : 'Selling';
	$: panelSummaryPreposition = panelOrderSide === 'Buy' ? 'with' : 'for';
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>
<svelte:window on:keydown={handleGlobalKeydown} />
{#if $singleTokenQuery.isPending}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else if $singleTokenQuery.isError}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="text-lg text-red-400">Failed to load token data</p>
			<p class="mt-2 text-sm text-gray-400">
				{$singleTokenQuery.error?.message || 'Unknown error'}
			</p>
		</div>
	</div>
{:else if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="text-lg text-gray-400">Token not found</p>
			<p class="mt-2 text-sm text-gray-500">ID: {tokenId}</p>
		</div>
	</div>
{:else}
	<div class="space-y-4 p-3 sm:space-y-6 sm:p-6">
		<!-- Header Section with Chart -->
		<div class="space-y-4 sm:space-y-6">
			<div class="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-5">
				<!-- Left: Symbol info -->
				<div class="space-y-3 sm:space-y-4 xl:col-span-2">
					<div
						class="overflow-hidden rounded-lg border border-white/5 bg-gray-800/80 backdrop-blur-sm"
						data-tutorial="symbol-overview"
					>
						<div class="border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-[10px] uppercase tracking-wide text-gray-400 sm:text-xs">
										Off-chain Reference
									</p>
									<p class="mt-0.5 text-sm font-semibold text-gray-200 sm:mt-1 sm:text-base">
										{tokenDisplayName}
									</p>
								</div>
								{#if tradingViewSymbol}
									<span class="text-xs text-gray-400 sm:text-sm">{tradingViewSymbol}</span>
								{/if}
							</div>
						</div>
						{#if tradingViewSymbol}
							<div class="hidden sm:block">
								<TradingViewWidget
									widgetType="symbol-info"
									symbol={tradingViewSymbol}
									height="420"
									isTransparent={true}
								/>
							</div>
							<div class="sm:hidden">
								<TradingViewWidget
									widgetType="symbol-info"
									symbol={tradingViewSymbol}
									height="280"
									isTransparent={true}
								/>
							</div>
						{:else}
							<div
								class="flex h-32 items-center justify-center px-4 py-6 text-sm text-gray-400 sm:h-48"
							>
								TradingView data unavailable for this token.
							</div>
						{/if}
					</div>
					<div class="rounded-lg border border-white/5 bg-gray-800/80 p-3 backdrop-blur-sm sm:p-4">
						<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:gap-x-6 sm:gap-y-3 sm:text-sm">
							<div>
								<dt class="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">
									Oracle Price
								</dt>
								<dd class="mt-0.5 font-medium text-gray-100 sm:mt-1">
									{#if oracleLoading}
										Loading...
									{:else if oraclePriceData}
										${formatNumeric(oraclePriceData.price)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">
									Confidence
								</dt>
								<dd class="mt-0.5 font-medium text-gray-100 sm:mt-1">
									{#if oracleLoading}
										Loading...
									{:else if oraclePriceData}
										± ${formatNumeric(oraclePriceData.confidence)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">
									Bid Price
								</dt>
								<dd class="mt-0.5 font-medium text-gray-100 sm:mt-1">
									{#if orderbookQuoteUiState.loadingWithoutData}
										Loading...
									{:else if buyPrice !== null}
										${formatNumeric(buyPrice)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">
									Offer Price
								</dt>
								<dd class="mt-0.5 font-medium text-gray-100 sm:mt-1">
									{#if orderbookQuoteUiState.loadingWithoutData}
										Loading...
									{:else if sellPrice !== null}
										${formatNumeric(sellPrice)}
									{:else}
										—
									{/if}
								</dd>
							</div>
						</dl>
						{#if oracleError}
							<p class="mt-2 text-xs text-red-400 sm:mt-4">{oracleError}</p>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-2 sm:gap-3" data-tutorial="buy-sell-buttons">
						<button
							type="button"
							class="rounded-xl bg-green-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:px-4 sm:py-3 sm:text-base"
							on:click={() => openTradePanel('Buy')}
						>
							Buy
						</button>
						<button
							type="button"
							class="rounded-xl bg-red-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:px-4 sm:py-3 sm:text-base"
							on:click={() => openTradePanel('Sell')}
						>
							Sell
						</button>
					</div>
				</div>
				<!-- Right: Overview and chart -->
				<div class="flex h-full flex-col gap-3 sm:gap-4 xl:col-span-3" data-tutorial="tradingview">
					{#if tradingViewSymbol}
						<div
							class="flex-1 overflow-hidden rounded-lg border border-white/5 bg-gray-800/80 backdrop-blur-sm"
						>
							<div class="hidden sm:block">
								<TradingViewWidget
									widgetType="symbol-overview"
									symbol={tradingViewSymbol}
									displayName={currentToken.name || currentToken.symbol}
									dateRange="1D"
									showVolume={false}
									autosize={false}
									height="485"
									isTransparent={true}
								/>
							</div>
							<div class="sm:hidden">
								<TradingViewWidget
									widgetType="symbol-overview"
									symbol={tradingViewSymbol}
									displayName={currentToken.name || currentToken.symbol}
									dateRange="1D"
									showVolume={false}
									autosize={false}
									height="320"
									isTransparent={true}
								/>
							</div>
						</div>
					{:else}
						<div class="flex-1 rounded-lg border border-white/5 bg-gray-800/80 backdrop-blur-sm">
							<div
								class="flex h-[280px] items-center justify-center text-sm text-gray-400 sm:h-[495px]"
							>
								TradingView data unavailable for this token.
							</div>
						</div>
					{/if}
					<div class="mt-auto flex justify-end sm:mb-[25px]">
						<Button
							variant="secondary"
							size="md"
							className="w-full rounded-xl border border-yellow-400/40 bg-yellow-500/20 px-4 py-2.5 text-sm font-semibold text-yellow-300 shadow-lg shadow-yellow-500/30 transition hover:border-yellow-300 hover:bg-yellow-500/30 hover:text-white sm:w-auto sm:py-3 sm:text-base"
							aria-label="Open terminal view"
							on:click={(event) => openChartModal(event)}
						>
							Advanced Chart
						</Button>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-4 sm:space-y-6">
			<div data-tutorial="dex-activity">
				<div class="mb-4 sm:mb-6">
					<div
						class="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
					>
						<div>
							<h2 class="text-base font-semibold sm:text-lg">On-chain Market</h2>
							<p class="hidden text-xs text-gray-400 sm:block sm:text-sm">
								View on-chain trades, liquidity, orders, and vaults
							</p>
						</div>
						{#if $isAuthenticated && !isEmbeddedWallet}
							<button
								type="button"
								on:click={() =>
									addTokenToWallet({
										address: currentToken.address,
										symbol: currentToken.symbol,
										decimals: 18,
										image: currentPythToken?.logoUrl
									})}
								class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-gray-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
							>
								<!-- Wallet icon (mobile only) -->
								<svg
									class="h-4 w-4 sm:hidden"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										d="M21 12V7H5a2 2 0 0 1 0-4h14v4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M3 5v14a2 2 0 0 0 2 2h16v-5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M18 12a2 2 0 0 0 0 4h4v-4Z"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<!-- Plus icon -->
								<svg
									class="h-3 w-3 sm:h-4 sm:w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								<span class="sm:hidden">Track</span>
								<span class="hidden sm:inline">Track in Wallet</span>
							</button>
						{/if}
					</div>
					<TabNav
						tabs={ONCHAIN_TABS}
						activeId={activeOnchainTab}
						on:change={handleOnchainTabChange}
					/>
				</div>

				<!-- Fixed height container to prevent layout jumps between tabs -->
				<div class="min-h-[320px] sm:min-h-[440px]">
					{#if activeOnchainTab === 'market'}
						<TokenMarketCharts
							volumeBuckets={tradeVolumeBuckets}
							depth={orderbookDepth}
							{ohlcData}
							rangeStartMs={historyRangeStartMs}
							rangeEndMs={historyRangeEndMs}
							isLoading={chartsLoading}
							error={tradeQueryError}
							{historyRange}
							historyRangeOptions={HISTORY_RANGE_OPTIONS}
							on:rangeChange={(e) => (historyRange = e.detail.key)}
						/>
						<div class="mt-2 hidden text-xs text-gray-400 sm:block">
							All times are displayed in your local timezone
						</div>
					{:else if activeOnchainTab === 'orders'}
						<div class="mt-4">
							<OrdersTable
								orders={tokenOrders}
								isLoading={$orderbookQuotesQuery.isLoading}
								isError={$orderbookQuotesQuery.isError}
								errorMessage={$orderbookQuotesQuery.error?.message ?? ''}
								tokenAddress={currentToken?.address ?? null}
								showTokenColumn={false}
							/>
						</div>
					{:else if activeOnchainTab === 'vaults'}
						<div class="mt-4">
							{#if !$isAuthenticated}
								<div class="flex flex-col items-center justify-center gap-4 py-12">
									<p class="text-sm text-gray-400">Connect your wallet to view your position</p>
									<Button variant="primary" size="md" on:click={() => promptWalletConnection()}>
										Connect Wallet
									</Button>
								</div>
							{:else if $userVaultsQuery.isLoading}
								<div class="flex justify-center py-8">
									<LoadingSpinner variant="inline" size="md" text="Loading vaults..." />
								</div>
							{:else if $userVaultsQuery.isError}
								<div class="py-8 text-center text-sm text-red-400">
									Error loading vaults: {$userVaultsQuery.error?.message}
								</div>
							{:else}
								{@const allVaultData = $userVaultsQuery.data?.pages?.flatMap((p) => p.vaults) ?? []}
								{@const vaults = currentToken
									? allVaultData
											.map((vd) => vd.raindexVault)
											.filter((v) => {
												const vaultTokenAddr = (v.token?.address ?? v.token?.id)?.toLowerCase();
												const isCorrectToken =
													vaultTokenAddr === currentToken.address.toLowerCase();
												const hasBalance = vaultBalanceToBigInt(v) > 0n;
												return isCorrectToken && hasBalance;
											})
									: []}
								{@const totalVaultBalance = vaults.reduce(
									(sum, v) => sum + vaultBalanceToBigInt(v),
									0n
								)}
								{@const walletBalance = $walletBalanceQuery.data ?? 0n}
								{@const totalBalance = totalVaultBalance + walletBalance}
								{@const tokenDecimals =
									vaults[0]?.token?.decimals ?? currentPythToken?.decimals ?? 18}

								{#if vaults.length === 0 && walletBalance === 0n}
									<div class="py-8 text-center text-sm text-gray-400">
										No position found for this token
									</div>
								{:else}
									<!-- Two column layout: Vaults list on left, Summary on right -->
									<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
										<!-- Left: Vaults list with pagination -->
										<div>
											{#if vaults.length > 0}
												{@const vaultsPerPage = 10}
												{@const totalPages = Math.ceil(vaults.length / vaultsPerPage)}
												{@const startIndex = (currentVaultsPage - 1) * vaultsPerPage}
												{@const endIndex = startIndex + vaultsPerPage}
												{@const paginatedVaults = vaults.slice(startIndex, endIndex)}

												<div class="space-y-2">
													{#each paginatedVaults as vault}
														{@const balance = vaultBalanceToBigInt(vault)}
														{@const vaultIdHex = `0x${vault.vaultId
															.toString(16)
															.padStart(64, '0')}`}
														{@const raindexUrl = getRaindexVaultUrl(
															$currentNetwork?.chainId ?? 8453,
															vault.orderbook,
															vault.id
														)}
														<div
															class="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-2 text-sm"
														>
															<div class="flex items-center gap-2 text-xs text-gray-400">
																<a
																	href={raindexUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="text-blue-400 hover:text-blue-300 hover:underline"
																	title="View on Raindex"
																>
																	{vaultIdHex.slice(0, 8)}...
																</a>
																<span>•</span>
																<span
																	>{Number(formatUnits(balance, vault.token.decimals)).toFixed(3)}
																	{vault.token.symbol}</span
																>
															</div>
															<Button
																variant="danger"
																size="sm"
																on:click={() => transactionStore.handleWithdraw(vault)}
															>
																Withdraw
															</Button>
														</div>
													{/each}
												</div>

												<!-- Pagination -->
												{#if totalPages > 1}
													<div class="mt-4 flex items-center justify-center gap-2">
														{#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum}
															<button
																type="button"
																class={`h-8 w-8 rounded-md text-sm font-medium transition ${
																	pageNum === currentVaultsPage
																		? 'bg-blue-500 text-white'
																		: 'bg-white/5 text-gray-400 hover:bg-white/10'
																}`}
																on:click={() => {
																	currentVaultsPage = pageNum;
																}}
															>
																{pageNum}
															</button>
														{/each}
													</div>
												{/if}
											{:else}
												<div class="py-8 text-center text-sm text-gray-400">
													No vaults with balance found
												</div>
											{/if}
										</div>

										<!-- Right: Summary table -->
										<div class="rounded-lg border border-white/10 bg-white/5 p-4">
											<h3 class="mb-4 text-sm font-semibold text-gray-100">Summary</h3>
											<div class="space-y-3 text-sm">
												<div class="flex justify-between text-gray-400">
													<span>Vaults Subtotal:</span>
													<span
														>{Number(formatUnits(totalVaultBalance, tokenDecimals)).toFixed(3)}
														{currentToken?.symbol}</span
													>
												</div>
												<div class="flex justify-between text-gray-400">
													<span>Wallet Balance:</span>
													<span
														>{Number(formatUnits(walletBalance, tokenDecimals)).toFixed(3)}
														{currentToken?.symbol}</span
													>
												</div>
												<div
													class="flex justify-between border-t border-white/10 pt-3 font-semibold text-gray-100"
												>
													<span>Total:</span>
													<span
														>{Number(formatUnits(totalBalance, tokenDecimals)).toFixed(3)}
														{currentToken?.symbol}</span
													>
												</div>
											</div>
										</div>
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<!-- About Section - Collapsible on mobile -->
		<div class="space-y-4 overflow-x-hidden sm:space-y-6">
			<button
				type="button"
				class="flex w-full items-center justify-between sm:cursor-default"
				on:click={() => (isAboutCollapsed = !isAboutCollapsed)}
			>
				<div>
					<h2 class="text-base font-semibold sm:text-lg">About</h2>
					<p class="hidden text-sm text-gray-400 sm:block">
						Learn more about the token or the equity
					</p>
				</div>
				<svg
					class="h-5 w-5 text-gray-400 transition-transform sm:hidden"
					class:rotate-180={!isAboutCollapsed}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>
			<div
				class="grid gap-4 overflow-x-hidden sm:gap-6 lg:grid-cols-2"
				class:hidden={isAboutCollapsed}
				class:sm:grid={isAboutCollapsed}
				data-tutorial="fundamentals"
			>
				<!-- Token Details (Left) -->
				<div class="min-w-0 space-y-4">
					<div class="space-y-3">
						<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
							Token Details
						</h3>
						<TabNav tabs={TOKEN_TABS} activeId={activeTokenTab} on:change={handleTokenTabChange} />
					</div>
					{#if activeTokenTab === 'contract'}
						<div>
							<h3 class="mb-3 font-semibold">Contract Information</h3>
							<div class="space-y-3 text-sm">
								<div class="flex items-center justify-between gap-2">
									<span class="text-gray-400">Wrapped Token</span>
									<div>
										<div class="sm:hidden">
											<ExternalLink
												href="{$currentNetwork.blockExplorer}/token/{currentPythToken?.address ??
													tokenId}"
												label={currentPythToken?.address ?? tokenId}
												truncate={{ start: 0, end: 6 }}
												className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
											/>
										</div>
										<div class="hidden sm:block">
											<ExternalLink
												href="{$currentNetwork.blockExplorer}/token/{currentPythToken?.address ??
													tokenId}"
												label={truncateAddress(currentPythToken?.address ?? tokenId)}
												className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
											/>
										</div>
									</div>
								</div>
								{#if currentPythToken?.unwrappedAddress}
									<div class="flex items-center justify-between gap-2">
										<span class="text-gray-400">Underlying Token</span>
										<div>
											<div class="sm:hidden">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentPythToken.unwrappedAddress}"
													label={currentPythToken.unwrappedAddress}
													truncate={{ start: 0, end: 6 }}
													className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
												/>
											</div>
											<div class="hidden sm:block">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentPythToken.unwrappedAddress}"
													label={truncateAddress(currentPythToken.unwrappedAddress)}
													className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
												/>
											</div>
										</div>
									</div>
								{/if}
								<div class="flex justify-between">
									<span class="text-gray-400">Network</span>
									<span>{$currentNetwork.displayName}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Symbol</span>
									<span>{currentPythToken?.symbol ?? currentToken.symbol}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Decimals</span>
									<span>18</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-gray-400">Proofs</span>
									<a href={`/trade/${tokenId}/proofs`} class="text-blue-400 hover:text-blue-300">
										View proofs
									</a>
								</div>
							</div>
						</div>
					{:else if activeTokenTab === 'supply'}
						<div>
							<h3 class="mb-3 font-semibold">Supply & Distribution</h3>
							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-400">Total Supply</span>
									<span>{formatUnits(BigInt(currentToken.totalShares), 18)}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Holders</span>
									<span>{currentToken.tokenHolders.length}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Total Transfers</span>
									<span>{currentToken.shareTransfers.length}</span>
								</div>
							</div>
						</div>
					{:else if activeTokenTab === 'mints'}
						<div>
							<div class="mb-2 flex items-center justify-between">
								<h3 class="font-semibold">Latest Mints</h3>
								<ExternalLink
									href="https://portal.s01issuer.com/metrics"
									label="View All"
									className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
								/>
							</div>
							{#if currentToken?.deposits?.length}
								<div>
									{#each currentToken.deposits.slice(0, 5) as dep}
										<div
											class="border-b border-white/5 px-2 py-3 transition-colors hover:bg-white/5"
										>
											<div class="flex items-center justify-between gap-3 text-xs">
												<div class="min-w-0 truncate">
													<span class="font-medium text-green-400">
														+ {formatUnits(BigInt(dep.amount), 18)}
														{currentToken.symbol}
													</span>
												</div>
												<div class="flex flex-shrink-0 items-center gap-2">
													<TxLink hash={dep.transaction.id} />
												</div>
											</div>
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
												<span>
													<span class="sm:hidden">…{dep.emitter.address.slice(-6)}</span>
													<span class="hidden sm:inline">
														{dep.emitter.address.slice(0, 6)}...{dep.emitter.address.slice(-4)}
													</span>
												</span>
												<span class="text-gray-600">•</span>
												<span>{new Date(Number(dep.timestamp) * 1000).toLocaleString()}</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-sm text-gray-400">No recent mints.</div>
							{/if}
						</div>
					{:else}
						<div>
							<div class="mb-2 flex items-center justify-between">
								<h3 class="font-semibold">Latest Burns</h3>
								<ExternalLink
									href="https://portal.s01issuer.com/metrics"
									label="View All"
									className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
								/>
							</div>
							{#if currentToken?.withdraws?.length}
								<div>
									{#each currentToken.withdraws.slice(0, 5) as w}
										<div
											class="border-b border-white/5 px-2 py-3 transition-colors hover:bg-white/5"
										>
											<div class="flex items-center justify-between gap-3 text-xs">
												<div class="min-w-0 truncate">
													<span class="font-medium text-red-400">
														− {formatUnits(BigInt(w.amount), 18)}
														{currentToken.symbol}
													</span>
												</div>
												<div class="flex flex-shrink-0 items-center gap-2">
													<TxLink hash={w.transaction.id} />
												</div>
											</div>
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
												<span>
													<span class="sm:hidden">…{w.emitter.address.slice(-6)}</span>
													<span class="hidden sm:inline">
														{w.emitter.address.slice(0, 6)}...{w.emitter.address.slice(-4)}
													</span>
												</span>
												<span class="text-gray-600">•</span>
												<span>{new Date(Number(w.timestamp) * 1000).toLocaleString()}</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-sm text-gray-400">No recent burns.</div>
							{/if}
						</div>
					{/if}
				</div>
				<!-- Underlying Equity (Right) -->
				<div class="min-w-0 space-y-4">
					<div class="space-y-3">
						<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
							Equity Details
						</h3>
						<TabNav tabs={ASSET_TABS} activeId={activeAssetTab} on:change={handleAssetTabChange} />
					</div>
					{#if activeAssetTab === 'company'}
						{#if tradingViewSymbol}
							<div class="hidden overflow-hidden sm:block">
								<TradingViewWidget
									widgetType="symbol-profile"
									symbol={tradingViewSymbol}
									height="480"
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden sm:hidden">
								<TradingViewWidget
									widgetType="symbol-profile"
									symbol={tradingViewSymbol}
									height="320"
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if activeAssetTab === 'fundamentals'}
						{#if tradingViewSymbol}
							<div class="hidden overflow-hidden sm:block">
								<TradingViewWidget
									widgetType="financials"
									symbol={tradingViewSymbol}
									height={520}
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden sm:hidden">
								<TradingViewWidget
									widgetType="financials"
									symbol={tradingViewSymbol}
									height={360}
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if activeAssetTab === 'technical'}
						{#if tradingViewSymbol}
							<div class="hidden overflow-hidden sm:block">
								<TradingViewWidget
									widgetType="technical-analysis"
									symbol={tradingViewSymbol}
									height="520"
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden sm:hidden">
								<TradingViewWidget
									widgetType="technical-analysis"
									symbol={tradingViewSymbol}
									height="360"
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if tradingViewSymbol}
						<div class="hidden overflow-hidden sm:block">
							<TradingViewWidget
								widgetType="timeline"
								symbol={tradingViewSymbol}
								height="600"
								isTransparent={true}
							/>
						</div>
						<div class="overflow-hidden sm:hidden">
							<TradingViewWidget
								widgetType="timeline"
								symbol={tradingViewSymbol}
								height="400"
								isTransparent={true}
							/>
						</div>
					{:else}
						<div class="p-4">
							<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
	{#if showTradePanel}
		<div class="fixed inset-0 z-[2100] flex">
			<button
				type="button"
				class="hidden flex-1 sm:block"
				aria-label="Close trade panel"
				on:click={closeTradePanel}
			></button>
			<aside
				class="relative h-full w-full border-l-0 border-white/10 bg-gradient-to-b from-gray-950 to-gray-900 shadow-2xl sm:max-w-[22rem] sm:border-l"
				in:fly={{ x: 320, duration: 220 }}
				out:fly={{ x: 320, duration: 180 }}
				role="dialog"
				aria-modal="true"
				aria-label={'Trade ' + tokenDisplayName}
				data-tutorial="trade-panel"
			>
				<div class="flex h-full flex-col">
					<div
						class="flex items-start justify-between border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5"
					>
						<div class="flex items-start gap-2 sm:gap-3">
							{#if currentPythToken?.logoUrl}
								<img
									src={currentPythToken.logoUrl}
									alt={tokenDisplaySymbol || tokenDisplayName}
									class="h-8 w-8 rounded-full border border-white/10 object-cover sm:h-10 sm:w-10"
								/>
							{/if}
							<div>
								<h2 class="text-base font-semibold sm:text-lg">{tokenDisplayName}</h2>
								{#if tokenDisplaySymbol}
									<p class="text-xs text-gray-400 sm:text-sm">{tokenDisplaySymbol}</p>
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
							on:click={closeTradePanel}
							aria-label="Close trade panel"
						>
							<svg
								class="h-5 w-5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M6 6l12 12M6 18L18 6" />
							</svg>
						</button>
					</div>
					<div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
						<div class="space-y-4 pb-10 sm:space-y-6">
							<div class="grid grid-cols-2 gap-2 sm:gap-3" aria-label="Select order side">
								<button
									type="button"
									class={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 sm:px-4 sm:py-3 ${
										panelOrderSide === 'Buy'
											? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
											: 'bg-white/5 text-gray-200 hover:bg-white/10'
									}`}
									on:click={() => (panelOrderSide = 'Buy')}
								>
									Buy
								</button>
								<button
									type="button"
									class={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 sm:px-4 sm:py-3 ${
										panelOrderSide === 'Sell'
											? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
											: 'bg-white/5 text-gray-200 hover:bg-white/10'
									}`}
									on:click={() => (panelOrderSide = 'Sell')}
								>
									Sell
								</button>
							</div>
							<div class="space-y-1 sm:space-y-2">
								<div
									class="flex flex-wrap items-center gap-1 text-xs font-medium text-gray-300 sm:gap-2 sm:text-sm"
								>
									<span>{panelSummaryVerb} {panelTokenLabel}</span>
									<span class="text-gray-500">{panelSummaryPreposition}</span>
									<span class="inline-flex items-center gap-1 text-gray-200">
										{settlementTokenSymbol}
										<img
											src={settlementTokenLogo}
											alt={settlementTokenSymbol}
											class="h-3.5 w-3.5 sm:h-4 sm:w-4"
										/>
									</span>
								</div>
								<div class="flex items-center gap-1 text-xs text-gray-400 sm:gap-2 sm:text-sm">
									<span>On</span>
									<img src="/images/BASE.svg" alt="Base" class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
									<span>{$currentNetwork.displayName}</span>
								</div>
							</div>
							<label class="block space-y-1.5 sm:space-y-2" for={PANEL_STRATEGY_SELECT_ID}>
								<span
									id={PANEL_STRATEGY_LABEL_ID}
									class="block text-xs font-medium text-gray-300 sm:text-sm"
								>
									Order Type
								</span>
								<Select
									options={PANEL_STRATEGY_OPTIONS}
									bind:selected={panelStrategy}
									id={PANEL_STRATEGY_SELECT_ID}
									ariaLabelledby={PANEL_STRATEGY_LABEL_ID}
									getOptionLabel={(opt) => {
										switch (opt) {
											case 'limit':
												return 'Limit Order';
											case 'dca':
												return 'Dollar Cost Averaging';
											case 'market':
												return 'Market Order';
											default:
												return opt;
										}
									}}
								/>
							</label>
							<div>
								{#if panelStrategy === 'limit'}
									<LimitOrder
										orderSide={panelOrderSide}
										assetToken={currentPythToken}
										currentPrice={panelOrderSide === 'Buy'
											? (sellPrice ?? oraclePriceData?.price)?.toFixed(4)
											: (buyPrice ?? oraclePriceData?.price)?.toFixed(4)}
										{buyPrice}
										{sellPrice}
									/>
								{:else if panelStrategy === 'market'}
									<MarketOrder
										orderSide={panelOrderSide}
										assetToken={currentPythToken}
										{orderbookQuotesQuery}
										{buyPrice}
										{sellPrice}
									/>
								{:else if panelStrategy === 'dca'}
									<DcaOrder orderSide={panelOrderSide} assetToken={currentPythToken} />
								{/if}
							</div>
						</div>
					</div>
				</div>
			</aside>
		</div>
	{/if}
	<!-- Compact Footer -->
	<footer class="border-t border-white/5 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
		<div class="mx-auto max-w-5xl">
			<!-- Links Row - fewer on mobile -->
			<div
				class="mb-4 flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-400 sm:mb-6 sm:gap-6 sm:text-sm"
			>
				<a href="/terms" class="transition-colors hover:text-yellow-500">Terms</a>
				<a href="/privacy-policy" class="transition-colors hover:text-yellow-500">Privacy</a>
				<a href="/docs" class="transition-colors hover:text-yellow-500">Docs</a>
				<a href="/faqs" class="hidden transition-colors hover:text-yellow-500 sm:inline">FAQs</a>
			</div>

			<!-- Social Links -->
			<div class="mb-4 flex items-center justify-center gap-3 sm:mb-6 sm:gap-4">
				<a
					href="mailto:toby@st0x.io"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="Email"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 2v.01L12 13 4 6.01V6h16zM4 18V8.236l7.386 6.178a1 1 0 001.228 0L20 8.236V18H4z"
						/></svg
					>
				</a>
				<a
					href="https://x.com/st0x_io"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="X"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
						/></svg
					>
				</a>
				<a
					href="https://t.me/+oIzo_I9xi745ODU0"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="Telegram"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
						/></svg
					>
				</a>
				<a
					href="https://www.linkedin.com/company/st0x"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all hover:bg-yellow-500/20 hover:text-yellow-500"
					aria-label="LinkedIn"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
						><path
							d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
						/></svg
					>
				</a>
			</div>

			<!-- Copyright and Risk Warning -->
			<div class="text-center">
				<p class="mb-4 text-xs text-gray-500">
					© {new Date().getFullYear()} SARK X (BVI) Ltd. All rights reserved.
				</p>
				<p class="text-[10px] leading-relaxed text-gray-600 sm:text-xs">
					<span class="text-yellow-600">Risk Warning:</span> Trading tokenized assets involves substantial
					risk. Past performance does not guarantee future results.
				</p>
			</div>
		</div>
	</footer>
{/if}
{#if showChartModal}
	<div class="fixed inset-0 z-[2000]">
		<button
			type="button"
			class="absolute inset-0 h-full w-full bg-black/60"
			aria-label="Close terminal view"
			on:click={closeChartModal}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					closeChartModal();
				}
			}}
		></button>
		<div class="relative z-10 flex h-full flex-col bg-gray-950">
			<div
				class="flex items-center justify-between border-b border-white/10 px-3 py-3 sm:px-6 sm:py-5"
			>
				<div class="min-w-0 flex-1">
					<p class="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Advanced Chart</p>
					<h2 class="truncate text-base font-semibold text-white sm:text-xl">{modalTitle}</h2>
				</div>
				<button
					type="button"
					class="ml-2 rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
					on:click={closeChartModal}
					aria-label="Close terminal view"
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>
			<div class="flex-1 overflow-hidden px-2 pb-2 pt-2 sm:px-6 sm:pb-6 sm:pt-4">
				<div class="h-full w-full rounded-xl border border-white/10 bg-gray-900 p-1 sm:p-2">
					{#if tradingViewSymbol}
						<TradingViewChart symbol={tradingViewSymbol} interval="60" />
					{:else}
						<div class="flex h-full items-center justify-center text-sm text-gray-400">
							TradingView data unavailable for this token.
						</div>
					{/if}
				</div>
			</div>
			<div
				class="flex flex-row gap-2 border-t border-white/10 bg-gradient-to-r from-green-500/10 via-gray-900/80 to-red-500/10 px-3 py-3 sm:justify-end sm:gap-3 sm:px-6 sm:py-6"
			>
				<button
					type="button"
					class="flex-1 rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-white shadow-xl shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:flex-none sm:rounded-2xl sm:px-8 sm:py-4 sm:text-lg"
					on:click={() => openTradePanel('Buy', { closeTerminal: false })}
				>
					Buy
				</button>
				<button
					type="button"
					class="flex-1 rounded-xl bg-red-500 px-4 py-3 text-base font-semibold text-white shadow-xl shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:flex-none sm:rounded-2xl sm:px-8 sm:py-4 sm:text-lg"
					on:click={() => openTradePanel('Sell', { closeTerminal: false })}
				>
					Sell
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Vault Tutorial -->
<VaultTutorial onSelectDexTab={handleVaultTutorialTabChange} />
