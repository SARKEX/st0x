<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { currentNetwork, sfts, oracleQuotes } from '$lib/stores';
	import { formatUnits } from 'viem';
	import { TOKENS } from '$lib/config/network';
	import Footer from '$lib/components/Footer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import LimitOrder from '$lib/components/orders/LimitOrder.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import TradingViewChart from '$lib/components/charts/TradingViewChart.svelte';
	import TradingViewWidget from '$lib/components/charts/TradingViewWidget.svelte';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { containerStyles } from '$lib/styles/utils';
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
		VolumeBucket
	} from '$lib/components/charts/token-chart-types';
	import MarketOrder from '$lib/components/orders/MarketOrder.svelte';
	import DcaOrder from '$lib/components/orders/DcaOrder.svelte';
	import { extractBaseSymbol } from '$lib/utils/tradingViewSymbols';
	import {
		analyzeTrade,
		createTokenLookup,
		normalizeAddress,
		parseFloatHex,
		ratioToNumber,
		toDecimal
	} from '$lib/utils/tokenMath';
	import type { OracleQuote } from '$lib/queries/oracleQuotes';
	type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';
	import { createOrderbookQuotesQuery, type OrderbookQuoteCache } from '$lib/queries/orderbook';
	import type { QueryObserverResult } from '@tanstack/query-core';
	import { createTradeActivityQuery } from '$lib/queries/tradeActivity';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
	import { createRaindexClient } from '$lib/clients/raindex';
	import { signerAddress, connected, web3Modal, wagmiConfig } from 'svelte-wagmi';
	import type { SgVault, RaindexVault, RaindexOrder } from '@rainlanguage/orderbook';
	import transactionStore from '$lib/stores/transaction';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	$: tokenId = $page.params.id;
	$: currentToken = $sfts?.find((sft: OffchainAssetReceiptVault) => sft.id === tokenId);
	const tokensLookup = createTokenLookup(TOKENS);
	let orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork);
	let tradeActivityQuery = createTradeActivityQuery($currentNetwork);
	let oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	$: {
		console.log('🌐 [Trade Page] Current network:', $currentNetwork?.id, $currentNetwork?.name);
		orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork);
		tradeActivityQuery = createTradeActivityQuery($currentNetwork);
		oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	}

	// Use orderbook quotes for orders instead of separate query
	// Filter quotes by current token and owner
	$: tokenOrders = (() => {
		if (!currentToken?.address || !$orderbookQuotesQuery.data?.quotes) {
			return [];
		}
		const quotes = $orderbookQuotesQuery.data.quotes;
		const tokenAddress = currentToken.address.toLowerCase();

		// Filter by token (input or output matches current token)
		let filtered = quotes.filter(q =>
			q.inputTokenAddress.toLowerCase() === tokenAddress ||
			q.outputTokenAddress.toLowerCase() === tokenAddress
		);

		// Filter by owner if "My Orders" is selected
		if (selectedOrdersFilter === 'my' && $signerAddress) {
			const myAddress = $signerAddress.toLowerCase();
			filtered = filtered.filter(q =>
				q.sgOrder?.owner?.toLowerCase() === myAddress
			);
		}

		// Debug: Check if quotePerAsset is set
		console.log('🔍 DEBUG tokenOrders:', filtered.map(q => ({
			orderHash: q.orderHash,
			quotePerAsset: q.quotePerAsset,
			side: q.side,
			ratio: q.ratio,
			inputToken: q.inputTokenSymbol,
			outputToken: q.outputTokenSymbol
		})));

		return filtered;
	})();

	// Paginate the filtered orders
	$: paginatedOrders = (() => {
		const startIndex = (currentOrdersPage - 1) * 10;
		const endIndex = startIndex + 10;
		return tokenOrders.slice(startIndex, endIndex);
	})();

	$: totalOrderPages = Math.ceil(tokenOrders.length / 10);

	// Vaults query - shared with dashboard
	$: tokenVaultsQuery = createInfiniteQuery({
		queryKey: ['vaults', $currentNetwork?.id, $signerAddress],
		initialPageParam: 0,
		staleTime: 300000, // 5 minutes (override global Infinity)
		refetchOnMount: true, // Refresh when visiting tab
		refetchInterval: 300000, // Poll every 5 minutes
		queryFn: async ({ pageParam }: { pageParam: number }) => {
			if (!$currentNetwork || !$signerAddress) {
				console.log('🔍 Vaults query skipped - missing params:', {
					hasNetwork: !!$currentNetwork,
					hasSigner: !!$signerAddress
				});
				return { vaults: [], hasMore: false };
			}
			console.log('🔍 Fetching vaults with params:', {
				networkId: $currentNetwork.id,
				owner: $signerAddress.toLowerCase(),
				pageParam
			});
			const client = await createRaindexClient();

			// Fetch all vaults (shared query with dashboard)
			const vaultsResult = await client.getVaults(
				[$currentNetwork.id],
				{
					owners: [$signerAddress.toLowerCase() as `0x${string}`],
					hideZeroBalance: false
				},
				pageParam + 1
			);
			if (vaultsResult.error) {
				console.error('🔍 Vaults query error:', vaultsResult.error);
				throw new Error(vaultsResult.error.readableMsg);
			}

			// Access .items like the dashboard does
			const vaultsArray: RaindexVault[] = vaultsResult.value.items || [];

			console.log('🔍 Vaults query result:', {
				totalVaultsCount: vaultsArray.length,
				vaults: vaultsArray.map(v => ({ token: v.token.address, symbol: v.token.symbol }))
			});
			return {
				vaults: vaultsArray,
				hasMore: vaultsArray.length === 1000
			};
		},
		getNextPageParam: (lastPage: { vaults: RaindexVault[]; hasMore: boolean }, pages) => {
			return lastPage.hasMore ? pages.length : undefined;
		},
		enabled: activeOnchainTab === 'vaults' && Boolean($currentNetwork && $signerAddress)
	});

	// Wallet balance query for this token
	$: walletBalanceQuery = createQuery({
		queryKey: ['walletBalance', $currentNetwork?.id, currentToken?.address, $signerAddress],
		queryFn: async () => {
			if (!currentToken?.address || !$signerAddress || !$wagmiConfig) {
				return 0n;
			}
			const balance = await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: currentToken.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$signerAddress as `0x${string}`]
			});
			return balance as bigint;
		},
		enabled: activeOnchainTab === 'vaults' && Boolean(currentToken?.address && $signerAddress && $wagmiConfig)
	});
	$: currentPythToken = TOKENS.find(
		(token) =>
			token.address.toLowerCase() === currentToken?.address.toLowerCase() &&
			token.chainId === $currentNetwork?.chainId
	);
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

	// Orders filter: 'my' for user's orders, 'all' for all orders
	// Default to 'my' if wallet is connected, otherwise 'all'
	$: ordersFilter = $connected ? 'my' : 'all';
	let selectedOrdersFilter: 'my' | 'all' = 'my';

	// Update selected filter when connection changes
	$: if (!$connected && selectedOrdersFilter === 'my') {
		selectedOrdersFilter = 'all';
	}

	// Pagination state
	let currentOrdersPage = 1;
	let currentVaultsPage = 1;

	// Reset pagination when filter changes
	$: if (selectedOrdersFilter) {
		currentOrdersPage = 1;
	}

	function handleOnchainTabChange(event: CustomEvent<{ id: string }>) {
		activeOnchainTab = event.detail.id as OnchainTabId;
	}

	// Helper to safely access RaindexOrder properties (incomplete types in SDK)
	function getOrderInput(order: RaindexOrder, tokenAddress: string) {
		const inputs = (order as any).inputs;
		console.log('🔍 getOrderInput - inputs:', inputs, 'tokenAddress:', tokenAddress);
		if (!inputs || !Array.isArray(inputs)) return null;
		return inputs.find(
			(i: any) => i.token?.address?.toLowerCase() === tokenAddress.toLowerCase()
		);
	}

	function getOrderOutput(order: RaindexOrder, tokenAddress: string) {
		const outputs = (order as any).outputs;
		console.log('🔍 getOrderOutput - outputs:', outputs, 'tokenAddress:', tokenAddress);
		if (!outputs || !Array.isArray(outputs)) return null;
		return outputs.find(
			(o: any) => o.token?.address?.toLowerCase() === tokenAddress.toLowerCase()
		);
	}

	function getOrderType(order: RaindexOrder): string {
		return (order as any).orderType || 'Order';
	}

	function getOrderTimestamp(order: RaindexOrder): number | null {
		return (order as any).timestampAdded || (order as any).timestamp || null;
	}

	function vaultBalanceToBigInt(vault: RaindexVault): bigint {
		const fixedResult = vault.balance.toFixedDecimalLossy(vault.token.decimals);
		if (fixedResult.error || !fixedResult.value) return 0n;
		const value = (fixedResult.value as any).value;
		return typeof value === 'string' ? BigInt(value) : 0n;
	}

	function getOrderAmount(order: RaindexOrder, tokenAddress: string): { total: bigint; remaining: bigint } {
		const input = getOrderInput(order, tokenAddress);
		const output = getOrderOutput(order, tokenAddress);

		console.log('🔍 getOrderAmount DEBUG:', {
			orderHash: order.orderHash,
			tokenAddress,
			input: input ? { vault: input.vault, token: input.token } : null,
			output: output ? { vault: output.vault, token: output.token } : null,
			fullOrder: order
		});

		if (input) {
			// For input (buy orders), check input vault
			const remaining = input?.vault?.balance || 0n;
			return { total: remaining, remaining };
		} else if (output) {
			// For output (sell orders), check output vault
			const remaining = output?.vault?.balance || 0n;
			// Try to get initial balance from order metadata
			const initialBalance = (output.vault as any)?.initialBalance || (order as any).initialOutputVaultBalance;
			const total = initialBalance || remaining;
			return { total, remaining };
		}

		return { total: 0n, remaining: 0n };
	}

	let infoCollapsed = false;
	let showTradePanel = false;
	let panelOrderSide: 'Buy' | 'Sell' = 'Buy';
	let panelStrategy: 'limit' | 'dca' | 'market' = 'market';
	let panelOpenedFromTerminal = false;
	const PANEL_STRATEGY_OPTIONS: Array<'limit' | 'dca' | 'market'> = ['limit', 'dca', 'market'];
	const PANEL_STRATEGY_SELECT_ID = 'panel-strategy-select';
	const PANEL_STRATEGY_LABEL_ID = 'panel-strategy-label';
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
	const tradesToAveragePrices = (trades: TradeHistoryPoint[], bucketSeconds: number) => {
		if (trades.length === 0) return [];
		const buckets = new Map<number, TradeHistoryPoint[]>();
		for (const trade of trades) {
			const bucketTime = Math.floor(trade.timestamp / 1000 / bucketSeconds) * bucketSeconds * 1000;
			if (!buckets.has(bucketTime)) {
				buckets.set(bucketTime, []);
			}
			buckets.get(bucketTime)!.push(trade);
		}
		const pricePoints: Array<{ x: number; y: number }> = [];
		const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
		for (const [time, bucketTrades] of sortedBuckets) {
			if (bucketTrades.length === 0) continue;
			const prices = bucketTrades.map((t) => t.price).filter((p) => Number.isFinite(p));
			if (prices.length === 0) continue;
			const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
			pricePoints.push({
				x: time,
				y: avgPrice
			});
		}
		return pricePoints;
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
	let averagePrices: Array<{ x: number; y: number }> = [];
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
		console.log(
			'🔄 [Trade Page] orderbookQuotesQuery state:',
			$orderbookQuotesQuery?.status,
			'data:',
			$orderbookQuotesQuery?.data
		);
		orderbookQuoteUiState = mapOrderbookQuoteState($orderbookQuotesQuery);
		console.log('📊 [Trade Page] orderbookQuoteUiState:', orderbookQuoteUiState);
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
		if (typeof window !== 'undefined') {
			const isMobile = window.innerWidth < 640;
			infoCollapsed = isMobile;
		}
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
				const assetAddress = currentToken.address?.toLowerCase();
				const quoteAddress = settlementToken.address?.toLowerCase();
				let bestBid: number | null = null;
				let bestAsk: number | null = null;
				quotes.forEach((quote) => {
					const ratioValue = ratioToNumber(quote.ratio);
					const ratio = ratioValue ?? 0;
					if (!Number.isFinite(ratio) || ratio <= 0) return;
					const inputAddress = quote.inputTokenAddress.toLowerCase();
					const outputAddress = quote.outputTokenAddress.toLowerCase();
					// ASK: quote token -> asset (what you pay when buying)
					if (inputAddress === quoteAddress && outputAddress === assetAddress) {
						const tokenAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
						const price = ratio;
						if (tokenAmount !== null && Number.isFinite(price) && tokenAmount > 0 && price > 0) {
							bestAsk = bestAsk === null ? price : Math.min(bestAsk, price);
						}
					}
					// BID: asset -> quote token (what you get when selling)
					if (inputAddress === assetAddress && outputAddress === quoteAddress) {
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
		const assetAddress = currentToken.address?.toLowerCase();
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
		const trades = ($tradeActivityQuery?.data?.trades ?? []) as SgTrade[];
		return trades
			.map((trade) =>
				tradeToPoint(trade, assetAddress, assetDecimals, {
					address: quoteAddress,
					decimals: quoteDecimals,
					symbol: settlementToken.symbol || ''
				})
			)
			.filter(
				(point): point is TradeHistoryPoint =>
					point !== null && point.timestamp >= cutoff && point.timestamp <= rangeEnd
			)
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
		// Calculate average prices and volume using the same candlestick bucket size
		averagePrices = tradesToAveragePrices(visibleTradeHistoryPoints, candleBucketSeconds);
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
		const assetAddress = currentToken.address?.toLowerCase();
		const quoteAddress = settlementToken.address?.toLowerCase();
		if (!assetAddress || !quoteAddress) {
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

			// ASK: quote token -> asset (buying the asset)
			if (inputAddress === quoteAddress && outputAddress === assetAddress) {
				const tokenAmount = toDecimal(quote.maxOutput, 0, { absolute: true });
				const price = ratio;
				if (tokenAmount === null || !Number.isFinite(price) || tokenAmount <= 0 || price <= 0) {
					return;
				}
				asks.push({ price, quantity: tokenAmount });
				return;
			}

			// BID: asset -> quote token (selling the asset)
			if (inputAddress === assetAddress && outputAddress === quoteAddress) {
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
		? `Terminal View — ${tokenDisplayName} (${tokenDisplaySymbol})`
		: `Terminal View — ${tokenDisplayName}`;
	$: panelTokenLabel = tokenDisplaySymbol || currentToken?.symbol || tokenDisplayName;
	$: panelSummaryVerb = panelOrderSide === 'Buy' ? 'Buying' : 'Selling';
	$: panelSummaryPreposition = panelOrderSide === 'Buy' ? 'with' : 'for';
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>
<svelte:window on:keydown={handleGlobalKeydown} />
{#if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else}
	<div class="space-y-6 p-4 sm:p-6">
		<div class="flex flex-col gap-1 text-left sm:flex-row sm:items-baseline sm:gap-3">
			<h1 class="text-2xl font-bold">
				Trade {tokenDisplayName}
				{#if tokenDisplaySymbol}
					<span class="ml-2 text-lg font-normal text-gray-400">({tokenDisplaySymbol})</span>
				{/if}
			</h1>
		</div>
		<!-- Header Section with Chart -->
		<Section>
			<div class="grid grid-cols-1 gap-6 xl:grid-cols-5">
				<!-- Left: Symbol info -->
				<div class="space-y-4 xl:col-span-2">
					<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
						<div class="border-b border-white/10 bg-gray-900/60 px-4 py-3">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-xs uppercase tracking-wide text-gray-400">Off-chain Reference</p>
									<p class="mt-1 text-base font-semibold text-gray-200">{tokenDisplayName}</p>
								</div>
								{#if tradingViewSymbol}
									<span class="text-sm text-gray-400">{tradingViewSymbol}</span>
								{/if}
							</div>
						</div>
						{#if tradingViewSymbol}
							<TradingViewWidget widgetType="symbol-info" symbol={tradingViewSymbol} height="420" />
						{:else}
							<div class="flex h-48 items-center justify-center px-4 py-6 text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						{/if}
					</div>
					<div class={containerStyles.cardBordered}>
						<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
							<div>
								<dt class="text-xs uppercase tracking-wide text-gray-500">Oracle Price</dt>
								<dd class="mt-1 font-medium text-gray-100">
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
								<dt class="text-xs uppercase tracking-wide text-gray-500">Confidence</dt>
								<dd class="mt-1 font-medium text-gray-100">
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
								<dt class="text-xs uppercase tracking-wide text-gray-500">Bid Price</dt>
								<dd class="mt-1 font-medium text-gray-100">
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
								<dt class="text-xs uppercase tracking-wide text-gray-500">Offer Price</dt>
								<dd class="mt-1 font-medium text-gray-100">
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
							<p class="mt-4 text-xs text-red-400">{oracleError}</p>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							class="rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900"
							on:click={() => openTradePanel('Buy')}
						>
							Buy
						</button>
						<button
							type="button"
							class="rounded-xl bg-red-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900"
							on:click={() => openTradePanel('Sell')}
						>
							Sell
						</button>
					</div>
				</div>
				<!-- Right: Overview and chart -->
				<div class="flex h-full flex-col gap-4 xl:col-span-3">
					{#if tradingViewSymbol}
						<div class={`${containerStyles.cardBordered} flex-1 overflow-hidden p-0`}>
							<TradingViewWidget
								widgetType="symbol-overview"
								symbol={tradingViewSymbol}
								displayName={currentToken.name || currentToken.symbol}
								dateRange="1D"
								showVolume={false}
								autosize={false}
								height="485"
							/>
						</div>
					{:else}
						<div class={`${containerStyles.cardBordered} flex-1`}>
							<div class="flex h-[495px] items-center justify-center text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						</div>
					{/if}
					<div class="mb-[25px] mt-auto flex justify-end">
						<Button
							variant="secondary"
							size="md"
							className="w-full rounded-xl border border-yellow-400/40 bg-yellow-500/20 px-4 py-3 text-base font-semibold text-yellow-300 shadow-lg shadow-yellow-500/30 transition hover:border-yellow-300 hover:bg-yellow-500/30 hover:text-white sm:w-auto"
							aria-label="Open terminal view"
							on:click={(event) => openChartModal(event)}
						>
							Terminal View
						</Button>
					</div>
				</div>
			</div>
		</Section>
		<Section>
			<div class="mb-6">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
					<div>
						<h2 class="text-base font-semibold text-white">On-chain Activity</h2>
						<p class="text-sm text-gray-400">
							Visualize recent trades, liquidity, orders, and vaults
						</p>
					</div>
				</div>
				<TabNav tabs={ONCHAIN_TABS} activeId={activeOnchainTab} on:change={handleOnchainTabChange} />
			</div>

			{#if activeOnchainTab === 'market'}
				<TokenMarketCharts
					volumeBuckets={tradeVolumeBuckets}
					depth={orderbookDepth}
					{averagePrices}
					rangeStartMs={historyRangeStartMs}
					rangeEndMs={historyRangeEndMs}
					isLoading={chartsLoading}
					error={tradeQueryError}
					{historyRange}
					historyRangeOptions={HISTORY_RANGE_OPTIONS}
					on:rangeChange={(e) => (historyRange = e.detail.key)}
				/>
				<div class="mt-2 text-xs text-gray-400">All times are displayed in your local timezone</div>

			{:else if activeOnchainTab === 'orders'}
				<div class="mt-4">
					<!-- Filter toggle -->
					<div class="mb-4 flex items-center gap-2">
						<span class="text-sm text-gray-400">Show:</span>
						<div class="flex gap-2">
							<button
								type="button"
								class={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
									selectedOrdersFilter === 'my'
										? 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
										: 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
								} ${!$connected ? 'opacity-50 cursor-not-allowed' : ''}`}
								disabled={!$connected}
								on:click={() => { selectedOrdersFilter = 'my' }}
							>
								My Orders
							</button>
							<button
								type="button"
								class={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
									selectedOrdersFilter === 'all'
										? 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
										: 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
								}`}
								on:click={() => { selectedOrdersFilter = 'all' }}
							>
								All Orders
							</button>
						</div>
					</div>

					{#if $orderbookQuotesQuery.isLoading}
						<div class="flex justify-center py-8">
							<LoadingSpinner variant="inline" size="md" text="Loading orders..." />
						</div>
					{:else if $orderbookQuotesQuery.isError}
						<div class="py-8 text-center text-sm text-red-400">
							Error loading orders: {$orderbookQuotesQuery.error?.message}
						</div>
					{:else if tokenOrders.length === 0}
						<div class="py-8 text-center text-sm text-gray-400">
							{selectedOrdersFilter === 'my' ? 'You have no orders for this token' : 'No orders found for this token'}
						</div>
					{:else}
						<!-- Orders table -->
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead class="border-b border-white/10">
									<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
										<th class="pb-3 pr-4 font-medium">Type</th>
										<th class="pb-3 pr-4 font-medium">Status</th>
										<th class="pb-3 pr-4 font-medium">Remaining</th>
										<th class="pb-3 pr-4 font-medium">Current Price</th>
										<th class="pb-3 pr-4 font-medium">Order Hash</th>
										<th class="pb-3 pr-4 font-medium">Wallet</th>
										{#if selectedOrdersFilter === 'my'}
											<th class="pb-3 font-medium">Actions</th>
										{/if}
									</tr>
								</thead>
								<tbody>
									{#each paginatedOrders as quote}
										{@const tokenAddress = currentToken?.address.toLowerCase()}
										{@const isBuy = quote.inputTokenAddress.toLowerCase() === tokenAddress}
										{@const maxOutputBigInt = parseFloatHex(quote.maxOutput, isBuy ? quote.inputTokenDecimals || 18 : quote.outputTokenDecimals || 18)}
										{@const tokenSymbol = isBuy ? quote.inputTokenSymbol : quote.outputTokenSymbol}
										{@const tokenDecimals = isBuy ? (quote.inputTokenDecimals || 18) : (quote.outputTokenDecimals || 18)}
										{@const orderOwner = quote.sgOrder?.owner || ''}
										{@const orderbookId = quote.orderbookId || ''}
										{@const remainingAmount = maxOutputBigInt > 0n ? Number(formatUnits(maxOutputBigInt, tokenDecimals)).toFixed(3) : '—'}
										{@const currentPrice = (quote.quotePerAsset !== undefined && quote.quotePerAsset !== null && Number.isFinite(quote.quotePerAsset)) ? quote.quotePerAsset.toFixed(3) : `DEBUG: ${quote.quotePerAsset}`}
										{@const isMyOrder = orderOwner.toLowerCase() === $signerAddress?.toLowerCase()}
										{@const isActive = quote.sgOrder?.active ?? true}
										<tr class="border-b border-white/5 hover:bg-white/5">
											<td class="py-3 pr-4">
												<span class={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
													{isBuy ? 'Buy' : 'Sell'}
												</span>
											</td>
											<td class="py-3 pr-4">
												{#if isActive}
													<span class="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
														Active
													</span>
												{:else}
													<span class="rounded bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-400">
														Closed
													</span>
												{/if}
											</td>
											<td class="py-3 pr-4 text-gray-300">
												{remainingAmount} {tokenSymbol}
											</td>
											<td class="py-3 pr-4 text-gray-300">
												{currentPrice}
											</td>
											<td class="py-3 pr-4">
												<a
													href={`https://sdk.raindex.finance/v5/#/${$currentNetwork?.raindexNetworkSlug}/orderbook/${orderbookId}/order/${quote.orderHash}`}
													target="_blank"
													rel="noopener noreferrer"
													class="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
													title={quote.orderHash}
												>
													{quote.orderHash.slice(0, 8)}...{quote.orderHash.slice(-6)}
												</a>
											</td>
											<td class="py-3 pr-4">
												{#if orderOwner}
													<a
														href={`${$currentNetwork?.blockExplorer}/address/${orderOwner}`}
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
														title={orderOwner}
													>
														{orderOwner.slice(0, 6)}...{orderOwner.slice(-4)}
													</a>
												{:else}
													—
												{/if}
											</td>
											{#if selectedOrdersFilter === 'my'}
												<td class="py-3">
													{#if isMyOrder}
														{#if isActive}
															<Button
																variant="danger"
																size="sm"
																on:click={() => transactionStore.handleRemoveOrder(quote)}
															>
																Cancel
															</Button>
														{:else}
															<Button
																variant="secondary"
																size="sm"
																on:click={() => transactionStore.handleWithdrawFromOrder(quote)}
															>
																Withdraw
															</Button>
														{/if}
													{:else}
														—
													{/if}
												</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<!-- Pagination controls -->
						{#if totalOrderPages > 1}
							<div class="mt-4 flex items-center justify-center gap-2">
								{#each Array.from({ length: totalOrderPages }, (_, i) => i + 1) as pageNum}
									<button
										type="button"
										class={`h-8 w-8 rounded-md text-sm font-medium transition ${
											pageNum === currentOrdersPage
												? 'bg-blue-500 text-white'
												: 'bg-white/5 text-gray-400 hover:bg-white/10'
										}`}
										on:click={() => {
											currentOrdersPage = pageNum;
										}}
									>
										{pageNum}
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				</div>

			{:else if activeOnchainTab === 'vaults'}
				<div class="mt-4">
					{#if !$connected}
						<div class="flex flex-col items-center justify-center gap-4 py-12">
							<p class="text-sm text-gray-400">Connect your wallet to view your position</p>
							<Button
								variant="primary"
								size="md"
								on:click={() => $web3Modal.open()}
							>
								Connect Wallet
							</Button>
						</div>
					{:else if $tokenVaultsQuery.isLoading}
						<div class="flex justify-center py-8">
							<LoadingSpinner variant="inline" size="md" text="Loading vaults..." />
						</div>
					{:else if $tokenVaultsQuery.isError}
						<div class="py-8 text-center text-sm text-red-400">
							Error loading vaults: {$tokenVaultsQuery.error?.message}
						</div>
					{:else}
						{@const allVaults = $tokenVaultsQuery.data?.pages?.flatMap((p) => p.vaults) ?? []}
						{@const _ = console.log('🔍 DEBUG vault filtering:', {
							currentTokenAddress: currentToken?.address,
							allVaultsCount: allVaults.length,
							allVaultTokens: allVaults.map(v => ({
								address: v.token?.address,
								symbol: v.token?.symbol
							}))
						})}
						{@const vaults = currentToken ? allVaults.filter(v => {
							const isCorrectToken = v.token?.address?.toLowerCase() === currentToken.address.toLowerCase();
							const hasBalance = vaultBalanceToBigInt(v) > 0n;
							return isCorrectToken && hasBalance;
						}) : []}
						{@const __ = console.log('🔍 DEBUG filtered vaults:', vaults.length)}
						{@const totalVaultBalance = vaults.reduce((sum, v) => sum + vaultBalanceToBigInt(v), 0n)}
						{@const walletBalance = $walletBalanceQuery.data ?? 0n}
						{@const totalBalance = totalVaultBalance + walletBalance}
						{@const tokenDecimals = vaults[0]?.token?.decimals ?? currentPythToken?.decimals ?? 18}

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
											{#each paginatedVaults as vault, vaultIndex}
												{@const balance = vaultBalanceToBigInt(vault)}
												{@const vaultIdHex = vault.vaultId.toString(16).padStart(64, '0')}
												{@const raindexUrl = `https://v5.raindex.finance/vaults/0x${vaultIdHex}`}
												<div class="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-2 text-sm">
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
														<span>{Number(formatUnits(balance, vault.token.decimals)).toFixed(3)} {vault.token.symbol}</span>
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
											<span>{Number(formatUnits(totalVaultBalance, tokenDecimals)).toFixed(3)} {currentToken?.symbol}</span>
										</div>
										<div class="flex justify-between text-gray-400">
											<span>Wallet Balance:</span>
											<span>{Number(formatUnits(walletBalance, tokenDecimals)).toFixed(3)} {currentToken?.symbol}</span>
										</div>
										<div class="flex justify-between border-t border-white/10 pt-3 font-semibold text-gray-100">
											<span>Total:</span>
											<span>{Number(formatUnits(totalBalance, tokenDecimals)).toFixed(3)} {currentToken?.symbol}</span>
										</div>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</Section>
		<!-- Tabbed Information Section (collapsible) -->
		<Section>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold">Details</h2>
				<button
					class="rounded-md border border-white/10 p-1 text-xs text-gray-200 hover:bg-white/5"
					aria-label={infoCollapsed ? 'Expand details' : 'Collapse details'}
					on:click={() => (infoCollapsed = !infoCollapsed)}
				>
					<svg
						class="h-4 w-4 transition-transform duration-200 ease-out {infoCollapsed
							? ''
							: 'rotate-180'}"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
			</div>
			{#if !infoCollapsed}
				<div class="grid gap-6 lg:grid-cols-2">
					<div class="space-y-4">
						<div class="space-y-3">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
								Asset Details
							</h3>
							<TabNav
								tabs={ASSET_TABS}
								activeId={activeAssetTab}
								on:change={handleAssetTabChange}
							/>
						</div>
						{#if activeAssetTab === 'company'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewWidget
										widgetType="symbol-profile"
										symbol={tradingViewSymbol}
										height="480"
									/>
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if activeAssetTab === 'fundamentals'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewWidget
										widgetType="financials"
										symbol={tradingViewSymbol}
										height={520}
									/>
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if activeAssetTab === 'technical'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewWidget
										widgetType="technical-analysis"
										symbol={tradingViewSymbol}
										height="520"
									/>
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if tradingViewSymbol}
							<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
								<TradingViewWidget widgetType="timeline" symbol={tradingViewSymbol} height="600" />
							</div>
						{:else}
							<div class={`${containerStyles.cardBordered}`}>
								<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					</div>
					<div class="space-y-4">
						<div class="space-y-3">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
								Token Details
							</h3>
							<TabNav
								tabs={TOKEN_TABS}
								activeId={activeTokenTab}
								on:change={handleTokenTabChange}
							/>
						</div>
						{#if activeTokenTab === 'contract'}
							<div class={containerStyles.cardBordered}>
								<h3 class="mb-3 font-semibold">Contract Information</h3>
								<div class="space-y-3 text-sm">
									<div class="flex items-center justify-between gap-2">
										<span class="text-gray-400">Address</span>
										<div>
											<div class="sm:hidden">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
													label={currentToken.address}
													truncate={{ start: 0, end: 6 }}
													className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
												/>
											</div>
											<div class="hidden sm:block">
												<ExternalLink
													href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
													label={truncateAddress(currentToken.address)}
													className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
												/>
											</div>
										</div>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Network</span>
										<span>{$currentNetwork.displayName}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Symbol</span>
										<span>{currentToken.symbol}</span>
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
							<div class={containerStyles.cardBordered}>
								<h3 class="mb-3 font-semibold">Supply & Distribution</h3>
								<div class="space-y-3 text-sm">
									<div class="flex justify-between">
										<span class="text-gray-400">Total Supply</span>
										<span>{formatUnits(BigInt(currentToken.totalShares), 18)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">On-Chain Market Cap</span>
										<span>N/A</span>
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
							<div class={containerStyles.cardBordered}>
								<div class="mb-2 flex items-center justify-between">
									<h3 class="font-semibold">Latest Mints</h3>
									<ExternalLink
										href="https://portal.s01issuer.com/metrics"
										label="View All"
										className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
									/>
								</div>
								{#if currentToken?.deposits?.length}
									<div class="space-y-1">
										{#each currentToken.deposits.slice(0, 5) as dep}
											<div class="rounded border border-white/10 bg-gray-800/40 px-3 py-2">
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
												<div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
													<span class="text-gray-400">
														<span class="sm:hidden">…{dep.emitter.address.slice(-6)}</span>
														<span class="hidden sm:inline">
															{dep.emitter.address.slice(0, 6)}...{dep.emitter.address.slice(-4)}
														</span>
													</span>
													<span class="mx-2 text-gray-500">•</span>
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
							<div class={containerStyles.cardBordered}>
								<div class="mb-2 flex items-center justify-between">
									<h3 class="font-semibold">Latest Burns</h3>
									<ExternalLink
										href="https://portal.s01issuer.com/metrics"
										label="View All"
										className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
									/>
								</div>
								{#if currentToken?.withdraws?.length}
									<div class="space-y-1">
										{#each currentToken.withdraws.slice(0, 5) as w}
											<div class="rounded border border-white/10 bg-gray-800/40 px-3 py-2">
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
												<div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
													<span class="text-gray-400">
														<span class="sm:hidden">…{w.emitter.address.slice(-6)}</span>
														<span class="hidden sm:inline">
															{w.emitter.address.slice(0, 6)}...{w.emitter.address.slice(-4)}
														</span>
													</span>
													<span class="mx-2 text-gray-500">•</span>
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
				</div>
			{/if}
		</Section>
	</div>
	{#if showTradePanel}
		<div class="fixed inset-0 z-[2100] flex">
			<button type="button" class="flex-1" aria-label="Close trade panel" on:click={closeTradePanel}
			></button>
			<aside
				class="relative h-full w-full max-w-[20rem] border-l border-white/10 bg-gradient-to-b from-gray-950 to-gray-900 shadow-2xl"
				in:fly={{ x: 320, duration: 220 }}
				out:fly={{ x: 320, duration: 180 }}
				role="dialog"
				aria-modal="true"
				aria-label={'Trade ' + tokenDisplayName}
			>
				<div class="flex h-full flex-col">
					<div class="flex items-start justify-between border-b border-white/10 px-6 py-5">
						<div class="flex items-start gap-3">
							{#if currentPythToken?.logoUrl}
								<img
									src={currentPythToken.logoUrl}
									alt={tokenDisplaySymbol || tokenDisplayName}
									class="h-10 w-10 rounded-full border border-white/10 object-cover"
								/>
							{/if}
							<div>
								<h2 class="text-lg font-semibold text-white">{tokenDisplayName}</h2>
								{#if tokenDisplaySymbol}
									<p class="text-sm text-gray-400">{tokenDisplaySymbol}</p>
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
					<div class="flex-1 overflow-y-auto px-6 py-6">
						<div class="space-y-6 pb-10">
							<div class="grid grid-cols-2 gap-3" aria-label="Select order side">
								<button
									type="button"
									class={`rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 ${
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
									class={`rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 ${
										panelOrderSide === 'Sell'
											? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
											: 'bg-white/5 text-gray-200 hover:bg-white/10'
									}`}
									on:click={() => (panelOrderSide = 'Sell')}
								>
									Sell
								</button>
							</div>
							<div class="space-y-2">
								<div class="flex items-center gap-2 text-sm font-medium text-gray-300">
									<span>{panelSummaryVerb} {panelTokenLabel}</span>
									<span class="text-gray-500">{panelSummaryPreposition}</span>
									<span class="inline-flex items-center gap-1 text-gray-200">
										{settlementTokenSymbol}
										<img src={settlementTokenLogo} alt={settlementTokenSymbol} class="h-4 w-4" />
									</span>
								</div>
								<div class="flex items-center gap-2 text-sm text-gray-400">
									<span>On</span>
									<img src="/images/BASE.svg" alt="Base" class="h-4 w-4" />
									<span>{$currentNetwork.displayName}</span>
								</div>
							</div>
							<label class="block space-y-2" for={PANEL_STRATEGY_SELECT_ID}>
								<span id={PANEL_STRATEGY_LABEL_ID} class="block text-sm font-medium text-gray-300">
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
										{buyPrice}
										{sellPrice}
									/>
								{:else if panelStrategy === 'market'}
									<MarketOrder orderSide={panelOrderSide} assetToken={currentPythToken} />
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
	<Footer />
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
			<div class="flex items-center justify-between border-b border-white/10 px-6 py-5">
				<div>
					<p class="text-xs uppercase tracking-wide text-gray-500">Terminal View</p>
					<h2 class="text-xl font-semibold text-white">{modalTitle}</h2>
				</div>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
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
			<div class="flex-1 overflow-hidden px-6 pb-6 pt-4">
				<div class="h-full w-full rounded-xl border border-white/10 bg-gray-900 p-2">
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
				class="flex flex-col gap-3 border-t border-white/10 bg-gradient-to-r from-green-500/10 via-gray-900/80 to-red-500/10 px-6 py-6 sm:flex-row sm:justify-end"
			>
				<button
					type="button"
					class="w-full rounded-2xl bg-green-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:w-auto"
					on:click={() => openTradePanel('Buy', { closeTerminal: false })}
				>
					Buy
				</button>
				<button
					type="button"
					class="w-full rounded-2xl bg-red-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:w-auto"
					on:click={() => openTradePanel('Sell', { closeTerminal: false })}
				>
					Sell
				</button>
			</div>
		</div>
	</div>
{/if}
