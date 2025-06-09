<script>
	import { onMount } from 'svelte';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';

	// Mock Token Data
	const TOKEN_DATA = [
		{
			id: '0x6f69d14e0d7e736510a6f1499255f8ba3b4a951b',
			name: 'Apple Inc.',
			symbol: 'AAPL',
			totalSupply: '9,850',
			circulatingSupply: '9,850',
			holders: 2,
			transfers: 1,
			price: '$150.25',
			change24h: '+2.4%',
			isPositive: true,
			marketCap: '$1,479,962',
			created: '03/06/2025',
			lastActivity: '9 hours ago',
			status: 'Active'
		},
		{
			id: '0x742d35cc6aa6620b97b5c4d8e96b23e8963e2845',
			name: 'Microsoft Corporation',
			symbol: 'MSFT',
			totalSupply: '5,000',
			circulatingSupply: '4,850',
			holders: 3,
			transfers: 5,
			price: '$415.26',
			change24h: '+1.8%',
			isPositive: true,
			marketCap: '$2,013,511',
			created: '02/06/2025',
			lastActivity: '2 hours ago',
			status: 'Active'
		},
		{
			id: '0x1a2b3c4d5e6f789012345678901234567890abcd',
			name: 'NVIDIA Corporation',
			symbol: 'NVDA',
			totalSupply: '2,500',
			circulatingSupply: '2,350',
			holders: 5,
			transfers: 12,
			price: '$118.11',
			change24h: '-0.5%',
			isPositive: false,
			marketCap: '$277,558',
			created: '01/06/2025',
			lastActivity: '1 hour ago',
			status: 'Active'
		},
		{
			id: '0xabcdef123456789012345678901234567890abcd',
			name: 'Tesla Inc.',
			symbol: 'TSLA',
			totalSupply: '1,000',
			circulatingSupply: '950',
			holders: 4,
			transfers: 8,
			price: '$352.56',
			change24h: '+3.2%',
			isPositive: true,
			marketCap: '$334,932',
			created: '31/05/2025',
			lastActivity: '30 minutes ago',
			status: 'Active'
		},
		{
			id: '0x9876543210fedcba0987654321fedcba09876543',
			name: 'Amazon.com Inc.',
			symbol: 'AMZN',
			totalSupply: '3,200',
			circulatingSupply: '3,100',
			holders: 6,
			transfers: 18,
			price: '$186.29',
			change24h: '+1.7%',
			isPositive: true,
			marketCap: '$577,499',
			created: '30/05/2025',
			lastActivity: '45 minutes ago',
			status: 'Active'
		},
		{
			id: '0x567890abcdef1234567890abcdef1234567890ab',
			name: 'Alphabet Inc.',
			symbol: 'GOOGL',
			totalSupply: '4,500',
			circulatingSupply: '4,350',
			holders: 7,
			transfers: 22,
			price: '$175.84',
			change24h: '+0.9%',
			isPositive: true,
			marketCap: '$765,404',
			created: '29/05/2025',
			lastActivity: '1 hour ago',
			status: 'Active'
		},
		{
			id: '0x234567890abcdef1234567890abcdef12345678',
			name: 'Meta Platforms Inc.',
			symbol: 'META',
			totalSupply: '1,800',
			circulatingSupply: '1,750',
			holders: 3,
			transfers: 9,
			price: '$511.40',
			change24h: '+2.8%',
			isPositive: true,
			marketCap: '$894,950',
			created: '28/05/2025',
			lastActivity: '3 hours ago',
			status: 'Active'
		}
	];

	let searchTerm = '';
	let statusFilter = 'all';
	let viewMode = 'grid';
	let sortBy = 'symbol';
	let sortOrder = 'asc';

	// Computed values
	$: filteredTokens = TOKEN_DATA.filter((token) => {
		const matchesSearch =
			token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesStatus = statusFilter === 'all' || token.status.toLowerCase() === statusFilter;
		return matchesSearch && matchesStatus;
	});

	$: sortedTokens = [...filteredTokens].sort((a, b) => {
		let aVal = a[sortBy];
		let bVal = b[sortBy];

		if (sortBy === 'price' || sortBy === 'marketCap') {
			aVal = parseFloat(aVal.replace(/[$,]/g, ''));
			bVal = parseFloat(bVal.replace(/[$,]/g, ''));
		} else if (sortBy === 'totalSupply' || sortBy === 'circulatingSupply') {
			aVal = parseFloat(aVal.replace(/,/g, ''));
			bVal = parseFloat(bVal.replace(/,/g, ''));
		}

		if (sortOrder === 'asc') {
			return aVal > bVal ? 1 : -1;
		} else {
			return aVal < bVal ? 1 : -1;
		}
	});

	$: totalMarketCap = TOKEN_DATA.reduce(
		(sum, token) => sum + parseFloat(token.marketCap.replace(/[$,]/g, '')),
		0
	);

	$: totalSupply = TOKEN_DATA.reduce(
		(sum, token) => sum + parseFloat(token.circulatingSupply.replace(/,/g, '')),
		0
	);

	$: totalHolders = TOKEN_DATA.reduce((sum, token) => sum + token.holders, 0);
	$: activeTokens = TOKEN_DATA.filter((token) => token.status === 'Active').length;

	// Functions
	function handleSort(column) {
		if (sortBy === column) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = column;
			sortOrder = 'asc';
		}
	}

	function getSortIcon(column) {
		if (sortBy !== column) return '↕';
		return sortOrder === 'asc' ? '↑' : '↓';
	}
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Tokens</h1>
					<p class="text-sm text-gray-400">Browse all available tokenized assets</p>
				</div>
			</div>
			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Token List Content -->
	<div class="space-y-8 p-6">
		<!-- Stats Overview -->
		<div class="mb-8 grid grid-cols-4 gap-6">
			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				/>
				<div class="mb-2 text-xs uppercase tracking-wide text-gray-400">Total Tokens</div>
				<div class="mb-1 text-2xl font-bold">{TOKEN_DATA.length}</div>
				<div class="text-sm text-yellow-500">+{activeTokens} Active</div>
			</div>

			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				/>
				<div class="mb-2 text-xs uppercase tracking-wide text-gray-400">Total Market Cap</div>
				<div class="mb-1 text-2xl font-bold">${totalMarketCap.toLocaleString()}</div>
				<div class="text-sm text-green-500">+2.4% 24h</div>
			</div>

			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				/>
				<div class="mb-2 text-xs uppercase tracking-wide text-gray-400">Total Supply</div>
				<div class="mb-1 text-2xl font-bold">{totalSupply.toLocaleString()}</div>
				<div class="text-sm text-blue-500">Circulating</div>
			</div>

			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				/>
				<div class="mb-2 text-xs uppercase tracking-wide text-gray-400">Total Holders</div>
				<div class="mb-1 text-2xl font-bold">{totalHolders}</div>
				<div class="text-sm text-purple-500">Unique addresses</div>
			</div>
		</div>

		<!-- Token List Section -->
		<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-6 backdrop-blur-sm">
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2
						class="bg-gradient-to-r from-yellow-500 to-blue-500 bg-clip-text text-2xl font-bold text-transparent"
					>
						Available Tokens
					</h2>
					<p class="text-gray-400">Explore all tokenized assets on the platform</p>
				</div>
			</div>

			<!-- Filter Bar -->
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					<div class="relative">
						<input
							type="text"
							placeholder="Search tokens..."
							bind:value={searchTerm}
							class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-2 pl-10 text-white placeholder-gray-400 transition-colors focus:border-yellow-500/50 focus:outline-none"
						/>
						<div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</div>
					</div>

					<select
						bind:value={statusFilter}
						class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-2 text-white focus:border-yellow-500/50 focus:outline-none"
					>
						<option value="all">All Status</option>
						<option value="active">Active</option>
						<option value="paused">Paused</option>
						<option value="deprecated">Deprecated</option>
					</select>
				</div>

				<div class="flex gap-2 rounded-lg bg-white/5 p-1">
					<button
						on:click={() => (viewMode = 'grid')}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {viewMode === 'grid'
							? 'bg-yellow-500/20 text-yellow-500'
							: 'text-gray-400 hover:text-white'}"
					>
						Grid
					</button>
					<button
						on:click={() => (viewMode = 'table')}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {viewMode === 'table'
							? 'bg-yellow-500/20 text-yellow-500'
							: 'text-gray-400 hover:text-white'}"
					>
						Table
					</button>
				</div>
			</div>

			{#if viewMode === 'grid'}
				<!-- Grid View -->
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each filteredTokens as token (token.id)}
						<div
							class="group relative cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all hover:border-yellow-500/30"
						>
							<div
								class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
							/>

							<!-- Header with token info and price -->
							<div class="mb-4 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 text-sm font-bold"
									>
										{token.symbol.substring(0, 2)}
									</div>
									<div>
										<h3 class="text-lg font-semibold">{token.symbol}</h3>
										<p class="text-sm text-gray-400">{token.name}</p>
									</div>
								</div>

								<div class="text-right">
									<div class="text-lg font-bold">{token.price}</div>
									<div
										class="text-sm font-medium {token.isPositive
											? 'text-green-500'
											: 'text-red-500'}"
									>
										{token.change24h}
									</div>
								</div>
							</div>

							<!-- Simple metrics row -->
							<div class="mb-3 flex justify-between text-sm">
								<div class="text-center">
									<div class="text-gray-400">Supply</div>
									<div class="font-medium text-white">{token.circulatingSupply}</div>
								</div>
								<div class="text-center">
									<div class="text-gray-400">Holders</div>
									<div class="font-medium text-white">{token.holders}</div>
								</div>
								<div class="text-center">
									<div class="text-gray-400">Transfers</div>
									<div class="font-medium text-white">{token.transfers}</div>
								</div>
								<div class="text-center">
									<div class="text-gray-400">Volume</div>
									<div class="font-medium text-white">$245K</div>
								</div>
								<div class="text-center">
									<div class="text-gray-400">Trades</div>
									<div class="font-medium text-white">42</div>
								</div>
								<div class="text-center">
									<div class="text-gray-400">Market Cap</div>
									<div class="font-medium text-white">{token.marketCap}</div>
								</div>
							</div>

							<!-- Status and last activity -->
							<div
								class="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-400"
							>
								<span
									class="rounded px-2 py-1 text-xs font-medium {token.status === 'Active'
										? 'bg-green-500/20 text-green-400'
										: 'bg-yellow-500/20 text-yellow-400'}"
								>
									{token.status}
								</span>
								<span>{token.lastActivity}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<!-- Table View -->
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('symbol')}
								>
									Token {getSortIcon('symbol')}
								</th>
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('price')}
								>
									Price {getSortIcon('price')}
								</th>
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('change24h')}
								>
									24h Change {getSortIcon('change24h')}
								</th>
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('marketCap')}
								>
									Market Cap {getSortIcon('marketCap')}
								</th>
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('circulatingSupply')}
								>
									Supply {getSortIcon('circulatingSupply')}
								</th>
								<th
									class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									on:click={() => handleSort('holders')}
								>
									Holders {getSortIcon('holders')}
								</th>
								<th class="px-6 py-4 text-left font-medium text-gray-400">Status</th>
								<th class="px-6 py-4 text-left font-medium text-gray-400">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedTokens as token (token.id)}
								<tr class="border-b border-white/5 hover:bg-white/5">
									<td class="px-6 py-4">
										<div class="flex items-center gap-3">
											<div
												class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 text-xs font-bold"
											>
												{token.symbol.substring(0, 2)}
											</div>
											<div>
												<div class="font-medium">{token.symbol}</div>
												<div class="text-xs text-gray-400">{token.name}</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 font-medium text-white">{token.price}</td>
									<td class="px-6 py-4">
										<span
											class="font-medium {token.isPositive ? 'text-green-500' : 'text-red-500'}"
										>
											{token.change24h}
										</span>
									</td>
									<td class="px-6 py-4 text-white">{token.marketCap}</td>
									<td class="px-6 py-4 text-white">{token.circulatingSupply}</td>
									<td class="px-6 py-4 text-white">{token.holders}</td>
									<td class="px-6 py-4">
										<span
											class="rounded-full px-2 py-1 text-xs font-medium {token.status === 'Active'
												? 'bg-green-500/20 text-green-400'
												: 'bg-yellow-500/20 text-yellow-400'}"
										>
											{token.status}
										</span>
									</td>
									<td class="px-6 py-4">
										<button class="text-sm text-blue-400 hover:text-blue-300">
											View Details →
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if filteredTokens.length === 0}
				<div class="py-12 text-center text-gray-400">
					<div class="mb-4 text-6xl">🔍</div>
					<h3 class="mb-2 text-lg font-medium">No tokens found</h3>
					<p>Try adjusting your search or filter criteria</p>
				</div>
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
