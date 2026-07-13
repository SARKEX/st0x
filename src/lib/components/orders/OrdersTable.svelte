<script lang="ts">
	import { formatUnits } from 'viem';
	import { AbiCoder } from 'ethers';
	import { currentNetwork } from '$lib/stores';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { normalizeAddress, parseFloatHex, getRaindexOrderUrl } from '$lib/utils/tokenMath';
	import transactionStore from '$lib/stores/transaction';
	import {
		type ProcessedQuote,
		OrderV4_ABI,
		normalizeOrderData,
		type OrderType
	} from '$lib/utils/orderbook';
	import { createQuery } from '@tanstack/svelte-query';
	import type { OrderV4, SgOrder } from '@rainlanguage/orderbook';
	import type { DisplayOrder } from '$lib/types/orders';
	import { apiGetOrdersByOwner, type ApiOrderSummary } from '$lib/api/st0xApi';
	import { TOKENS, type Network } from '$lib/config/network';
	import {
		displayAmount as denomDisplayAmount,
		displayPrice as denomDisplayPrice,
		displaySymbol as denomDisplaySymbol
	} from '$lib/utils/wrapDenom';

	// Props
	export let orders: DisplayOrder[] = [];
	export let isLoading = false;
	export let isError = false;
	export let errorMessage = '';

	// Filter options
	export let showOwnerFilter = true;
	export let showTypeFilter = true;
	export let showClosedOrdersOption = true;
	export let showTokenColumn = true;

	// For fetching closed orders (only needed when showClosedOrdersOption is true)
	export let tokenAddress: string | null = null;

	// Denomination — when set to 'unwrapped' the table re-labels and re-scales
	// the per-token size, filled, and price columns to the underlying t* asset
	// (= wt amount × ratio). Defaults to 'wrapped' so existing callers (e.g.
	// the dashboard) keep their current behavior. The price column is treated
	// as USD per wt*, so the unwrapped equivalent is `price / ratio`.
	export let denomination: 'wrapped' | 'unwrapped' = 'wrapped';
	export let wrapRatio: number = 1;
	/** Override for the underlying symbol display when denomination='unwrapped'.
	 *  Leave undefined to derive from `order.tokenSymbol` by stripping the `wt`
	 *  prefix (wtCOIN → tCOIN). */
	export let unwrappedSymbolOverride: string | undefined = undefined;

	// Declared as reactive `$:` so the function identity changes whenever
	// `denomination` or `wrapRatio` changes. Svelte 4 tracks template-expression
	// dependencies by the variables it can see in the expression — `denomination`
	// is hidden inside the function body and therefore invisible to the static
	// analyzer, so a plain `function displayAmount(x)` declaration would render
	// stale values when the toggle flips (the table header would update because
	// it reads `denomination` directly, but the cell values would not). Rebinding
	// the function on each toggle forces every `displayAmount(...)` /
	// `displayPrice(...)` / `displaySymbol(...)` call site to re-run.
	$: displaySymbol = (tokenSymbol: string): string =>
		denomDisplaySymbol(tokenSymbol, denomination, unwrappedSymbolOverride);
	$: displayAmount = (amount: number | null | undefined): number | null =>
		denomDisplayAmount(amount, denomination, wrapRatio);
	$: displayPrice = (price: number | null | undefined): number | null =>
		denomDisplayPrice(price, denomination, wrapRatio);

	// Filter state
	let selectedOrdersFilter: 'my' | 'all' = 'my';
	let selectedOrderTypeFilter: 'all' | 'limit' | 'dca' | 'custom' | 'market' = 'all';
	let selectedDirectionFilter: 'all' | 'Buy' | 'Sell' = 'all';
	let showClosedOrders = false;

	// Pagination
	let currentPage = 1;
	const ITEMS_PER_PAGE = 10;
	const CLOSED_ORDERS_PAGE_SIZE = 50;
	const MAX_CLOSED_ORDER_PAGES = 100;

	// Reset pagination when filter changes
	$: if (selectedOrdersFilter || selectedOrderTypeFilter || selectedDirectionFilter) {
		currentPage = 1;
	}

	// Reset closed orders checkbox when switching to "All Orders"
	$: if (selectedOrdersFilter === 'all') {
		showClosedOrders = false;
	}

	// Update selected filter when connection changes
	$: if (!$isAuthenticated && selectedOrdersFilter === 'my') {
		selectedOrdersFilter = 'all';
	}

	function orderInvolvesToken(order: ApiOrderSummary, token: string | null): boolean {
		if (!token) return true;
		const normalizedToken = normalizeAddress(token);
		const normalizedInput = normalizeAddress(order.inputToken.address);
		const normalizedOutput = normalizeAddress(order.outputToken.address);
		return Boolean(
			normalizedToken &&
				(normalizedInput === normalizedToken || normalizedOutput === normalizedToken)
		);
	}

	function orderMatchesNetwork(
		order: ApiOrderSummary,
		network: Network | null | undefined
	): boolean {
		return network ? order.chainId === network.chainId : false;
	}

	function findIoIndexByToken<T extends { token: string }>(
		items: T[] | undefined,
		token: string
	): number {
		const normalizedToken = normalizeAddress(token);
		if (!items || !normalizedToken) return -1;
		return items.findIndex((item) => normalizeAddress(item.token) === normalizedToken);
	}

	function vaultIdToHex(vaultId: unknown): string | undefined {
		if (typeof vaultId === 'string') {
			if (vaultId.startsWith('0x') && vaultId.length === 66) return vaultId;
			try {
				return `0x${BigInt(vaultId).toString(16).padStart(64, '0')}`;
			} catch {
				return undefined;
			}
		}
		if (typeof vaultId === 'bigint') {
			return `0x${vaultId.toString(16).padStart(64, '0')}`;
		}
		return undefined;
	}

	function decodeOrderData(order: ApiOrderSummary): OrderV4 | undefined {
		if (!order.orderBytes) return undefined;
		try {
			const decoded = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], order.orderBytes);
			return normalizeOrderData(decoded[0] as OrderV4);
		} catch (error) {
			console.warn(`[OrdersTable] Failed to decode orderBytes for ${order.orderHash}:`, error);
			return undefined;
		}
	}

	function resolveAssetAddress(order: ApiOrderSummary, token: string | null): string | null {
		if (token && orderInvolvesToken(order, token)) return normalizeAddress(token);

		const normalizedInput = normalizeAddress(order.inputToken.address);
		const normalizedOutput = normalizeAddress(order.outputToken.address);
		// This predicate already matches across all TOKENS entries (chain- and ST0x-category-
		// filtered) and returns the matched entry's own address; getTokenByAnyAddress would instead
		// return the canonical wrapped address, which would flip the downstream isBuy comparison.
		// DRIFT-01 remediation of this callsite (making asset/isBuy resolution variant-aware) is
		// tracked separately.
		// eslint-disable-next-line no-restricted-syntax -- justification: see comment above
		const st0xToken = TOKENS.find((configuredToken) => {
			if (
				configuredToken.chainId !== $currentNetwork?.chainId ||
				configuredToken.category !== 'ST0x'
			) {
				return false;
			}
			const configuredAddress = normalizeAddress(configuredToken.address);
			return configuredAddress === normalizedInput || configuredAddress === normalizedOutput;
		});
		return st0xToken ? normalizeAddress(st0xToken.address) : normalizedOutput;
	}

	function apiOrderToClosedDisplayOrder(
		order: ApiOrderSummary,
		token: string | null
	): DisplayOrder | null {
		const orderData = decodeOrderData(order);
		const inputIdx = findIoIndexByToken(orderData?.validInputs, order.inputToken.address);
		const outputIdx = findIoIndexByToken(orderData?.validOutputs, order.outputToken.address);
		const inputVault = inputIdx >= 0 ? orderData?.validInputs?.[inputIdx] : undefined;
		const outputVault = outputIdx >= 0 ? orderData?.validOutputs?.[outputIdx] : undefined;
		const inputVaultId = vaultIdToHex(inputVault?.vaultId);
		const outputVaultId = vaultIdToHex(outputVault?.vaultId);

		const inputTokenAddress = order.inputToken.address;
		const outputTokenAddress = order.outputToken.address;
		const assetAddress = resolveAssetAddress(order, token);
		const isBuy = Boolean(
			assetAddress && normalizeAddress(inputTokenAddress) === normalizeAddress(assetAddress)
		);
		const displayToken = isBuy ? order.inputToken : order.outputToken;
		const displayType: Exclude<OrderType, 'dynamic-spread'> =
			order.orderType === 'dynamic-spread' ? 'custom' : order.orderType;

		const sgOrder = {
			orderHash: order.orderHash,
			owner: order.owner,
			active: order.active,
			orderbook: { id: order.orderbookId },
			orderBytes: order.orderBytes
		} as SgOrder;

		const quote: ProcessedQuote = {
			orderHash: order.orderHash,
			maxOutput: '',
			ratio: '',
			inputTokenSymbol: order.inputToken.symbol,
			outputTokenSymbol: order.outputToken.symbol,
			inputTokenAddress,
			outputTokenAddress,
			inputIOIndex: inputIdx >= 0 ? inputIdx : 0,
			outputIOIndex: outputIdx >= 0 ? outputIdx : 0,
			inputVaultId,
			outputVaultId,
			orderData,
			sgOrder,
			orderbookId: order.orderbookId,
			inputTokenDecimals: order.inputToken.decimals,
			outputTokenDecimals: order.outputToken.decimals,
			orderType: order.orderType
		};

		return {
			type: displayType,
			orderHash: order.orderHash,
			timestamp: order.removedAt ?? order.createdAt ?? 0,
			side: isBuy ? 'Buy' : 'Sell',
			quote,
			tokenSymbol: displayToken.symbol,
			tokenAddress: displayToken.address,
			inputTokenSymbol: order.inputToken.symbol,
			outputTokenSymbol: order.outputToken.symbol,
			price: undefined,
			isActive: order.active,
			isFilled: false
		};
	}

	// Helper function to create the closed orders query
	function createClosedOrdersQuery(
		network: typeof $currentNetwork,
		signer: typeof $walletAddress,
		token: string | null,
		enabled: boolean
	) {
		return createQuery({
			queryKey: ['closedOrders', network?.id, signer, token, enabled],
			enabled: Boolean(enabled && network && signer),
			staleTime: 60_000,
			queryFn: async () => {
				// Double-check enabled state (Tanstack Query should prevent this, but be safe)
				if (!enabled || !network || !signer) {
					return [];
				}
				const orders: ApiOrderSummary[] = [];
				let page = 1;
				let hasMore = true;
				while (hasMore && page <= MAX_CLOSED_ORDER_PAGES) {
					const result = await apiGetOrdersByOwner(signer, {
						page,
						pageSize: CLOSED_ORDERS_PAGE_SIZE,
						state: 'inactive'
					});
					orders.push(
						...result.orders.filter(
							(order) => orderMatchesNetwork(order, network) && orderInvolvesToken(order, token)
						)
					);
					hasMore = result.pagination.hasMore;
					page++;
				}
				if (hasMore) {
					console.warn(`[closedOrdersQuery] Hit pagination cap (${MAX_CLOSED_ORDER_PAGES} pages)`);
				}
				return orders;
			}
		});
	}

	// Reactive query that tracks all dependencies including the checkbox state
	$: shouldFetchClosedOrders = showClosedOrders && showClosedOrdersOption;
	$: closedOrdersQuery = createClosedOrdersQuery(
		$currentNetwork,
		$walletAddress,
		tokenAddress,
		shouldFetchClosedOrders
	);

	// Filter and combine orders
	$: filteredOrders = (() => {
		let result = [...orders];

		// Filter by owner if "My Orders" is selected
		if (selectedOrdersFilter === 'my' && $walletAddress) {
			const myAddress = $walletAddress.toLowerCase();
			result = result.filter((o) => {
				// For limit orders, check quote owner
				if (o.quote?.sgOrder?.owner) {
					return o.quote.sgOrder.owner.toLowerCase() === myAddress;
				}
				// Market orders are already filtered by sender in the parent
				return o.type === 'market';
			});
		}

		// Add closed orders if checkbox is checked
		if (showClosedOrders && selectedOrdersFilter === 'my' && $closedOrdersQuery.data) {
			const existingHashes = new Set(result.map((o) => o.orderHash.toLowerCase()));
			for (const order of $closedOrdersQuery.data) {
				if (existingHashes.has(order.orderHash.toLowerCase())) {
					continue;
				}

				const closedOrder = apiOrderToClosedDisplayOrder(order, tokenAddress);
				if (!closedOrder) {
					continue;
				}
				result.push(closedOrder);
			}
		}

		// Apply type filter
		if (selectedOrderTypeFilter !== 'all') {
			result = result.filter((order) => order.type === selectedOrderTypeFilter);
		}

		// Apply direction filter
		if (selectedDirectionFilter !== 'all') {
			result = result.filter((order) => order.side === selectedDirectionFilter);
		}

		// Sort by timestamp descending
		result.sort((a, b) => b.timestamp - a.timestamp);

		return result;
	})();

	// Pagination
	$: paginatedOrders = filteredOrders.slice(
		(currentPage - 1) * ITEMS_PER_PAGE,
		currentPage * ITEMS_PER_PAGE
	);
	$: totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

	// Format timestamp to local time (short format: MM/DD HH:MM)
	function formatLocalTime(timestamp: number): string {
		if (!timestamp || timestamp === 0) return '—';
		// Convert from seconds to milliseconds if needed
		const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
		const date = new Date(ms);
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${month}/${day} ${hours}:${minutes}`;
	}
</script>

<div>
	<!-- Filter controls - dropdowns in a row -->
	<div class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
		{#if showOwnerFilter}
			<select
				bind:value={selectedOrdersFilter}
				disabled={!$isAuthenticated && selectedOrdersFilter === 'my'}
				class="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs font-medium text-text-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
			>
				<option value="my">My Orders</option>
				<option value="all">All Orders</option>
			</select>
		{/if}

		{#if showTypeFilter}
			<select
				bind:value={selectedOrderTypeFilter}
				class="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs font-medium text-text-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
			>
				<option value="all">All Types</option>
				<option value="limit">Limit</option>
				<option value="dca">DCA</option>
				<option value="market">Market</option>
				<option value="custom">Custom</option>
			</select>
		{/if}

		<select
			bind:value={selectedDirectionFilter}
			class="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs font-medium text-text-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
		>
			<option value="all">All Directions</option>
			<option value="Buy">Buy</option>
			<option value="Sell">Sell</option>
		</select>

		{#if showClosedOrdersOption && selectedOrdersFilter === 'my' && $isAuthenticated}
			<label class="flex cursor-pointer items-center gap-1.5">
				<input
					type="checkbox"
					bind:checked={showClosedOrders}
					class="h-3.5 w-3.5 rounded border-line bg-surface-3 text-blue-600 focus:ring-blue-500 focus:ring-offset-surface-1 dark:text-blue-500"
				/>
				<span class="text-xs text-text-2">Closed</span>
				{#if showClosedOrders && $closedOrdersQuery.isLoading}
					<LoadingSpinner variant="inline" size="sm" />
				{/if}
			</label>
		{/if}
	</div>

	<!-- Content -->
	{#if isLoading}
		<div class="flex justify-center py-8">
			<LoadingSpinner variant="inline" size="md" text="Loading orders..." />
		</div>
	{:else if isError}
		<div class="py-8 text-center text-sm text-red-400">
			Error loading orders: {errorMessage}
		</div>
	{:else if filteredOrders.length === 0}
		<div class="py-8 text-center text-sm text-text-2">
			{selectedOrdersFilter === 'my' ? 'You have no orders' : 'No orders found'}
		</div>
	{:else}
		<!-- Orders table -->
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b border-line">
					<tr class="text-left text-xs uppercase tracking-wide text-text-2">
						<th class="pb-3 pr-4 font-medium">Type</th>
						<th class="pb-3 pr-4 font-medium">Time</th>
						{#if showTokenColumn}
							<th class="pb-3 pr-4 font-medium">Token</th>
						{/if}
						<th class="pb-3 pr-4 font-medium">Direction</th>
						<th class="pb-3 pr-4 font-medium">Status</th>
						<th class="pb-3 pr-4 font-medium">
							Remaining
							{#if denomination === 'unwrapped'}
								<span class="ml-1 normal-case text-text-3">(shares)</span>
							{/if}
						</th>
						<th class="pb-3 pr-4 font-medium">
							Filled
							{#if denomination === 'unwrapped'}
								<span class="ml-1 normal-case text-text-3">(shares)</span>
							{/if}
						</th>
						<th class="pb-3 pr-4 font-medium">
							Price
							{#if denomination === 'unwrapped'}
								<span class="ml-1 normal-case text-text-3">/ share</span>
							{:else if wrapRatio !== 1}
								<span class="ml-1 normal-case text-text-3">/ token</span>
							{/if}
						</th>
						<th class="pb-3 pr-4 font-medium">
							<span class="hidden sm:inline">Hash</span>
							<span class="sm:hidden">Link</span>
						</th>
						{#if selectedOrdersFilter === 'my'}
							<th class="pb-3 font-medium">Actions</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each paginatedOrders as order}
						{#if order.type === 'market'}
							<!-- Market Order Row -->
							{@const trade = order.trade}
							{@const txHash = order.txHash || trade?.tradeEvent?.transaction?.id || ''}
							<!-- For market orders: outputAmount = asset received (Buy), inputAmount = asset given (Sell) -->
							{@const amount = order.side === 'Buy' ? order.outputAmount : order.inputAmount}
							<tr class="border-b border-line hover:bg-surface-2">
								<td class="py-3 pr-4">
									<span
										class="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400"
									>
										Market
									</span>
								</td>
								<td
									class="py-3 pr-4 text-xs text-text-2"
									title={order.timestamp ? new Date(order.timestamp * 1000).toLocaleString() : ''}
								>
									{formatLocalTime(order.timestamp)}
								</td>
								{#if showTokenColumn}
									<td class="py-3 pr-4 text-text-2">{order.tokenSymbol}</td>
								{/if}
								<td class="py-3 pr-4">
									<span
										class={`text-xs font-medium ${
											order.side === 'Buy' ? 'text-green-400' : 'text-red-400'
										}`}
									>
										{order.side}
									</span>
								</td>
								<td class="py-3 pr-4">
									<span
										class="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400"
									>
										Executed
									</span>
								</td>
								<td class="py-3 pr-4 text-text-2">—</td>
								<td class="py-3 pr-4 text-text-2">
									{#if amount}
										{@const converted = displayAmount(Number(amount))}
										{converted != null ? converted.toFixed(3) : '—'}
									{:else}
										—
									{/if}
									{displaySymbol(order.tokenSymbol)}
								</td>
								<td class="py-3 pr-4 text-text-2">
									{#if order.price !== undefined && Number.isFinite(order.price)}
										{@const px = displayPrice(order.price)}
										{px != null ? px.toFixed(3) : '—'}
									{:else}
										—
									{/if}
								</td>
								<td class="py-3 pr-4">
									{#if txHash}
										<!-- Desktop: show truncated hash -->
										<a
											href={`${$currentNetwork?.blockExplorer}/tx/${txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="hidden font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline sm:inline dark:text-blue-400 dark:hover:text-blue-300"
											title={txHash}
										>
											{txHash.slice(0, 8)}...{txHash.slice(-6)}
										</a>
										<!-- Mobile: show link icon -->
										<a
											href={`${$currentNetwork?.blockExplorer}/tx/${txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center justify-center text-blue-600 hover:text-blue-700 sm:hidden dark:text-blue-400 dark:hover:text-blue-300"
											title="View transaction"
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
									{:else}
										—
									{/if}
								</td>
								{#if selectedOrdersFilter === 'my'}
									<td class="py-3 text-text-3">—</td>
								{/if}
							</tr>
						{:else}
							<!-- Limit/DCA/Custom Order Row -->
							{@const quote = order.quote}
							{@const isBuy = order.side === 'Buy'}
							{@const maxOutputBigInt = quote?.maxOutput
								? parseFloatHex(
										quote.maxOutput,
										isBuy ? quote.inputTokenDecimals || 18 : quote.outputTokenDecimals || 18
									)
								: 0n}
							{@const tokenDecimals = quote
								? isBuy
									? quote.inputTokenDecimals || 18
									: quote.outputTokenDecimals || 18
								: 18}
							{@const orderOwner = quote?.sgOrder?.owner || ''}
							{@const orderbookId = quote?.orderbookId || ''}
							{@const isActive = order.isActive ?? quote?.sgOrder?.active ?? true}
							{@const isFilled = order.isFilled ?? maxOutputBigInt === 0n}
							{@const remainingAmount = !isActive
								? 'n/a'
								: isFilled
									? '0'
									: maxOutputBigInt > 0n
										? Number(formatUnits(maxOutputBigInt, tokenDecimals)).toFixed(3)
										: '—'}
							{@const isMyOrder = orderOwner.toLowerCase() === $walletAddress?.toLowerCase()}
							{@const typeLabel =
								order.type === 'dca' ? 'DCA' : order.type === 'custom' ? 'Custom' : 'Limit'}
							{@const typeClass =
								order.type === 'dca'
									? 'bg-green-500/20 text-green-400'
									: order.type === 'custom'
										? 'bg-yellow-500/20 text-accent'
										: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'}
							<tr class="border-b border-line hover:bg-surface-2">
								<td class="py-3 pr-4">
									<span class={`rounded px-2 py-0.5 text-xs font-medium ${typeClass}`}>
										{typeLabel}
									</span>
								</td>
								<td
									class="py-3 pr-4 text-xs text-text-2"
									title={order.timestamp ? new Date(order.timestamp * 1000).toLocaleString() : ''}
								>
									{formatLocalTime(order.timestamp)}
								</td>
								{#if showTokenColumn}
									<td class="py-3 pr-4 text-text-2">{order.tokenSymbol}</td>
								{/if}
								<td class="py-3 pr-4">
									<span class={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
										{order.side}
									</span>
								</td>
								<td class="py-3 pr-4">
									{#if isFilled && isActive}
										<span
											class="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
										>
											Filled
										</span>
									{:else if isActive}
										<span
											class="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400"
										>
											Active
										</span>
									{:else}
										<span class="rounded bg-overlay-2 px-2 py-0.5 text-xs font-medium text-text-2">
											Closed
										</span>
									{/if}
								</td>
								<td class="py-3 pr-4 text-text-2">
									{#if remainingAmount === '—' || remainingAmount === 'n/a' || remainingAmount === '0'}
										{remainingAmount}
									{:else}
										{@const conv = displayAmount(Number(remainingAmount))}
										{conv != null ? conv.toFixed(3) : remainingAmount}
									{/if}
									{displaySymbol(order.tokenSymbol)}
								</td>
								<td class="py-3 pr-4 text-text-2">
									{#if order.filled !== undefined && order.filled > 0}
										{@const conv = displayAmount(order.filled)}
										{(conv ?? order.filled).toFixed(3)}
										{displaySymbol(order.filledSymbol ?? order.tokenSymbol)}
									{:else}
										—
									{/if}
								</td>
								<td class="py-3 pr-4 text-text-2">
									{#if order.price !== undefined && order.price !== null && Number.isFinite(order.price)}
										{@const px = displayPrice(order.price)}
										{px != null ? px.toFixed(3) : '—'}
									{:else}
										—
									{/if}
								</td>
								<td class="py-3 pr-4">
									{#if quote}
										{@const raindexUrl = getRaindexOrderUrl(
											$currentNetwork?.id ?? 0,
											orderbookId,
											quote.orderHash
										)}
										<!-- Desktop: show truncated hash -->
										<a
											href={raindexUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="hidden font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline sm:inline dark:text-blue-400 dark:hover:text-blue-300"
											title={quote.orderHash}
										>
											{quote.orderHash.slice(0, 8)}...{quote.orderHash.slice(-6)}
										</a>
										<!-- Mobile: show link icon -->
										<a
											href={raindexUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center justify-center text-blue-600 hover:text-blue-700 sm:hidden dark:text-blue-400 dark:hover:text-blue-300"
											title="View on Raindex"
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
									{:else}
										—
									{/if}
								</td>
								{#if selectedOrdersFilter === 'my'}
									<td class="py-3">
										{#if isMyOrder && quote}
											{#if isFilled && isActive}
												<!-- Filled order: show Withdraw button that deactivates + withdraws from input vault -->
												<Button
													variant="secondary"
													size="sm"
													on:click={() =>
														transactionStore.handleWithdrawFromOrder({
															...quote,
															isFilled: true
														})}
												>
													Withdraw
												</Button>
											{:else if isActive}
												<!-- Active but not filled: just show Cancel button -->
												<Button
													variant="danger"
													size="sm"
													on:click={() => transactionStore.handleRemoveOrder(quote)}
												>
													Cancel
												</Button>
											{:else}
												<!-- Closed order: withdraw from both vaults -->
												<Button
													variant="secondary"
													size="sm"
													on:click={() =>
														transactionStore.handleWithdrawFromOrder({
															...quote,
															isFilled: false
														})}
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
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination controls -->
		{#if totalPages > 1}
			<div class="mt-4 flex items-center justify-center gap-2">
				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum}
					<button
						type="button"
						class={`h-8 w-8 rounded-md text-sm font-medium transition ${
							pageNum === currentPage
								? 'bg-blue-500 text-text'
								: 'bg-surface-2 text-text-2 hover:bg-surface-2'
						}`}
						on:click={() => {
							currentPage = pageNum;
						}}
					>
						{pageNum}
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>
