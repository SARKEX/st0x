<script>
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import DcaStrategy from '$lib/components/orders/DcaStrategy.svelte';
	import { STOXs, USDC_TOKEN } from '$lib/network';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';

	const ORDER_TYPES = [
		{ id: 'limit', name: 'Limit Orders' },
		{ id: 'dca', name: 'DCA' },
		{ id: 'activeliquidity', name: 'Active Liquidity' },
		{ id: 'portfolio', name: 'Portfolio' },
		{ id: 'history', name: 'Order History' }
	];

	// Token options
	// const TOKENS = STOXs.push({
	// 	name: USDC_TOKEN.name || '',
	// 	symbol: USDC_TOKEN.symbol || '',
	// 	address: USDC_TOKEN.address
	// });

	

	// Mock Order History Data
	// const ORDER_HISTORY = [
	// 	{
	// 		id: 1,
	// 		type: 'Limit',
	// 		side: 'Buy',
	// 		pair: 'AAPL/USDC',
	// 		amount: '1,000 USDC',
	// 		price: '150.25',
	// 		filled: '100%',
	// 		status: 'Completed',
	// 		date: '2025-06-03 14:30:22'
	// 	},
	// 	{
	// 		id: 2,
	// 		type: 'DCA',
	// 		side: 'Accumulate',
	// 		pair: 'NVDA/USDC',
	// 		amount: '500 USDC',
	// 		price: 'Market',
	// 		filled: '25%',
	// 		status: 'Active',
	// 		date: '2025-06-02 09:15:33'
	// 	},
	// 	{
	// 		id: 3,
	// 		type: 'Limit',
	// 		side: 'Sell',
	// 		pair: 'TSLA/USDC',
	// 		amount: '50 TSLA',
	// 		price: '245.50',
	// 		filled: '0%',
	// 		status: 'Cancelled',
	// 		date: '2025-06-01 16:45:12'
	// 	},
	// 	{
	// 		id: 4,
	// 		type: 'Liquidity',
	// 		side: 'Deploy',
	// 		pair: 'ETH/USDC',
	// 		amount: '1000 USDC',
	// 		price: 'Dynamic',
	// 		filled: '100%',
	// 		status: 'Active',
	// 		date: '2025-05-30 11:20:44'
	// 	}
	// ];

	// Reactive variables
	let activeOrderType = 'dca';

	// Form states
	// let limitOrderState = {
	// 	isAdvanced: false,
	// 	baseToken: '',
	// 	quoteToken: 'USDC'
	// };

	let dcaOrderState = {
		isAdvanced: false,
		baseToken: '',
		quoteToken: 'USDC'
	};

	// let liquidityOrderState = {
	// 	isAdvanced: false,
	// 	token1: '',
	// 	token2: ''
	// };

	// let portfolioOrderState = {
	// 	isAdvanced: false,
	// 	selectedTokens: ['USDC']
	// };

	// let historyState = {
	// 	filter: 'all',
	// 	sortBy: 'date'
	// };

	// Computed values
	// $: filteredOrders = ORDER_HISTORY.filter((order) => {
	// 	if (historyState.filter === 'all') return true;
	// 	if (historyState.filter === 'active') return order.status === 'Active';
	// 	if (historyState.filter === 'completed') return order.status === 'Completed';
	// 	if (historyState.filter === 'cancelled') return order.status === 'Cancelled';
	// 	return order.type.toLowerCase() === historyState.filter;
	// });

	// function toggleToken(token) {
	// 	if (portfolioOrderState.selectedTokens.includes(token)) {
	// 		portfolioOrderState.selectedTokens = portfolioOrderState.selectedTokens.filter(
	// 			(t) => t !== token
	// 		);
	// 	} else {
	// 		portfolioOrderState.selectedTokens = [...portfolioOrderState.selectedTokens, token];
	// 	}
	// }

	// function getStatusColor(status) {
	// 	switch (status) {
	// 		case 'Completed':
	// 			return 'text-green-500';
	// 		case 'Active':
	// 			return 'text-blue-500';
	// 		case 'Cancelled':
	// 			return 'text-red-500';
	// 		default:
	// 			return 'text-gray-400';
	// 	}
	// }
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Orders</h1>
					<p class="text-sm text-gray-400">Manage your trading strategies</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Orders Content -->
	<div class="space-y-8 p-6">
		<!-- Order Type Selector -->
		<div class="mb-6 flex rounded-lg bg-white/5 p-1">
			{#each ORDER_TYPES as type}
				<button
					on:click={() => (activeOrderType = type.id)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all {activeOrderType ===
					type.id
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					{type.name}
				</button>
			{/each}
		</div>

		<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-6 backdrop-blur-sm">
			{#if activeOrderType === 'limit'}
				<LimitStrategy />
			{:else if activeOrderType === 'dca'}
				<DcaStrategy />
			{:else if activeOrderType === 'activeliquidity'}
				<!-- Liquidity Form -->
				<!-- <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
					<div class="space-y-6 lg:col-span-2">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Token 1</label>
								<select
									bind:value={liquidityOrderState.token1}
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none"
								>
									<option value="">Select first token</option>
									{#each TOKENS as token}
										<option value={token.symbol}>{token.symbol} - {token.name}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Token 2</label>
								<select
									bind:value={liquidityOrderState.token2}
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none"
								>
									<option value="">Select second token</option>
									{#each TOKENS as token}
										<option value={token.symbol}>{token.symbol} - {token.name}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="grid grid-cols-3 gap-4">
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Spread</label>
								<input
									type="text"
									placeholder="1.01"
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
								/>
							</div>
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Cost Basis</label>
								<input
									type="text"
									placeholder="1.035"
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
								/>
							</div>
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Time Per Epoch</label>
								<select
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none"
								>
									<option>1 hour</option>
									<option>30 minutes</option>
									<option>2 hours</option>
									<option>6 hours</option>
								</select>
							</div>
						</div>

						<div class="flex gap-6">
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
								/>
								<span class="text-sm">{liquidityOrderState.token1 || 'Token 1'} Fast Exit</span>
							</label>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
								/>
								<span class="text-sm">{liquidityOrderState.token2 || 'Token 2'} Fast Exit</span>
							</label>
						</div>

						<div class="mb-6 flex items-center gap-3">
							<button
								on:click={() => (liquidityOrderState.isAdvanced = !liquidityOrderState.isAdvanced)}
								class="relative h-6 w-12 rounded-full transition-colors {liquidityOrderState.isAdvanced
									? 'bg-blue-500'
									: 'bg-gray-600'}"
							>
								<div
									class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform {liquidityOrderState.isAdvanced
										? 'translate-x-6'
										: 'translate-x-0.5'}"
								/>
							</button>
							<span class="text-sm font-medium">Show advanced options</span>
						</div>

						{#if liquidityOrderState.isAdvanced}
							<div class="space-y-4 rounded-lg border border-white/5 bg-gray-800/30 p-4">
								<h4 class="text-sm font-medium text-gray-300">Advanced Options</h4>

								<div class="grid grid-cols-2 gap-4">
									<div>
										<label class="mb-2 block text-sm font-medium text-gray-300"
											>Custom deposit amount</label
										>
										<div class="space-y-2">
											<div class="relative">
												<input
													type="text"
													placeholder="0.0"
													class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
												/>
												<div
													class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
												>
													{liquidityOrderState.token1 || 'Token 1'}
												</div>
												<button
													class="absolute right-20 top-1/2 -translate-y-1/2 text-xs text-yellow-500 hover:text-yellow-400"
												>
													MAX
												</button>
											</div>
											<div class="relative">
												<input
													type="text"
													placeholder="0.0"
													class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
												/>
												<div
													class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
												>
													{liquidityOrderState.token2 || 'Token 2'}
												</div>
												<button
													class="absolute right-20 top-1/2 -translate-y-1/2 text-xs text-yellow-500 hover:text-yellow-400"
												>
													MAX
												</button>
											</div>
										</div>
									</div>
									<div>
										<label class="mb-2 block text-sm font-medium text-gray-300">Trade Amounts</label
										>
										<div class="space-y-2">
											<div class="relative">
												<input
													type="text"
													placeholder="Minimum Trade Amount"
													class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
												/>
												<div
													class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
												>
													{liquidityOrderState.token1 || 'Token 1'}
												</div>
											</div>
											<div class="relative">
												<input
													type="text"
													placeholder="Maximum Trade Amount"
													class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
												/>
												<div
													class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"
												>
													{liquidityOrderState.token1 || 'Token 1'}
												</div>
											</div>
										</div>
									</div>
								</div>

								<div>
									<label class="mb-2 block text-sm font-medium text-gray-300">Enter Vault IDs</label
									>
									<div class="grid grid-cols-2 gap-4">
										<div class="space-y-2">
											<input
												type="text"
												placeholder="Input 1 {liquidityOrderState.token1 || 'Token 1'} Vault ID"
												class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
											<input
												type="text"
												placeholder="Input 2 {liquidityOrderState.token2 || 'Token 2'} Vault ID"
												class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
										</div>
										<div class="space-y-2">
											<input
												type="text"
												placeholder="Output 1 {liquidityOrderState.token1 || 'Token 1'} Vault ID"
												class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
											<input
												type="text"
												placeholder="Output 2 {liquidityOrderState.token2 || 'Token 2'} Vault ID"
												class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<div class="space-y-4">
						<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
							<h4 class="mb-3 text-sm font-medium text-gray-300">Liquidity Order Summary</h4>
							<div class="space-y-2">
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Trading Pair</span>
									<span class="font-medium text-white"
										>{liquidityOrderState.token1 && liquidityOrderState.token2
											? `${liquidityOrderState.token1}/${liquidityOrderState.token2}`
											: 'Select tokens'}</span
									>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Spread</span>
									<span class="font-medium text-white">1.01</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Cost Basis</span>
									<span class="font-medium text-white">1.035</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Time Per Epoch</span>
									<span class="font-medium text-white">1 hour</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400"
										>{liquidityOrderState.token1 || 'Token 1'} Fast Exit</span
									>
									<span class="font-medium text-white">No</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400"
										>{liquidityOrderState.token2 || 'Token 2'} Fast Exit</span
									>
									<span class="font-medium text-white">No</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400"
										>{liquidityOrderState.token1 || 'Token 1'} Deposit Amount</span
									>
									<span class="font-medium text-white">0.00</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400"
										>{liquidityOrderState.token2 || 'Token 2'} Deposit Amount</span
									>
									<span class="font-medium text-white">0.00</span>
								</div>
							</div>
						</div>

						<button
							class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105"
						>
							Deploy Order
						</button>
					</div>
				</div> -->
			{:else if activeOrderType === 'portfolio'}
				<!-- Portfolio Form -->
				<!-- <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
					<div class="space-y-6 lg:col-span-2">
						<div>
							<h3 class="mb-4 text-lg font-semibold">Select Tokens</h3>
							<p class="mb-6 text-sm text-gray-400">
								Select the tokens that you want to use in your portfolio.
							</p>

							<div class="space-y-3">
								{#each TOKENS as token}
									<div
										class="flex items-center justify-between rounded-lg border border-white/10 bg-gray-700/30 p-4"
									>
										<div>
											<div class="font-medium">{token.name}</div>
											<div class="text-sm text-gray-400">{token.symbol}</div>
										</div>
										<div class="flex items-center gap-3">
											<label class="flex items-center">
												<input
													type="checkbox"
													checked={portfolioOrderState.selectedTokens.includes(token.symbol)}
													on:change={() => toggleToken(token.symbol)}
													class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
												/>
												<span class="ml-2 text-sm font-medium">{token.symbol}</span>
											</label>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Threshold</label>
								<input
									type="text"
									placeholder="0.05"
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
								/>
								<div class="mt-1 text-xs text-gray-500">
									The threshold for rebalancing the portfolio. E.g. 0.05 = 5%
								</div>
							</div>
							<div>
								<label class="mb-2 block text-sm font-medium text-gray-300">Fee</label>
								<input
									type="text"
									placeholder="0.003"
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
								/>
								<div class="mt-1 text-xs text-gray-500">
									The fee for rebalancing the portfolio. E.g. 0.003 = 0.3%
								</div>
							</div>
						</div>

						<div class="space-y-4">
							<h4 class="text-sm font-medium text-gray-300">Deposit amounts for each token</h4>
							{#each portfolioOrderState.selectedTokens as token}
								<div>
									<label class="mb-2 block text-sm font-medium text-gray-300"
										>Deposit amount ({token})</label
									>
									<div class="relative">
										<input
											type="text"
											placeholder="Enter deposit amount"
											class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
										/>
										<div class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
											{token}
										</div>
										<button
											class="absolute right-16 top-1/2 -translate-y-1/2 text-xs text-yellow-500 hover:text-yellow-400"
										>
											MAX
										</button>
									</div>
								</div>
							{/each}
						</div>

						<div class="mb-6 flex items-center gap-3">
							<button
								on:click={() => (portfolioOrderState.isAdvanced = !portfolioOrderState.isAdvanced)}
								class="relative h-6 w-12 rounded-full transition-colors {portfolioOrderState.isAdvanced
									? 'bg-blue-500'
									: 'bg-gray-600'}"
							>
								<div
									class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform {portfolioOrderState.isAdvanced
										? 'translate-x-6'
										: 'translate-x-0.5'}"
								/>
							</button>
							<span class="text-sm font-medium">Show advanced options</span>
						</div>

						{#if portfolioOrderState.isAdvanced}
							<div class="space-y-4 rounded-lg border border-white/5 bg-gray-800/30 p-4">
								<h4 class="text-sm font-medium text-gray-300">Vault IDs</h4>
								<div class="grid grid-cols-2 gap-4">
									<div>
										<h5 class="mb-2 text-sm text-gray-400">Input Vault IDs</h5>
										{#each portfolioOrderState.selectedTokens as token}
											<input
												type="text"
												placeholder="Input {token} Vault ID"
												class="mb-2 w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
										{/each}
									</div>
									<div>
										<h5 class="mb-2 text-sm text-gray-400">Output Vault IDs</h5>
										{#each portfolioOrderState.selectedTokens as token}
											<input
												type="text"
												placeholder="Output {token} Vault ID"
												class="mb-2 w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
											/>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</div>

					<div class="space-y-4">
						<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
							<h4 class="mb-3 text-sm font-medium text-gray-300">Portfolio Order Summary</h4>
							<div class="space-y-2">
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Selected Tokens</span>
									<span class="font-medium text-white"
										>{portfolioOrderState.selectedTokens.length} tokens</span
									>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Portfolio Tokens</span>
									<span class="font-medium text-white"
										>{portfolioOrderState.selectedTokens.join(', ')}</span
									>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Rebalance Threshold</span>
									<span class="font-medium text-white">5%</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Rebalance Fee</span>
									<span class="font-medium text-white">0.3%</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-gray-400">Total Deposit Value</span>
									<span class="font-medium text-white">0 USD</span>
								</div>
							</div>
						</div>

						<button
							class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105"
						>
							Deploy Order
						</button>
					</div>
				</div> -->
			{:else if activeOrderType === 'history' || activeOrderType === 'orderhistory'}
				<!-- Order History Table -->
				<!-- <div class="space-y-6">
					<div class="flex items-center justify-between">
						<div>
							<h2
								class="bg-gradient-to-r from-yellow-500 to-blue-500 bg-clip-text text-2xl font-bold text-transparent"
							>
								Order History
							</h2>
							<p class="text-gray-400">View and filter your trading history</p>
						</div>

						<div class="flex gap-3">
							<select
								bind:value={historyState.filter}
								class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-2 text-white"
							>
								<option value="all">All Orders</option>
								<option value="active">Active</option>
								<option value="completed">Completed</option>
								<option value="cancelled">Cancelled</option>
								<option value="limit">Limit Orders</option>
								<option value="dca">DCA</option>
								<option value="liquidity">Liquidity</option>
							</select>

							<select
								bind:value={historyState.sortBy}
								class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-2 text-white"
							>
								<option value="date">Sort by Date</option>
								<option value="type">Sort by Type</option>
								<option value="status">Sort by Status</option>
							</select>
						</div>
					</div>

					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-white/10">
									<th class="px-6 py-4 text-left font-medium text-gray-400">Type</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Side</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Pair</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Amount</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Price</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Filled</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Status</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Date</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredOrders as order (order.id)}
									<tr class="border-b border-white/5 hover:bg-white/5">
										<td class="px-6 py-4">
											<span
												class="rounded bg-blue-500/20 px-2 py-1 text-xs font-medium text-blue-400"
											>
												{order.type}
											</span>
										</td>
										<td class="px-6 py-4 text-white">{order.side}</td>
										<td class="px-6 py-4 font-medium text-white">{order.pair}</td>
										<td class="px-6 py-4 text-white">{order.amount}</td>
										<td class="px-6 py-4 text-white">{order.price}</td>
										<td class="px-6 py-4">
											<div class="flex items-center gap-2">
												<div class="h-2 w-16 rounded-full bg-gray-700">
													<div
														class="h-2 rounded-full {order.filled === '100%'
															? 'bg-green-500'
															: order.filled === '0%'
																? 'bg-gray-500'
																: 'bg-yellow-500'}"
														style="width: {order.filled}"
													/>
												</div>
												<span class="text-sm text-gray-400">{order.filled}</span>
											</div>
										</td>
										<td class="px-6 py-4">
											<span class="font-medium {getStatusColor(order.status)}">
												{order.status}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-400">{order.date}</td>
										<td class="px-6 py-4">
											<div class="flex gap-2">
												<button class="text-sm text-blue-400 hover:text-blue-300">View</button>
												{#if order.status === 'Active'}
													<button class="text-sm text-red-400 hover:text-red-300">Cancel</button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if filteredOrders.length === 0}
						<div class="py-12 text-center text-gray-400">
							<div class="mb-4 text-6xl">📋</div>
							<h3 class="mb-2 text-lg font-medium">No orders found</h3>
							<p>Try adjusting your filter settings</p>
						</div>
					{/if}
				</div> -->
			{/if}
		</div>
	</div>

	<!-- Footer -->
	<Footer />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
			sans-serif;
	}
</style>
