<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { currentNetwork, tradePanelOpen } from '$lib/stores';
	import { setSheetOpen } from '$lib/stores/uiStore';
	import { formatUnits } from 'viem';
	import { createApiTokensQuery, findApiTokenByAnyAddress } from '$lib/queries/tokens';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	// PERF-01: LimitOrder + DcaOrder are lazy-loaded via {#await import()} below
	// (only fetched when their tab is selected). MarketOrder stays eager — it is
	// the default tab (panelStrategy = 'market') and represents the panel's
	// first-paint LCP element when the user opens the trade panel.
	import { truncateAddress } from '$lib/utils/format';
	// PERF-01: TradingViewChart is lazy-loaded — it only renders inside the
	// chart-modal (showChartModal) which is closed on first paint.
	import TradingViewWidget from '$lib/components/charts/TradingViewWidget.svelte';
	import { theme } from '$lib/stores/themeStore';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { onMount } from 'svelte';
	import {
		wrapExplainerOpen,
		openWrapExplainer,
		closeWrapExplainer
	} from '$lib/stores/wrapExplainerStore';
	import { panelDenom } from '$lib/stores/panelDenomStore';
	import { fly } from 'svelte/transition';
	import Select from '$lib/components/ui/Select.svelte';
	import type { SgTrade } from '@rainlanguage/raindex';
	// PERF-01: TokenMarketCharts is lazy-loaded — it pulls lightweight-charts
	// (~150KB minified) and only renders when activeOnchainTab === 'market'.
	import type {
		DepthSeries,
		TradeHistoryPoint,
		VolumeBucket,
		OHLCBucket
	} from '$lib/components/charts/token-chart-types';
	import { tradesToOHLCBuckets, tradesToVolumeBuckets } from '$lib/utils/ohlc';
	import MarketOrder from '$lib/components/orders/MarketOrder.svelte';
	import WrapRatioChip from '$lib/components/wrap/WrapRatioChip.svelte';
	import WrapRatioCard from '$lib/components/wrap/WrapRatioCard.svelte';
	import WrapExplainerModal from '$lib/components/wrap/WrapExplainerModal.svelte';
	import DenomToggle from '$lib/components/wrap/DenomToggle.svelte';
	import RatioHistoryTab from '$lib/components/wrap/RatioHistoryTab.svelte';
	import { createExchangeRatesQuery, resolveRatio } from '$lib/queries/exchangeRates';
	import { priceScale as denomPriceScale } from '$lib/utils/wrapDenom';
	import { extractBaseSymbol } from '$lib/utils/tradingViewSymbols';
	import {
		analyzeTrade,
		createTokenLookup,
		normalizeAddress,
		ratioToNumber,
		toDecimal,
		toBigInt,
		getRaindexVaultUrl
	} from '$lib/utils/tokenMath';
	import {
		getMakerInputTokenAddress,
		getMakerOutputTokenAddress
	} from '$lib/types/orderPerspective';
	import { trackPageView } from '$lib/services/analytics';
	import { initScrollTracking } from '$lib/utils/scrollTracking';
	import {
		createTokenOrderbookQuotesQuery,
		refreshLegacyTokenQuotes,
		type OrderbookQuoteCache
	} from '$lib/queries/orderbook';
	import type { QueryObserverResult } from '@tanstack/query-core';
	import {
		createTokenTradeActivityQuery,
		createTakerTradesQuery,
		createBatchTradesQuery
	} from '$lib/queries/tradeActivity';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress, authMethod } from '$lib/stores/authStore';
	import { dynamicSession } from '$lib/stores/dynamicStore';
	import { promptWalletConnection } from '$lib/stores/accessStore';
	import { tutorialWantsTradePanel } from '$lib/stores/tutorialStore';
	import { startVaultTutorial, vaultTutorialActive } from '$lib/stores/vaultTutorialStore';
	import VaultTutorial from '$lib/components/VaultTutorial.svelte';
	import { isVaultTutorialHidden } from '$lib/utils/tutorialStorage';
	import type { RaindexVault } from '@rainlanguage/raindex';
	import transactionStore from '$lib/stores/transaction';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import {
		createSingleSftQuery,
		createUserVaultsQuery,
		prefetchUserVaults
	} from '$lib/queries/vaults';
	import OrdersTable from '$lib/components/orders/OrdersTable.svelte';
	import type { DisplayOrder } from '$lib/types/orders';
	import { transformApiTakerTradesToDisplay } from '$lib/utils/tradeTransform';
	import { addTokenToWallet } from '$lib/utils/walletUtils';
	$: tokenId = $page.params.id;

	// Hide track in wallet buttons for embedded wallets
	$: isEmbeddedWallet = $authMethod === 'dynamic' && $dynamicSession?.walletType === 'embedded';

	// Get queryClient for cache lookup
	const queryClient = useQueryClient();

	// Use single token query - checks global cache first, falls back to single fetch
	$: singleTokenQuery = createSingleSftQuery(tokenId, $currentNetwork, queryClient);
	$: currentToken = $singleTokenQuery.data;
	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];
	$: tokensLookup = createTokenLookup(apiTokens);
	let orderbookQuotesQuery = createTokenOrderbookQuotesQuery(
		$currentNetwork,
		currentToken?.address ?? null
	);
	let tokenTradeQuery = createTokenTradeActivityQuery(
		$currentNetwork,
		currentToken?.address ?? null
	);
	let midpointPricesQuery = createMidpointPricesQuery($currentNetwork);
	const exchangeRatesQuery = createExchangeRatesQuery();
	$: {
		orderbookQuotesQuery = createTokenOrderbookQuotesQuery(
			$currentNetwork,
			currentToken?.address ?? null
		);
		tokenTradeQuery = createTokenTradeActivityQuery($currentNetwork, currentToken?.address ?? null);
		midpointPricesQuery = createMidpointPricesQuery($currentNetwork);
	}

	// Wrap ratio (assetsPerShare) for the current wrapped token. Defaults to 1
	// when the API lookup is missing — parity wrappers stay 1:1 and the chip /
	// callouts hide themselves.
	$: currentRatio = resolveRatio(
		$exchangeRatesQuery.data ?? null,
		currentApiToken?.address ?? currentToken?.address ?? null
	);
	// Sticky `hasRatio`: once we've ever resolved a non-1 ratio for the current
	// token, keep the chip + Ratio History tab visible even if a later refetch
	// transiently flips currentRatio back to 1 (the safe fallback inside
	// resolveRatio). Without this stickiness, the chip flickers in/out during
	// exchange-rates polling, TOKEN_TABS recomputes, and handleTokenTabChange
	// rejects ratio-tab clicks that race the dropout window. Keyed by the
	// resolved token address so navigating between tokens correctly resets.
	let hasEverHadRatioForToken: { address: string; value: boolean } | null = null;
	$: {
		const addr = (currentApiToken?.address ?? currentToken?.address ?? '').toLowerCase();
		const isNonOne = Number.isFinite(currentRatio) && currentRatio !== 1;
		if (!hasEverHadRatioForToken || hasEverHadRatioForToken.address !== addr) {
			hasEverHadRatioForToken = { address: addr, value: isNonOne };
		} else if (isNonOne && !hasEverHadRatioForToken.value) {
			hasEverHadRatioForToken = { address: addr, value: true };
		}
	}
	$: hasRatio = hasEverHadRatioForToken?.value ?? false;

	// "Ratio History" tab only shows when this wrapper actually has a non-1
	// ratio — keeps the tab strip lean for parity tokens.
	$: TOKEN_TABS = (
		hasRatio
			? [
					{ id: 'contract', label: 'Contract' },
					{ id: 'ratio', label: 'Ratio History' },
					{ id: 'supply', label: 'Supply' },
					{ id: 'mints', label: 'Mints' },
					{ id: 'burns', label: 'Burns' }
				]
			: [
					{ id: 'contract', label: 'Contract' },
					{ id: 'supply', label: 'Supply' },
					{ id: 'mints', label: 'Mints' },
					{ id: 'burns', label: 'Burns' }
				]
	) as ReadonlyArray<{ id: string; label: string; badge?: number | string | null }>;

	// Table denomination — shares (t*) matches chart/oracle, wrapped (wt*)
	// matches wallet balance. Default to shares; user toggles via DenomToggle.
	let tableDenom: 'unwrapped' | 'wrapped' = 'unwrapped';
	function handleDenomChange(event: CustomEvent<'unwrapped' | 'wrapped'>) {
		tableDenom = event.detail;
	}

	// Price scaling for charts: OHLC + depth arrive in USD per wt* (the
	// orderbook's native unit). Toggling to 'unwrapped' rescales by dividing
	// by the ratio so the chart axis labels become USD per share. Identity
	// transform when ratio is 1 (most tokens today). See `$lib/utils/wrapDenom`
	// for the shared denom helpers used here and in OrdersTable.
	$: priceScale = denomPriceScale(tableDenom, currentRatio);
	$: displayOhlcData =
		priceScale === 1
			? ohlcData
			: ohlcData.map((c) => ({
					x: c.x,
					o: c.o * priceScale,
					h: c.h * priceScale,
					l: c.l * priceScale,
					c: c.c * priceScale
				}));
	$: displayOrderbookDepth =
		priceScale === 1
			? orderbookDepth
			: {
					bids: orderbookDepth.bids.map((b) => ({ ...b, price: b.price * priceScale })),
					asks: orderbookDepth.asks.map((a) => ({ ...a, price: a.price * priceScale }))
				};

	// Explainer modal state imported from $lib/stores/wrapExplainerStore.ts.
	// Module-level store decouples open/close propagation from this component's
	// 100+-var reactive graph — clicks on the chip's onLearnMore prop callback
	// flow directly through Svelte's store subscription machinery rather than
	// through the trade page's per-component dirty-bit accounting (which races
	// on the 6th word boundary under suite-level load and intermittently
	// dropped updates when the state lived as a top-level `let` or per-
	// component `writable`).

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

	// Taker trades for market orders (user's executed trades)
	$: takerTradesQuery = createTakerTradesQuery($currentNetwork, $walletAddress, 600_000);

	// Transform taker trades into display orders (filtered to current token)
	$: userMarketOrders = (() => {
		const trades = $takerTradesQuery?.data?.trades;
		if (!trades?.length || !$currentNetwork) return [];
		return transformApiTakerTradesToDisplay(trades, $currentNetwork.chainId);
	})();

	// Extract user's order hashes for batch trades (filled data)
	$: userOrderHashesForToken = (() => {
		if (!$orderbookQuotesQuery.data?.quotes || !$walletAddress) return [] as string[];
		const myAddress = $walletAddress.toLowerCase();
		return $orderbookQuotesQuery.data.quotes
			.filter(
				(q) =>
					q.sgOrder?.owner?.toLowerCase() === myAddress &&
					(assetAddressSet.has(getMakerInputTokenAddress(q)?.toLowerCase() ?? '') ||
						assetAddressSet.has(getMakerOutputTokenAddress(q)?.toLowerCase() ?? ''))
			)
			.map((q) => q.orderHash);
	})();

	// Fetch batch trades for user's orders on this token
	$: batchTradesQuery = createBatchTradesQuery($currentNetwork, userOrderHashesForToken, 600_000);

	// Transform quotes and market orders into DisplayOrder format for OrdersTable
	// Note: Filtering by owner/type and closed orders are handled by OrdersTable component
	$: tokenOrders = (() => {
		const displayOrders: DisplayOrder[] = [];
		const tokenAddress = currentToken?.address?.toLowerCase() ?? '';
		const tradesMap = $batchTradesQuery?.data;

		// Add limit orders from quotes (for current token only; match wrapped or legacy address)
		if (currentToken?.address && $orderbookQuotesQuery.data?.quotes) {
			const quotes = $orderbookQuotesQuery.data.quotes;

			// Filter by token (input or output matches current token's wrapped or legacy address)
			const filtered = quotes.filter(
				(q) =>
					assetAddressSet.has(getMakerInputTokenAddress(q)?.toLowerCase() ?? '') ||
					assetAddressSet.has(getMakerOutputTokenAddress(q)?.toLowerCase() ?? '')
			);

			// Transform to DisplayOrder
			for (const quote of filtered) {
				const isBuy = quote.side === 'bid';
				const tokenSymbol = isBuy ? quote.inputTokenSymbol : quote.outputTokenSymbol;
				// Use the classified order type, defaulting to 'limit' if not set
				const orderType = quote.orderType ?? 'limit';

				// Compute filled amount from batch trades (only for user's orders)
				let filled: number | undefined;
				let filledSymbol: string | undefined;
				const trades = tradesMap?.get(quote.orderHash.toLowerCase());
				if (trades?.length) {
					let totalFilled = 0;
					for (const trade of trades) {
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
					isActive: quote.sgOrder?.active ?? true
				});
			}
		}

		// Add market orders (user's taker trades for this token)
		if (userMarketOrders.length > 0 && tokenAddress) {
			for (const order of userMarketOrders) {
				if (assetAddressSet.has(order.tokenAddress.toLowerCase())) {
					displayOrders.push(order);
				}
			}
		}

		// Sort by timestamp descending
		displayOrders.sort((a, b) => b.timestamp - a.timestamp);

		return displayOrders;
	})();

	// User vaults query - no polling, invalidated after order deployment
	$: userVaultsQuery = createUserVaultsQuery($currentNetwork, $walletAddress);

	// Background prefetch of the user's vaults when page loads. The full-book orders
	// prefetch that used to live here fired a request per stock token on every trade-page
	// visit purely to warm a display cache — cut to protect the shared upstream rate limit.
	$: if (browser && $currentNetwork && $walletAddress) {
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
	$: currentApiToken = (() => {
		if (!tokenId || !$currentNetwork?.chainId) return undefined;
		const match = findApiTokenByAnyAddress(apiTokens, tokenId);
		return match?.chainId === $currentNetwork.chainId ? match : undefined;
	})();
	$: baseSymbol = extractBaseSymbol(currentToken?.symbol);
	$: tradingViewSymbol = currentApiToken?.tradingViewSymbol ?? baseSymbol;
	const ASSET_TABS = [
		{ id: 'company', label: 'Company Info' },
		{ id: 'fundamentals', label: 'Fundamentals' },
		{ id: 'technical', label: 'Technical' },
		{ id: 'news', label: 'Top Stories' }
	] as const;
	type AssetTabId = (typeof ASSET_TABS)[number]['id'];
	let activeAssetTab: AssetTabId = 'company';
	type TokenTabId = 'contract' | 'ratio' | 'supply' | 'mints' | 'burns';
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
	// On mobile the order panel is a full-screen overlay; hide the bottom tab bar
	// while it's open so the bar never covers the panel's submit button.
	$: setSheetOpen('tradePanel', showTradePanel);

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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
	// tradesToOHLCBuckets / tradesToVolumeBuckets are imported from $lib/utils/ohlc.
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
	function formatBaseUnitAmount(value: string | null | undefined): string {
		const amount = toBigInt(value);
		return amount === null ? '0' : formatUnits(amount, 18);
	}
	function formatResourceError(error: unknown, fallback: string): string {
		if (!error) return fallback;
		if (typeof error === 'string') return error;
		if (error instanceof Error) {
			return error.message || fallback;
		}
		return fallback;
	}
	// Include legacy address so bid/ask and depth match quotes for tokens like tSTOX/wtSTOX
	$: assetAddressSet = (() => {
		const set = new Set<string>();
		if (currentApiToken?.address) set.add(currentApiToken.address.toLowerCase());
		if (currentApiToken?.legacyAddress) set.add(currentApiToken.legacyAddress.toLowerCase());
		// Also add currentToken.address in case subgraph uses a different id
		if (currentToken?.address) set.add(currentToken.address.toLowerCase());
		return set;
	})();
	// Display pricing is REST-authoritative. The local orderbook quote remains available for
	// execution and liquidity validation, but it must not override the sampled platform price.
	$: midpointEntry = getMidpointPrice(
		$midpointPricesQuery?.data,
		currentApiToken?.address ?? currentToken?.address
	);
	$: midpointPriceLoading =
		$midpointPricesQuery?.fetchStatus === 'fetching' && midpointEntry === undefined;
	$: midPrice = midpointEntry?.price ?? null;
	$: midpointBid = midpointEntry?.bid ?? null;
	$: midpointAsk = midpointEntry?.ask ?? null;
	$: midIsCached = midPrice != null && midpointEntry?.source === 'cached';
	$: midSpread = midpointBid != null && midpointAsk != null ? midpointAsk - midpointBid : null;
	let cleanupScrollTracking: (() => void) | null = null;
	let lastTrackedTokenId: string | null = null;

	// Track page view reactively when token data is available
	// Uses lastTrackedTokenId to ensure tracking fires for each new token during client-side navigation
	$: if (currentApiToken?.symbol && $page.params.id !== lastTrackedTokenId) {
		lastTrackedTokenId = $page.params.id;
		// OBS-08 (Plan 02-03 Task 2c, checker fix #7): emit `page_viewed` with
		// `page: 'trade'` so the funnel filter (`page === 'trade'`) works at the
		// intent step. Was previously `'trade_page'` which the funnel cannot match.
		trackPageView('trade', {
			token_symbol: currentApiToken.symbol,
			token_id: $page.params.id
		});
	}

	onMount(() => {
		// Initialize scroll tracking
		cleanupScrollTracking = initScrollTracking('trade_page');

		return () => {
			if (cleanupScrollTracking) {
				cleanupScrollTracking();
			}
		};
	});
	const handleAssetTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (ASSET_TABS.some((tab) => tab.id === nextId)) {
			activeAssetTab = nextId as AssetTabId;
		}
	};
	function handleTokenTabChange(event: CustomEvent<{ id: string }>) {
		const nextId = event.detail.id;
		if (TOKEN_TABS.some((tab) => tab.id === nextId)) {
			activeTokenTab = nextId as TokenTabId;
		}
	}
	let showChartModal = false;
	// Full-screen terminal/chart view on mobile — hide the bottom tab bar under it.
	$: setSheetOpen('chartModal', showChartModal);
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
					const inputAddress = getMakerInputTokenAddress(quote).toLowerCase();
					const outputAddress = getMakerOutputTokenAddress(quote).toLowerCase();
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
		const assetAddress = (currentApiToken?.address ?? currentToken.address)?.toLowerCase();
		const quoteAddress = settlementToken.address?.toLowerCase();
		if (!assetAddress || !quoteAddress) return [];
		const _assetDecimals = Number(currentApiToken?.decimals ?? 18);
		const _quoteDecimals = Number(settlementToken.decimals ?? 6);
		const range = $tokenTradeQuery?.data?.range ?? null;
		const now = Date.now();
		const cutoff = range ? range.from * 1000 : now - TRADE_HISTORY_LOOKBACK_SECONDS * 1000;
		const rangeEnd = range ? range.to * 1000 : now;
		const trades = $tokenTradeQuery?.data?.trades ?? [];

		const points: TradeHistoryPoint[] = [];
		for (const trade of trades) {
			const timestamp = trade.timestamp * 1000;
			if (timestamp < cutoff || timestamp > rangeEnd) continue;

			const inputAddr = trade.inputToken?.address?.toLowerCase();
			const outputAddr = trade.outputToken?.address?.toLowerCase();

			// Determine which side is the asset and which is the quote
			let tokens = 0;
			let quote = 0;
			let price = 0;
			let side: 'bid' | 'ask' = 'bid';

			const inputAmount = parseFloat(trade.inputAmount);
			const outputAmount = parseFloat(trade.outputAmount);

			if (assetAddressSet.has(inputAddr ?? '') && outputAddr === quoteAddress) {
				// Asset is input (received by order), quote is output (given by order)
				// Order receives asset and gives quote = bid
				tokens = Math.abs(inputAmount);
				quote = Math.abs(outputAmount);
				side = 'bid';
			} else if (assetAddressSet.has(outputAddr ?? '') && inputAddr === quoteAddress) {
				// Asset is output (given by order), quote is input (received by order)
				// Order gives asset and receives quote = ask
				tokens = Math.abs(outputAmount);
				quote = Math.abs(inputAmount);
				side = 'ask';
			} else {
				continue; // Trade doesn't involve this token pair
			}

			if (tokens > 0) {
				price = quote / tokens;
			}
			if (!Number.isFinite(price) || price <= 0) continue;

			points.push({ timestamp, price, tokens, quote, side });
		}

		// Deduplicate by timestamp+price+tokens
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
			const inputAddress = getMakerInputTokenAddress(quote).toLowerCase();
			const outputAddress = getMakerOutputTokenAddress(quote).toLowerCase();
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
		const tradeResource = $tokenTradeQuery;
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
	$: modalTitle = tokenDisplaySymbol
		? `Advanced Chart — ${tokenDisplayName} (${tokenDisplaySymbol})`
		: `Advanced Chart — ${tokenDisplayName}`;
	// Display symbols for the trade panel. The wrapped symbol is the orderbook
	// primitive (wtX); the unwrapped symbol is the underlying share (tX). The
	// `panelDenom` store toggles which one we show in the panel's verb line,
	// input field, balance row, summary, etc. — see `panelDenomStore.ts`.
	$: panelWrappedSymbol =
		currentApiToken?.symbol ?? currentToken?.symbol ?? tokenDisplaySymbol ?? tokenDisplayName;
	$: panelAssetSymbol = panelWrappedSymbol.replace(/^wt/, 't');
	$: panelTokenLabel = $panelDenom === 'unwrapped' ? panelAssetSymbol : panelWrappedSymbol;
	$: panelSummaryVerb = panelOrderSide === 'Buy' ? 'Buying' : 'Selling';
	$: panelSummaryPreposition = panelOrderSide === 'Buy' ? 'with' : 'for';
	$: panelRatioCalloutDisplay = Number.isInteger(currentRatio)
		? String(currentRatio)
		: currentRatio.toLocaleString('en-US', { maximumFractionDigits: 4 });
</script>

<svelte:window on:keydown={handleGlobalKeydown} />
{#if $singleTokenQuery.isPending}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else if $singleTokenQuery.isError}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="text-lg text-red-400">Failed to load token data</p>
			<p class="mt-2 text-sm text-text-2">
				{$singleTokenQuery.error?.message || 'Unknown error'}
			</p>
		</div>
	</div>
{:else if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="text-lg text-text-2">Token not found</p>
			<p class="mt-2 text-sm text-text-3">ID: {tokenId}</p>
		</div>
	</div>
{:else}
	<div class="space-y-4 p-3 sm:space-y-6 sm:p-6">
		{#if hasRatio}
			<!-- Token title row with wrap-ratio chip — only when the token is a
				 non-parity wrapper, otherwise it's noise. -->
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0 leading-tight">
					<h1 class="text-xl font-semibold leading-tight text-text sm:text-2xl">
						{tokenDisplayName}
					</h1>
					<div
						class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-2 sm:text-sm"
					>
						<span class="font-mono tabular-nums"
							>{currentApiToken?.symbol ?? currentToken.symbol}</span
						>
						<span class="text-text-muted">·</span>
						<span>Wrapped tStock on {$currentNetwork.displayName}</span>
					</div>
				</div>
				<WrapRatioChip
					ratio={currentRatio}
					wrappedSymbol={currentApiToken?.symbol ?? currentToken.symbol}
					assetSymbol={(currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't')}
					onLearnMore={openWrapExplainer}
				/>
			</div>
		{/if}
		<!-- Header Section with Chart -->
		<div class="space-y-4 sm:space-y-6">
			<div class="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-5">
				<!-- Left: Symbol info -->
				<div class="space-y-3 sm:space-y-4 xl:col-span-2">
					<div
						class="relative overflow-hidden rounded-2xl border border-line bg-overlay-1 backdrop-blur"
						data-tutorial="symbol-overview"
					>
						<div
							class="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"
						></div>
						<div class="relative border-b border-line px-3 py-2 sm:px-4 sm:py-3">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-[10px] uppercase tracking-wide text-text-2 sm:text-xs">
										Off-chain Reference
									</p>
									<p class="mt-0.5 text-sm font-semibold text-text-2 sm:mt-1 sm:text-base">
										{tokenDisplayName}
									</p>
								</div>
								{#if tradingViewSymbol}
									<span class="text-xs text-text-2 sm:text-sm">{tradingViewSymbol}</span>
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
								class="flex h-32 items-center justify-center px-4 py-6 text-sm text-text-2 sm:h-48"
							>
								TradingView data unavailable for this token.
							</div>
						{/if}
					</div>
					<div class="rounded-2xl border border-line bg-overlay-1 p-4 backdrop-blur sm:p-5">
						<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:gap-x-6 sm:gap-y-3 sm:text-sm">
							<div>
								<dt class="text-[10px] uppercase tracking-wider text-text-3 sm:text-xs">
									Mid Price
								</dt>
								<dd
									class="mt-0.5 font-mono tabular-nums text-text sm:mt-1"
									title={midIsCached ? 'Last known midpoint (market closed or one-sided book)' : ''}
								>
									{#if midpointPriceLoading}
										Loading...
									{:else if midPrice !== null}
										{#if hasRatio && currentRatio > 0}
											{@const assetSym = (currentApiToken?.symbol ?? currentToken.symbol).replace(
												/^wt/,
												't'
											)}
											{@const wrappedSym = currentApiToken?.symbol ?? currentToken.symbol}
											<div class="leading-tight">
												<div>
													${formatNumeric(midPrice / currentRatio)}
													<span class="text-[10px] font-normal text-text-3">/ {assetSym}</span>
												</div>
												<div class="mt-0.5 text-[11px] font-normal text-text-2 sm:text-xs">
													${formatNumeric(midPrice)}
													<span class="text-[10px] text-text-3">/ {wrappedSym}</span>
												</div>
											</div>
										{:else}
											${formatNumeric(midPrice)}{#if midIsCached}<span class="text-text-3">*</span
												>{/if}
										{/if}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wider text-text-3 sm:text-xs">Spread</dt>
								<dd class="mt-0.5 font-mono tabular-nums text-text sm:mt-1">
									{#if midSpread !== null}
										${formatNumeric(midSpread)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wider text-text-3 sm:text-xs">
									Bid Price
								</dt>
								<dd class="mt-0.5 font-mono tabular-nums text-text sm:mt-1">
									{#if midpointPriceLoading}
										Loading...
									{:else if midpointBid !== null}
										{#if hasRatio && currentRatio > 0}
											{@const assetSym = (currentApiToken?.symbol ?? currentToken.symbol).replace(
												/^wt/,
												't'
											)}
											{@const wrappedSym = currentApiToken?.symbol ?? currentToken.symbol}
											<div class="leading-tight">
												<div>
													${formatNumeric(midpointBid / currentRatio)}
													<span class="text-[10px] font-normal text-text-3">/ {assetSym}</span>
												</div>
												<div class="mt-0.5 text-[11px] font-normal text-text-2 sm:text-xs">
													${formatNumeric(midpointBid)}
													<span class="text-[10px] text-text-3">/ {wrappedSym}</span>
												</div>
											</div>
										{:else}
											${formatNumeric(midpointBid)}
										{/if}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-[10px] uppercase tracking-wider text-text-3 sm:text-xs">
									Offer Price
								</dt>
								<dd class="mt-0.5 font-mono tabular-nums text-text sm:mt-1">
									{#if midpointPriceLoading}
										Loading...
									{:else if midpointAsk !== null}
										{#if hasRatio && currentRatio > 0}
											{@const assetSym = (currentApiToken?.symbol ?? currentToken.symbol).replace(
												/^wt/,
												't'
											)}
											{@const wrappedSym = currentApiToken?.symbol ?? currentToken.symbol}
											<div class="leading-tight">
												<div>
													${formatNumeric(midpointAsk / currentRatio)}
													<span class="text-[10px] font-normal text-text-3">/ {assetSym}</span>
												</div>
												<div class="mt-0.5 text-[11px] font-normal text-text-2 sm:text-xs">
													${formatNumeric(midpointAsk)}
													<span class="text-[10px] text-text-3">/ {wrappedSym}</span>
												</div>
											</div>
										{:else}
											${formatNumeric(midpointAsk)}
										{/if}
									{:else}
										—
									{/if}
								</dd>
							</div>
						</dl>
						{#if hasRatio && currentRatio > 0}
							<!-- Wrap-ratio callout — mirrors the chip pattern. The "What's this?"
								 button reuses the WrapExplainerStore so the same modal opens
								 from every entry point. -->
							{@const assetSym = (currentApiToken?.symbol ?? currentToken.symbol).replace(
								/^wt/,
								't'
							)}
							{@const wrappedSym = currentApiToken?.symbol ?? currentToken.symbol}
							<div
								class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-text-2 sm:text-xs"
							>
								<span class="font-mono tabular-nums">
									1 {wrappedSym} = {Number.isInteger(currentRatio)
										? currentRatio
										: currentRatio.toLocaleString('en-US', {
												maximumFractionDigits: 4
											})}
									{assetSym}
								</span>
								<button
									type="button"
									on:click={openWrapExplainer}
									data-testid="wrap-explainer-trigger"
									class="inline-flex items-center gap-1 text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
								>
									What's this?
								</button>
							</div>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-2 sm:gap-3" data-tutorial="buy-sell-buttons">
						<button
							type="button"
							data-testid="open-trade"
							data-side="buy"
							class="rounded-xl bg-emerald-500 px-3 py-3.5 text-sm font-bold text-[#05231a] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-2 focus:ring-offset-surface-1 sm:px-4 sm:text-base"
							on:click={() => openTradePanel('Buy')}
						>
							Buy
						</button>
						<button
							type="button"
							data-testid="open-trade"
							data-side="sell"
							class="rounded-xl bg-red-500 px-3 py-3.5 text-sm font-bold text-[#2a0808] transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-surface-1 sm:px-4 sm:text-base"
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
							class="flex-1 overflow-hidden rounded-2xl border border-line bg-overlay-1 backdrop-blur"
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
						<div class="flex-1 rounded-2xl border border-line bg-overlay-1 backdrop-blur">
							<div
								class="flex h-[280px] items-center justify-center text-sm text-text-2 sm:h-[495px]"
							>
								TradingView data unavailable for this token.
							</div>
						</div>
					{/if}
					<div class="mt-auto flex justify-end sm:mb-[25px]">
						<Button
							variant="secondary"
							size="md"
							className="icon-trigger inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-overlay-1 px-3 py-1.5 text-[12px] font-semibold text-text transition hover:bg-overlay-hover"
							aria-label="Open terminal view"
							on:click={(event) => openChartModal(event)}
						>
							Advanced Chart
							<Icon name="arrowUpRight" className="icon-slide-up h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-4 border-t border-line pt-6 sm:space-y-6">
			<div data-tutorial="dex-activity">
				<div class="mb-4 sm:mb-6">
					<div
						class="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
					>
						<div>
							<h2 class="text-xl font-bold tracking-tight text-text">On-chain Market</h2>
							<p class="hidden text-[13px] text-text-3 sm:block">
								View on-chain trades, liquidity, orders, and vaults
							</p>
						</div>
						<div class="flex items-center gap-2">
							{#if hasRatio}
								<DenomToggle
									value={tableDenom}
									wrappedSymbol={currentApiToken?.symbol ?? currentToken.symbol}
									assetSymbol={(currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't')}
									on:change={handleDenomChange}
								/>
							{/if}
							{#if $isAuthenticated && !isEmbeddedWallet}
								<button
									type="button"
									on:click={() =>
										addTokenToWallet({
											address: currentToken.address,
											symbol: currentToken.symbol,
											decimals: 18,
											image: currentApiToken?.logoUrl
										})}
									class="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs font-medium text-text-2 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-700 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm dark:hover:text-blue-300"
								>
									<!-- Wallet icon (mobile only) -->
									<Icon name="wallet" className="h-4 w-4 sm:hidden" />
									<!-- Plus icon -->
									<Icon name="plus" className="h-3 w-3 sm:h-4 sm:w-4" />
									<span class="sm:hidden">Track</span>
									<span class="hidden sm:inline">Track in Wallet</span>
								</button>
							{/if}
						</div>
					</div>
					<TabNav
						tabs={ONCHAIN_TABS}
						activeId={activeOnchainTab}
						on:change={handleOnchainTabChange}
					/>
				</div>

				<!--
					Fixed height container to prevent layout jumps between tabs.
					PERF-01: TokenMarketCharts pulls lightweight-charts (~150KB);
					lazy-load with a skeleton equal to the container's
					min-height so CLS remains stable when the chunk arrives.
				-->
				<div class="min-h-[320px] sm:min-h-[440px]">
					{#if activeOnchainTab === 'market'}
						{#await import('$lib/components/charts/TokenMarketCharts.svelte')}
							<div class="flex min-h-[320px] items-center justify-center sm:min-h-[440px]">
								<LoadingSpinner size="md" text="Loading market charts…" />
							</div>
						{:then Mod}
							<svelte:component
								this={Mod.default}
								volumeBuckets={tradeVolumeBuckets}
								depth={displayOrderbookDepth}
								ohlcData={displayOhlcData}
								rangeStartMs={historyRangeStartMs}
								rangeEndMs={historyRangeEndMs}
								isLoading={chartsLoading}
								error={tradeQueryError}
								{historyRange}
								historyRangeOptions={HISTORY_RANGE_OPTIONS}
								on:rangeChange={(e) => (historyRange = e.detail.key)}
							/>
							<div class="mt-2 hidden text-xs text-text-2 sm:block">
								All times are displayed in your local timezone{#if hasRatio}
									· prices in USD per {tableDenom === 'unwrapped'
										? (currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't') +
											' (share)'
										: currentApiToken?.symbol ?? currentToken.symbol + ' (wrapped)'}{/if}
							</div>
						{:catch _err}
							<div class="min-h-[320px] p-4 text-sm text-red-400 sm:min-h-[440px]">
								Failed to load market charts. Please reload the page.
							</div>
						{/await}
					{:else if activeOnchainTab === 'orders'}
						<div class="mt-4">
							<OrdersTable
								orders={tokenOrders}
								isLoading={$orderbookQuotesQuery.isLoading}
								isError={$orderbookQuotesQuery.isError}
								errorMessage={$orderbookQuotesQuery.error?.message ?? ''}
								tokenAddress={currentToken?.address ?? null}
								showTokenColumn={false}
								denomination={tableDenom}
								wrapRatio={currentRatio}
							/>
						</div>
					{:else if activeOnchainTab === 'vaults'}
						<div class="mt-4">
							{#if !$isAuthenticated}
								<div class="flex flex-col items-center justify-center gap-4 py-12">
									<p class="text-sm text-text-2">Connect your wallet to view your position</p>
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
									vaults[0]?.token?.decimals ?? currentApiToken?.decimals ?? 18}

								{#if vaults.length === 0 && walletBalance === 0n}
									<div class="py-8 text-center text-sm text-text-2">
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
															vault.raindex,
															vault.id
														)}
														<div
															class="flex items-center justify-between rounded-xl border border-line bg-overlay-1 p-2 text-sm"
														>
															<div class="flex items-center gap-2 text-xs text-text-2">
																<a
																	href={raindexUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
																	title="View on Raindex"
																>
																	{vaultIdHex.slice(0, 8)}...
																</a>
																<span>•</span>
																<span class="font-mono tabular-nums"
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
																		? 'bg-blue-500 text-text'
																		: 'bg-surface-2 text-text-2 hover:bg-surface-2'
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
												<div class="py-8 text-center text-sm text-text-2">
													No vaults with balance found
												</div>
											{/if}
										</div>

										<!-- Right: Summary table -->
										<div class="rounded-2xl border border-line bg-overlay-1 p-4">
											<h3 class="mb-4 text-sm font-semibold text-text-2">Summary</h3>
											<div class="space-y-3 text-sm">
												<div class="flex justify-between text-text-2">
													<span>Vaults Subtotal:</span>
													<span class="font-mono tabular-nums"
														>{Number(formatUnits(totalVaultBalance, tokenDecimals)).toFixed(3)}
														{currentToken?.symbol}</span
													>
												</div>
												<div class="flex justify-between text-text-2">
													<span>Wallet Balance:</span>
													<span class="font-mono tabular-nums"
														>{Number(formatUnits(walletBalance, tokenDecimals)).toFixed(3)}
														{currentToken?.symbol}</span
													>
												</div>
												<div
													class="flex justify-between border-t border-line pt-3 font-semibold text-text-2"
												>
													<span>Total:</span>
													<span class="font-mono tabular-nums"
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
		<div class="mt-8 space-y-4 overflow-x-hidden border-t border-line pt-6 sm:space-y-6">
			<button
				type="button"
				class="flex w-full items-center justify-between sm:cursor-default"
				on:click={() => (isAboutCollapsed = !isAboutCollapsed)}
			>
				<div>
					<h2 class="text-xl font-bold tracking-tight text-text">About</h2>
					<p class="hidden text-[13px] text-text-3 sm:block">
						Learn more about the token or the equity
					</p>
				</div>
				<Icon
					name="chevronDown"
					className="h-5 w-5 text-text-2 transition-transform sm:hidden {!isAboutCollapsed
						? 'rotate-180'
						: ''}"
				/>
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
						<h3 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-3">
							Token Details
						</h3>
						<TabNav tabs={TOKEN_TABS} activeId={activeTokenTab} on:change={handleTokenTabChange} />
					</div>
					{#if activeTokenTab === 'contract'}
						<div>
							{#if hasRatio}
								<WrapRatioCard
									ratio={currentRatio}
									wrappedSymbol={currentApiToken?.symbol ?? currentToken.symbol}
									assetSymbol={(currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't')}
									onLearnMore={openWrapExplainer}
									onViewHistory={() => (activeTokenTab = 'ratio')}
								/>
							{/if}
							<h3 class="mb-3 font-semibold">Contract Information</h3>
							<div class="divide-y divide-line text-sm">
								<div class="flex items-center justify-between gap-2 py-2.5">
									<span class="text-text-2">Wrapped Token</span>
									<div>
										<div class="sm:hidden">
											<ExternalLink
												href="{$currentNetwork.blockExplorer}/token/{currentApiToken?.address ??
													tokenId}"
												label={currentApiToken?.address ?? tokenId}
												truncate={{ start: 0, end: 6 }}
												className="flex items-center gap-1 font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
											/>
										</div>
										<div class="hidden sm:block">
											<ExternalLink
												href="{$currentNetwork.blockExplorer}/token/{currentApiToken?.address ??
													tokenId}"
												label={truncateAddress(currentApiToken?.address ?? tokenId)}
												className="flex items-center gap-1 font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
											/>
										</div>
									</div>
								</div>
								{#if currentApiToken?.unwrappedAddress}
									<div class="flex items-center justify-between gap-2 py-2.5">
										<span class="text-text-2">Underlying Token</span>
										<div>
											<div class="sm:hidden">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentApiToken.unwrappedAddress}"
													label={currentApiToken.unwrappedAddress}
													truncate={{ start: 0, end: 6 }}
													className="flex items-center gap-1 font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												/>
											</div>
											<div class="hidden sm:block">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentApiToken.unwrappedAddress}"
													label={truncateAddress(currentApiToken.unwrappedAddress)}
													className="flex items-center gap-1 font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												/>
											</div>
										</div>
									</div>
								{/if}
								<div class="flex justify-between py-2.5">
									<span class="text-text-2">Network</span>
									<span>{$currentNetwork.displayName}</span>
								</div>
								<div class="flex justify-between py-2.5">
									<span class="text-text-2">Symbol</span>
									<span>{currentApiToken?.symbol ?? currentToken.symbol}</span>
								</div>
								<div class="flex justify-between py-2.5">
									<span class="text-text-2">Decimals</span>
									<span>18</span>
								</div>
								{#if hasRatio}
									<div class="flex justify-between py-2.5">
										<span class="text-text-2">Wrap ratio</span>
										<span class="font-mono tabular-nums"
											>1 {currentApiToken?.symbol ?? currentToken.symbol} ↔ {Number.isInteger(
												currentRatio
											)
												? currentRatio
												: currentRatio.toLocaleString('en-US', {
														maximumFractionDigits: 4
													})}
											{(currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't')}</span
										>
									</div>
								{/if}
								<div class="flex items-center justify-between py-2.5">
									<span class="text-text-2">Proofs</span>
									<a
										href={`/trade/${tokenId}/proofs`}
										class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
									>
										View proofs
									</a>
								</div>
							</div>
						</div>
					{:else if activeTokenTab === 'ratio' && hasRatio}
						<RatioHistoryTab
							wrappedTokenAddress={currentApiToken?.address ?? currentToken.address}
							wrappedSymbol={currentApiToken?.symbol ?? currentToken.symbol}
							assetSymbol={(currentApiToken?.symbol ?? currentToken.symbol).replace(/^wt/, 't')}
							{currentRatio}
							onLearnMore={openWrapExplainer}
						/>
					{:else if activeTokenTab === 'supply'}
						<div>
							<h3 class="mb-3 font-semibold">Supply & Distribution</h3>
							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-text-2">Total Supply</span>
									<span class="font-mono tabular-nums"
										>{formatBaseUnitAmount(
											currentToken.bridgedSupply ?? currentToken.totalShares
										)}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-text-2">Holders</span>
									<span>{currentToken.holderCount ?? 0}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-text-2">Total Transfers</span>
									<span>{currentToken.transferCount ?? 0}</span>
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
									className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
								/>
							</div>
							{#if currentToken?.deposits?.length}
								<div>
									{#each currentToken.deposits.slice(0, 5) as dep}
										<div
											class="border-b border-line px-2 py-3 transition-colors hover:bg-surface-2"
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
											<div class="mt-1 flex items-center gap-2 text-xs text-text-3">
												<span>
													<span class="sm:hidden">…{dep.emitter.address.slice(-6)}</span>
													<span class="hidden sm:inline">
														{truncateAddress(dep.emitter.address)}
													</span>
												</span>
												<span class="text-text-muted">•</span>
												<span>{new Date(Number(dep.timestamp) * 1000).toLocaleString()}</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-sm text-text-2">No recent mints.</div>
							{/if}
						</div>
					{:else}
						<div>
							<div class="mb-2 flex items-center justify-between">
								<h3 class="font-semibold">Latest Burns</h3>
								<ExternalLink
									href="https://portal.s01issuer.com/metrics"
									label="View All"
									className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
								/>
							</div>
							{#if currentToken?.withdraws?.length}
								<div>
									{#each currentToken.withdraws.slice(0, 5) as w}
										<div
											class="border-b border-line px-2 py-3 transition-colors hover:bg-surface-2"
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
											<div class="mt-1 flex items-center gap-2 text-xs text-text-3">
												<span>
													<span class="sm:hidden">…{w.emitter.address.slice(-6)}</span>
													<span class="hidden sm:inline">
														{truncateAddress(w.emitter.address)}
													</span>
												</span>
												<span class="text-text-muted">•</span>
												<span>{new Date(Number(w.timestamp) * 1000).toLocaleString()}</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-sm text-text-2">No recent burns.</div>
							{/if}
						</div>
					{/if}
				</div>
				<!-- Underlying Equity (Right) -->
				<div class="min-w-0 space-y-4">
					<div class="space-y-3">
						<h3 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-3">
							Equity Details
						</h3>
						<TabNav tabs={ASSET_TABS} activeId={activeAssetTab} on:change={handleAssetTabChange} />
					</div>
					{#if activeAssetTab === 'company'}
						{#if tradingViewSymbol}
							<div
								class="hidden overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:block"
							>
								<TradingViewWidget
									widgetType="symbol-profile"
									symbol={tradingViewSymbol}
									height="480"
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:hidden">
								<TradingViewWidget
									widgetType="symbol-profile"
									symbol={tradingViewSymbol}
									height="320"
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-text-2">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if activeAssetTab === 'fundamentals'}
						{#if tradingViewSymbol}
							<div
								class="hidden overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:block"
							>
								<TradingViewWidget
									widgetType="financials"
									symbol={tradingViewSymbol}
									height={520}
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:hidden">
								<TradingViewWidget
									widgetType="financials"
									symbol={tradingViewSymbol}
									height={360}
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-text-2">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if activeAssetTab === 'technical'}
						{#if tradingViewSymbol}
							<div
								class="hidden overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:block"
							>
								<TradingViewWidget
									widgetType="technical-analysis"
									symbol={tradingViewSymbol}
									height="520"
									isTransparent={true}
								/>
							</div>
							<div class="overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:hidden">
								<TradingViewWidget
									widgetType="technical-analysis"
									symbol={tradingViewSymbol}
									height="360"
									isTransparent={true}
								/>
							</div>
						{:else}
							<div class="p-4">
								<p class="text-sm text-text-2">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					{:else if tradingViewSymbol}
						<div
							class="hidden overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:block"
						>
							<TradingViewWidget
								widgetType="timeline"
								symbol={tradingViewSymbol}
								height="600"
								isTransparent={true}
							/>
						</div>
						<div class="overflow-hidden rounded-2xl border border-line bg-overlay-1 sm:hidden">
							<TradingViewWidget
								widgetType="timeline"
								symbol={tradingViewSymbol}
								height="400"
								isTransparent={true}
							/>
						</div>
					{:else}
						<div class="p-4">
							<p class="text-sm text-text-2">TradingView data unavailable for this token.</p>
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
				class="relative h-full w-full border-l-0 border-line bg-gradient-to-b from-surface-1 to-surface-2 shadow-2xl sm:max-w-[22rem] sm:border-l"
				in:fly={{ x: 320, duration: 220 }}
				out:fly={{ x: 320, duration: 180 }}
				role="dialog"
				aria-modal="true"
				aria-label={'Trade ' + tokenDisplayName}
				data-tutorial="trade-panel"
			>
				<div class="flex h-full flex-col">
					<div
						class="flex items-start justify-between border-b border-line px-4 py-4 sm:px-6 sm:py-5"
					>
						<div class="flex items-start gap-2 sm:gap-3">
							{#if currentApiToken?.logoUrl}
								<img
									src={currentApiToken.logoUrl}
									alt={tokenDisplaySymbol || tokenDisplayName}
									class="h-8 w-8 rounded-full border border-line object-cover sm:h-10 sm:w-10"
								/>
							{/if}
							<div>
								<h2 class="text-base font-semibold sm:text-lg">{tokenDisplayName}</h2>
							</div>
						</div>
						<button
							type="button"
							class="rounded-lg p-2 text-text-2 transition hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
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
									data-testid="side-toggle"
									data-side="buy"
									class={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 sm:px-4 sm:py-3 ${
										panelOrderSide === 'Buy'
											? 'bg-green-500 text-text shadow-lg shadow-green-500/30'
											: 'bg-surface-2 text-text-2 hover:bg-surface-2'
									}`}
									on:click={() => (panelOrderSide = 'Buy')}
								>
									Buy
								</button>
								<button
									type="button"
									data-testid="side-toggle"
									data-side="sell"
									class={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 sm:px-4 sm:py-3 ${
										panelOrderSide === 'Sell'
											? 'bg-red-500 text-text shadow-lg shadow-red-500/30'
											: 'bg-surface-2 text-text-2 hover:bg-surface-2'
									}`}
									on:click={() => (panelOrderSide = 'Sell')}
								>
									Sell
								</button>
							</div>
							<div class="space-y-1 sm:space-y-2">
								<div
									class="flex flex-wrap items-center gap-1 text-xs font-medium text-text-2 sm:gap-2 sm:text-sm"
								>
									<span>{panelSummaryVerb} {panelTokenLabel}</span>
									<span class="text-text-3">{panelSummaryPreposition}</span>
									<span class="inline-flex items-center gap-1 text-text-2">
										{settlementTokenSymbol}
										<img
											src={settlementTokenLogo}
											alt={settlementTokenSymbol}
											class="h-3.5 w-3.5 sm:h-4 sm:w-4"
										/>
									</span>
								</div>
								{#if hasRatio}
									<button
										type="button"
										on:click={openWrapExplainer}
										data-testid="wrap-explainer-trigger"
										class="block text-left font-mono text-[11px] tabular-nums text-text-3 transition hover:text-accent hover:underline sm:text-xs"
									>
										1 {panelWrappedSymbol} = {panelRatioCalloutDisplay}
										{panelAssetSymbol}
									</button>
								{/if}
								<div class="flex items-center gap-1 text-xs text-text-2 sm:gap-2 sm:text-sm">
									<span>On</span>
									<img src="/images/BASE.svg" alt="Base" class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
									<span>{$currentNetwork.displayName}</span>
								</div>
								{#if hasRatio}
									<label
										class="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-2 p-2 text-xs text-text-2 sm:text-sm"
									>
										<input
											type="checkbox"
											data-testid="panel-denom-toggle"
											checked={$panelDenom === 'unwrapped'}
											on:change={(e) =>
												panelDenom.set(e.currentTarget.checked ? 'unwrapped' : 'wrapped')}
											class="mt-0.5 h-3.5 w-3.5 rounded border-line-strong bg-transparent text-accent focus:ring-yellow-400/40"
										/>
										<span class="flex-1 leading-snug">
											Show wrapped token quantities in {panelAssetSymbol} equivalents
											<span class="mt-0.5 block text-[10px] text-text-3 sm:text-[11px]">
												You're still trading wrapped tokens — only the displayed quantities and
												prices change.
											</span>
										</span>
									</label>
								{/if}
							</div>
							<!--
								E2E test hooks for mode selection. The Select below is the user-facing
								control; these sr-only buttons let Playwright drive panelStrategy via
								data-testid="mode-tab" without depending on <select> semantics. The
								`sr-only` Tailwind utility hides them from sighted users while keeping
								them in the accessibility tree. Full mode-tab UX retrofit lands in
								Plan 01-03 per CONTEXT D-10.
							-->
							<button
								type="button"
								data-testid="mode-tab"
								data-mode="market"
								class="sr-only"
								tabindex="-1"
								on:click={() => (panelStrategy = 'market')}>Market</button
							>
							<button
								type="button"
								data-testid="mode-tab"
								data-mode="limit"
								class="sr-only"
								tabindex="-1"
								on:click={() => (panelStrategy = 'limit')}>Limit</button
							>
							<button
								type="button"
								data-testid="mode-tab"
								data-mode="dca"
								class="sr-only"
								tabindex="-1"
								on:click={() => (panelStrategy = 'dca')}>DCA</button
							>
							<label class="block space-y-1.5 sm:space-y-2" for={PANEL_STRATEGY_SELECT_ID}>
								<span
									id={PANEL_STRATEGY_LABEL_ID}
									class="block text-xs font-medium text-text-2 sm:text-sm"
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
							<!--
								PERF-01: LimitOrder + DcaOrder lazy-load via {#await import()}.
								Skeleton placeholders use min-h-[420px] to match rendered form
								height ±20px and prevent CLS regression on tab switch
								(Pitfall 5 mitigation; CLS smoke target < 0.1).
								MarketOrder stays eager (default tab, first-paint LCP element).
							-->
							<div class="min-h-[420px]">
								{#if panelStrategy === 'limit'}
									{#await import('$lib/components/orders/LimitOrder.svelte')}
										<div class="flex min-h-[420px] items-center justify-center">
											<LoadingSpinner size="md" text="Loading limit order form…" />
										</div>
									{:then Mod}
										<svelte:component
											this={Mod.default}
											orderSide={panelOrderSide}
											assetToken={currentApiToken}
											currentPrice={panelOrderSide === 'Buy'
												? (midpointAsk ?? midPrice)?.toFixed(4)
												: (midpointBid ?? midPrice)?.toFixed(4)}
											{buyPrice}
											{sellPrice}
											displayDenom={$panelDenom}
											wrapRatio={currentRatio}
										/>
									{:catch _err}
										<div class="min-h-[420px] p-4 text-sm text-red-400">
											Failed to load Limit order form. Please reload the page.
										</div>
									{/await}
								{:else if panelStrategy === 'market'}
									<MarketOrder
										orderSide={panelOrderSide}
										assetToken={currentApiToken}
										{orderbookQuotesQuery}
										{buyPrice}
										{sellPrice}
										displayDenom={$panelDenom}
										wrapRatio={currentRatio}
									/>
								{:else if panelStrategy === 'dca'}
									{#await import('$lib/components/orders/DcaOrder.svelte')}
										<div class="flex min-h-[420px] items-center justify-center">
											<LoadingSpinner size="md" text="Loading DCA order form…" />
										</div>
									{:then Mod}
										<svelte:component
											this={Mod.default}
											orderSide={panelOrderSide}
											assetToken={currentApiToken}
											displayDenom={$panelDenom}
											wrapRatio={currentRatio}
										/>
									{:catch _err}
										<div class="min-h-[420px] p-4 text-sm text-red-400">
											Failed to load DCA order form. Please reload the page.
										</div>
									{/await}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</aside>
		</div>
	{/if}
	<!-- Compact Footer -->
	<footer class="border-t border-line px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
		<div class="mx-auto max-w-5xl">
			<!-- Links Row - fewer on mobile -->
			<div
				class="mb-4 flex flex-wrap items-center justify-center gap-3 text-[10px] text-text-2 sm:mb-6 sm:gap-6 sm:text-sm"
			>
				<a href="/terms" class="transition-colors hover:text-accent">Terms</a>
				<a href="/privacy-policy" class="transition-colors hover:text-accent">Privacy</a>
				<a href="/faqs" class="hidden transition-colors hover:text-accent sm:inline">FAQs</a>
			</div>

			<!-- Social Links -->
			<div class="mb-4 flex items-center justify-center gap-3 sm:mb-6 sm:gap-4">
				<a
					href="mailto:toby@st0x.io"
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-text-2 transition-all hover:bg-yellow-500/20 hover:text-accent"
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
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-text-2 transition-all hover:bg-yellow-500/20 hover:text-accent"
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
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-text-2 transition-all hover:bg-yellow-500/20 hover:text-accent"
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
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-text-2 transition-all hover:bg-yellow-500/20 hover:text-accent"
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
				<p class="mb-4 text-xs text-text-3">
					© {new Date().getFullYear()} SARK X (BVI) Ltd. All rights reserved.
				</p>
				<p class="text-[10px] leading-relaxed text-text-muted sm:text-xs">
					<span class="text-amber-700 dark:text-amber-300">Risk Warning:</span> Trading tokenized assets
					involves substantial risk. Past performance does not guarantee future results.
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
		<div class="relative z-10 flex h-full flex-col bg-surface-1">
			<div class="flex items-center justify-between border-b border-line px-3 py-3 sm:px-6 sm:py-5">
				<div class="min-w-0 flex-1">
					<p class="text-[10px] uppercase tracking-wide text-text-3 sm:text-xs">Advanced Chart</p>
					<h2 class="truncate text-base font-semibold text-text sm:text-xl">{modalTitle}</h2>
				</div>
				<button
					type="button"
					class="ml-2 rounded-lg p-2 text-text-2 transition hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
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
				<div class="h-full w-full rounded-xl border border-line bg-surface-1 p-1 sm:p-2">
					{#if tradingViewSymbol}
						<!--
							PERF-01: TradingViewChart lives inside the chart modal
							(showChartModal=false on first paint). Lazy-load defers the
							TradingView widget bundle until the user opens the modal.
						-->
						{#await import('$lib/components/charts/TradingViewChart.svelte')}
							<div class="flex h-full items-center justify-center">
								<LoadingSpinner size="md" text="Loading TradingView chart…" />
							</div>
						{:then Mod}
							<svelte:component
								this={Mod.default}
								symbol={tradingViewSymbol}
								interval="60"
								theme={$theme}
							/>
						{:catch _err}
							<div class="flex h-full items-center justify-center text-sm text-red-400">
								Failed to load TradingView chart. Please reload the page.
							</div>
						{/await}
					{:else}
						<div class="flex h-full items-center justify-center text-sm text-text-2">
							TradingView data unavailable for this token.
						</div>
					{/if}
				</div>
			</div>
			<div
				class="via-surface-1/80 flex flex-row gap-2 border-t border-line bg-gradient-to-r from-green-500/10 to-red-500/10 px-3 py-3 sm:justify-end sm:gap-3 sm:px-6 sm:py-6"
			>
				<button
					type="button"
					class="flex-1 rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-text shadow-xl shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-surface-1 sm:flex-none sm:rounded-2xl sm:px-8 sm:py-4 sm:text-lg"
					on:click={() => openTradePanel('Buy', { closeTerminal: false })}
				>
					Buy
				</button>
				<button
					type="button"
					class="flex-1 rounded-xl bg-red-500 px-4 py-3 text-base font-semibold text-text shadow-xl shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-surface-1 sm:flex-none sm:rounded-2xl sm:px-8 sm:py-4 sm:text-lg"
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

<!-- Wrap-ratio explainer (opened from chip / Contract-tab card / About).
	 Mounted unconditionally so its internal `show` state survives parent
	 re-renders (singleTokenQuery refetches briefly null currentToken, which
	 would otherwise unmount the modal and reset `show` to false). Props
	 fall back to safe empty strings when currentToken hasn't loaded — the
	 user can't trigger the modal until the chip is visible, so this only
	 matters during the initial-render window. -->
<WrapExplainerModal
	show={$wrapExplainerOpen}
	ratio={currentRatio}
	wrappedSymbol={currentApiToken?.symbol ?? currentToken?.symbol ?? ''}
	assetSymbol={(currentApiToken?.symbol ?? currentToken?.symbol ?? '').replace(/^wt/, 't')}
	equityName={currentToken?.name ?? currentToken?.symbol ?? ''}
	onClose={closeWrapExplainer}
/>
