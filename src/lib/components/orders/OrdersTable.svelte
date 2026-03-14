<script lang="ts">
	import { formatUnits } from 'viem';
	import { currentNetwork } from '$lib/stores';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { parseFloatHex, getRaindexOrderUrl } from '$lib/utils/tokenMath';
	import transactionStore from '$lib/stores/transaction';
	import { type ProcessedQuote, classifyOrderType } from '$lib/utils/orderbook';
	import { createQuery } from '@tanstack/svelte-query';
	import { getLoadBalancedClient } from '$lib/clients/raindex';
	import type { GetOrdersFilters } from '@rainlanguage/orderbook';
	import type { DisplayOrder } from '$lib/types/orders';

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

	// Filter state
	let selectedOrdersFilter: 'my' | 'all' = 'my';
	let selectedOrderTypeFilter: 'all' | 'limit' | 'dca' | 'custom' | 'market' = 'all';
	let selectedDirectionFilter: 'all' | 'Buy' | 'Sell' = 'all';
	let showClosedOrders = false;

	// Pagination
	let currentPage = 1;
	const ITEMS_PER_PAGE = 10;

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
				const client = await getLoadBalancedClient($currentNetwork);
				const filters: GetOrdersFilters = {
					owners: [signer as `0x${string}`],
					active: false
				};
				// Only filter by token if provided
				if (token) {
					const tokenAddr = token as `0x${string}`;
					filters.tokens = { inputs: [tokenAddr], outputs: [tokenAddr] };
				}
				const result = await client.getOrders([network.id], filters, 1);
				if (result.error) {
					console.error('[closedOrdersQuery] Error:', result.error);
					return [];
				}
				return result.value ?? [];
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

				const sgOrderResult = order.convertToSgOrder();
				if (sgOrderResult.error || !sgOrderResult.value) {
					continue;
				}
				const sgOrder = sgOrderResult.value;

				const inputVault = sgOrder.inputs?.[0];
				const outputVault = sgOrder.outputs?.[0];

				// Determine token symbol and address for display
				const inputTokenSymbol = inputVault?.token?.symbol ?? '';
				const outputTokenSymbol = outputVault?.token?.symbol ?? '';
				const inputTokenAddress = inputVault?.token?.address ?? '';
				const outputTokenAddress = outputVault?.token?.address ?? '';

				// Determine side and token info based on token position
				// If order INPUT is the asset, this is a BUY order (order receives the asset)
				// If order OUTPUT is the asset, this is a SELL order (order gives the asset)
				const isBuy = tokenAddress
					? inputVault?.token?.address?.toLowerCase() === tokenAddress.toLowerCase()
					: false;

				const displayTokenSymbol = isBuy ? inputTokenSymbol : outputTokenSymbol;
				const displayTokenAddress = isBuy ? inputTokenAddress : outputTokenAddress;

				// Classify the order type using rainlang
				const orderType = classifyOrderType(order.rainlang) ?? 'custom';
				const displayType = orderType === 'dynamic-spread' ? 'custom' : orderType;

				result.push({
					type: displayType,
					orderHash: order.orderHash,
					timestamp: sgOrder.timestampAdded ? Number(sgOrder.timestampAdded) : 0,
					side: isBuy ? 'Buy' : 'Sell',
					quote: {
						orderHash: order.orderHash,
						orderbookId: order.orderbook,
						inputVaultId: inputVault?.vaultId
							? `0x${BigInt(inputVault.vaultId).toString(16).padStart(64, '0')}`
							: undefined,
						outputVaultId: outputVault?.vaultId
							? `0x${BigInt(outputVault.vaultId).toString(16).padStart(64, '0')}`
							: undefined,
						inputTokenAddress,
						outputTokenAddress,
						inputTokenSymbol,
						outputTokenSymbol,
						sgOrder
					} as ProcessedQuote,
					tokenSymbol: displayTokenSymbol,
					tokenAddress: displayTokenAddress,
					inputTokenSymbol,
					outputTokenSymbol,
					price: undefined,
					isActive: false,
					isFilled: false
				});
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
				class="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-xs font-medium text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
			>
				<option value="my">My Orders</option>
				<option value="all">All Orders</option>
			</select>
		{/if}

		{#if showTypeFilter}
			<select
				bind:value={selectedOrderTypeFilter}
				class="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-xs font-medium text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
			class="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-xs font-medium text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
					class="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
				/>
				<span class="text-xs text-gray-400">Closed</span>
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
		<div class="py-8 text-center text-sm text-gray-400">
			{selectedOrdersFilter === 'my' ? 'No orders yet. Head to the trade page to place your first order.' : 'No orders found'}
		</div>
	{:else}
		<!-- Orders table -->
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b border-white/10">
					<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
						<th class="pb-3 pr-4 font-medium">Type</th>
						<th class="pb-3 pr-4 font-medium">Time</th>
						{#if showTokenColumn}
							<th class="pb-3 pr-4 font-medium">Token</th>
						{/if}
						<th class="pb-3 pr-4 font-medium">Direction</th>
						<th class="pb-3 pr-4 font-medium">Status</th>
						<th class="pb-3 pr-4 font-medium">Amount</th>
						<th class="pb-3 pr-4 font-medium">Price</th>
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
							{@const txHash = trade?.tradeEvent?.transaction?.id || ''}
							<!-- For market orders: outputAmount = asset received (Buy), inputAmount = asset given (Sell) -->
							{@const amount = order.side === 'Buy' ? order.outputAmount : order.inputAmount}
							<tr class="border-b border-white/5 hover:bg-white/5">
								<td class="py-3 pr-4">
									<span
										class="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400"
									>
										Market
									</span>
								</td>
								<td
									class="py-3 pr-4 text-xs text-gray-400"
									title={order.timestamp ? new Date(order.timestamp * 1000).toLocaleString() : ''}
								>
									{formatLocalTime(order.timestamp)}
								</td>
								{#if showTokenColumn}
									<td class="py-3 pr-4 text-gray-300">{order.tokenSymbol}</td>
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
								<td class="py-3 pr-4 text-gray-300">
									{amount ? Number(amount).toFixed(3) : '—'}
									{order.tokenSymbol}
								</td>
								<td class="py-3 pr-4 text-gray-300">
									{order.price !== undefined && Number.isFinite(order.price)
										? order.price.toFixed(3)
										: '—'}
								</td>
								<td class="py-3 pr-4">
									{#if txHash}
										<!-- Desktop: show truncated hash -->
										<a
											href={`${$currentNetwork?.blockExplorer}/tx/${txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="hidden font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline sm:inline"
											title={txHash}
										>
											{txHash.slice(0, 8)}...{txHash.slice(-6)}
										</a>
										<!-- Mobile: show link icon -->
										<a
											href={`${$currentNetwork?.blockExplorer}/tx/${txHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center justify-center text-blue-400 hover:text-blue-300 sm:hidden"
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
									<td class="py-3 text-gray-500">—</td>
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
							{@const currentPrice =
								order.price !== undefined && order.price !== null && Number.isFinite(order.price)
									? order.price.toFixed(3)
									: '—'}
							{@const isMyOrder = orderOwner.toLowerCase() === $walletAddress?.toLowerCase()}
							{@const typeLabel =
								order.type === 'dca' ? 'DCA' : order.type === 'custom' ? 'Custom' : 'Limit'}
							{@const typeClass =
								order.type === 'dca'
									? 'bg-green-500/20 text-green-400'
									: order.type === 'custom'
										? 'bg-brand-gold-500/20 text-brand-gold-400'
										: 'bg-blue-500/20 text-blue-400'}
							<tr class="border-b border-white/5 hover:bg-white/5">
								<td class="py-3 pr-4">
									<span class={`rounded px-2 py-0.5 text-xs font-medium ${typeClass}`}>
										{typeLabel}
									</span>
								</td>
								<td
									class="py-3 pr-4 text-xs text-gray-400"
									title={order.timestamp ? new Date(order.timestamp * 1000).toLocaleString() : ''}
								>
									{formatLocalTime(order.timestamp)}
								</td>
								{#if showTokenColumn}
									<td class="py-3 pr-4 text-gray-300">{order.tokenSymbol}</td>
								{/if}
								<td class="py-3 pr-4">
									<span class={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
										{order.side}
									</span>
								</td>
								<td class="py-3 pr-4">
									{#if isFilled && isActive}
										<span
											class="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400"
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
										<span
											class="rounded bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-400"
										>
											Closed
										</span>
									{/if}
								</td>
								<td class="py-3 pr-4 text-gray-300">
									{remainingAmount}
									{order.tokenSymbol}
								</td>
								<td class="py-3 pr-4 text-gray-300">{currentPrice}</td>
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
											class="hidden font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline sm:inline"
											title={quote.orderHash}
										>
											{quote.orderHash.slice(0, 8)}...{quote.orderHash.slice(-6)}
										</a>
										<!-- Mobile: show link icon -->
										<a
											href={raindexUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center justify-center text-blue-400 hover:text-blue-300 sm:hidden"
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
								? 'bg-blue-500 text-white'
								: 'bg-white/5 text-gray-400 hover:bg-white/10'
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
