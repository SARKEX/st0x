<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { BlockSnapshot } from '$lib/server/snapshots/types';

	// Tab management
	type Tab = 'tvl' | 'preview' | 'excluded';
	let activeTab: Tab = 'tvl';

	// Hide excluded wallets toggle (hidden by default)
	let hideExcluded = true;

	// ===== TVL Tab State =====
	let tvlLoading = false;
	let tvlError = '';
	let availableMonths: string[] = [];
	let selectedMonth = '';
	let monthlyData: {
		month: string;
		snapshotCount: number;
		blockNumbers: number[];
		wallets: {
			[address: string]: {
				tokens: {
					[tokenAddress: string]: {
						balanceSum: string;
						valueSum: number;
						snapshotCount: number;
					};
				};
				totalValueSum: number;
				snapshotCount: number;
			};
		};
		updatedAt: string;
	} | null = null;

	// Excluded wallets from the monthly data
	let excludedWalletsInData: Set<string> = new Set();

	// ===== Preview Tab State =====
	let blockNumber = '';
	let previewLoading = false;
	let previewError = '';
	let previewResult: {
		success: boolean;
		blockNumber: number;
		timestamp: number;
		blockDate: string;
		transfersProcessed: number;
		tokensProcessed: number;
		summary: Array<{
			token: string;
			tokenAddress: string;
			holders: number;
			totalSupply: string;
			price: number | null;
			priceConfidence: number | null;
		}>;
		snapshots: BlockSnapshot[];
	} | null = null;
	let selectedToken: string | null = null;

	// ===== Excluded Wallets Tab State =====
	let excludedLoading = false;
	let excludedError = '';
	let excludedWallets: string[] = [];
	let newWalletAddress = '';
	let addingWallet = false;

	onMount(() => {
		loadAvailableMonths();
		loadExcludedWallets();
	});

	// ===== TVL Functions =====
	async function loadAvailableMonths() {
		try {
			const res = await fetch('/api/snapshots/averages');
			const data = await res.json();
			if (data.availableMonths) {
				availableMonths = data.availableMonths;
				if (availableMonths.length > 0 && !selectedMonth) {
					selectedMonth = availableMonths[0];
					await loadMonthlyData();
				}
			}
		} catch (err) {
			console.error('Failed to load available months:', err);
		}
	}

	async function loadMonthlyData() {
		if (!selectedMonth) return;

		tvlLoading = true;
		tvlError = '';

		try {
			const res = await fetch(`/api/snapshots/averages?month=${selectedMonth}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load monthly data');
			}

			monthlyData = data;

			// Extract excluded wallets from snapshot data
			// We'll need to get this from the API or store
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			tvlError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			tvlLoading = false;
		}
	}

	function getWalletRows() {
		if (!monthlyData?.wallets) return [];

		const rows = Object.entries(monthlyData.wallets).map(([address, data]) => {
			const avgValue = data.snapshotCount > 0 ? data.totalValueSum / data.snapshotCount : 0;
			const isExcluded = excludedWalletsInData.has(address.toLowerCase());

			return {
				address,
				avgValue,
				snapshotCount: data.snapshotCount,
				tokens: data.tokens,
				isExcluded
			};
		});

		// Filter if hiding excluded
		const filtered = hideExcluded ? rows.filter((r) => !r.isExcluded) : rows;

		// Sort by average value descending
		return filtered.sort((a, b) => b.avgValue - a.avgValue);
	}

	function getTotalTVL() {
		const rows = getWalletRows();
		return rows.reduce((sum, r) => sum + r.avgValue, 0);
	}

	// ===== Preview Functions =====
	async function generatePreview() {
		if (!blockNumber.trim()) {
			previewError = 'Please enter a block number';
			return;
		}

		previewLoading = true;
		previewError = '';
		previewResult = null;
		selectedToken = null;

		try {
			const res = await fetch(`/api/snapshots/preview?block=${blockNumber.trim()}`);
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to generate preview');
			}

			previewResult = data;
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			previewLoading = false;
		}
	}

	function getSelectedSnapshot(): BlockSnapshot | null {
		if (!previewResult || !selectedToken) return null;
		return previewResult.snapshots.find((s) => s.tokenSymbol === selectedToken) || null;
	}

	$: selectedSnapshot = getSelectedSnapshot();
	$: sortedBalances = selectedSnapshot
		? Object.entries(selectedSnapshot.balances)
				.filter(([addr]) => !hideExcluded || !selectedSnapshot!.excludedWallets.includes(addr.toLowerCase()))
				.sort(([, a], [, b]) => parseFloat(b) - parseFloat(a))
		: [];

	// ===== Excluded Wallets Functions =====
	async function loadExcludedWallets() {
		excludedLoading = true;
		excludedError = '';

		try {
			const res = await fetch('/api/admin/excluded-wallets');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load excluded wallets');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			excludedLoading = false;
		}
	}

	async function addExcludedWallet() {
		if (!newWalletAddress.trim()) return;

		// Basic validation
		const address = newWalletAddress.trim().toLowerCase();
		if (!/^0x[a-f0-9]{40}$/i.test(address)) {
			excludedError = 'Invalid Ethereum address';
			return;
		}

		if (excludedWallets.includes(address)) {
			excludedError = 'Address already in excluded list';
			return;
		}

		addingWallet = true;
		excludedError = '';

		try {
			const res = await fetch('/api/admin/excluded-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to add wallet');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
			newWalletAddress = '';
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			addingWallet = false;
		}
	}

	async function removeExcludedWallet(address: string) {
		try {
			const res = await fetch('/api/admin/excluded-wallets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', address })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to remove wallet');
			}

			excludedWallets = data.wallets || [];
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			excludedError = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	// ===== Utility Functions =====
	function formatNumber(value: string | number, decimals = 18): string {
		const num = typeof value === 'string' ? parseFloat(value) / Math.pow(10, decimals) : value;
		if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
		if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
		return num.toFixed(4);
	}

	function formatUsd(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatPrice(price: number | null): string {
		if (price === null) return 'N/A';
		return '$' + price.toFixed(2);
	}

	function formatAddress(address: string): string {
		return address.slice(0, 6) + '...' + address.slice(-4);
	}

	$: walletRows = getWalletRows();
	$: totalTVL = getTotalTVL();
</script>

<svelte:head>
	<title>Rewards | Admin</title>
</svelte:head>

<div class="py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Rewards</h1>
		<p class="mt-1 text-sm text-gray-400">Manage snapshots, TVL tracking, and excluded wallets</p>
	</div>

	<!-- Tab Navigation -->
	<div class="mb-6 border-b border-gray-700">
		<nav class="-mb-px flex gap-6">
			<button
				on:click={() => (activeTab = 'tvl')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'tvl'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Monthly TVL
			</button>
			<button
				on:click={() => (activeTab = 'preview')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'preview'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Snapshot Preview
			</button>
			<button
				on:click={() => (activeTab = 'excluded')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'excluded'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Excluded Wallets
			</button>
		</nav>
	</div>

	<!-- Hide Excluded Toggle (shown on TVL and Preview tabs) -->
	{#if activeTab === 'tvl' || activeTab === 'preview'}
		<div class="mb-4">
			<label class="flex items-center gap-2 text-sm text-gray-300">
				<input
					type="checkbox"
					bind:checked={hideExcluded}
					class="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#e8be89] focus:ring-[#e8be89]"
				/>
				Hide excluded wallets
			</label>
		</div>
	{/if}

	<!-- TVL Tab -->
	{#if activeTab === 'tvl'}
		<div class="space-y-6">
			<!-- Month Selector -->
			<Card>
				<div class="flex flex-wrap items-center gap-4">
					<span class="text-sm font-medium text-gray-400">Month:</span>
					<select
						bind:value={selectedMonth}
						on:change={() => loadMonthlyData()}
						class="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[#e8be89] focus:outline-none"
					>
						{#each availableMonths as month}
							<option value={month}>{month}</option>
						{/each}
					</select>
					{#if monthlyData}
						<span class="text-sm text-gray-500">
							{monthlyData.snapshotCount} snapshots &middot; Last updated: {new Date(
								monthlyData.updatedAt
							).toLocaleString()}
						</span>
					{/if}
				</div>
			</Card>

			{#if tvlError}
				<div
					class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
				>
					{tvlError}
				</div>
			{/if}

			{#if tvlLoading}
				<Card>
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading monthly data...
					</div>
				</Card>
			{:else if monthlyData}
				<!-- TVL Summary -->
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{formatUsd(totalTVL)}</p>
							<p class="mt-1 text-sm text-gray-400">
								Average TVL {hideExcluded ? '(excl. excluded)' : '(all wallets)'}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{walletRows.length}</p>
							<p class="mt-1 text-sm text-gray-400">
								Wallets {hideExcluded ? '(excl. excluded)' : '(total)'}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{monthlyData.snapshotCount}</p>
							<p class="mt-1 text-sm text-gray-400">Snapshots this month</p>
						</div>
					</Card>
				</div>

				<!-- Wallet TVL Table -->
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Wallet TVL Rankings</h2>
					{#if walletRows.length === 0}
						<p class="py-4 text-center text-gray-400">No wallet data available</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead
									class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400"
								>
									<tr>
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4 text-right">Avg. Value</th>
										<th class="pb-3 text-right">Snapshots</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each walletRows.slice(0, 100) as row, i}
										<tr
											class="hover:bg-gray-800/30 {row.isExcluded ? 'bg-yellow-900/10' : ''}"
										>
											<td class="py-2 pr-4 text-gray-500">{i + 1}</td>
											<td class="py-2 pr-4">
												<div class="flex items-center gap-2">
													<a
														href="https://basescan.org/address/{row.address}"
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-blue-400 hover:underline"
													>
														{formatAddress(row.address)}
													</a>
													{#if row.isExcluded}
														<span
															class="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400"
														>
															excluded
														</span>
													{/if}
												</div>
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatUsd(row.avgValue)}
											</td>
											<td class="py-2 text-right text-gray-400">
												{row.snapshotCount}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if walletRows.length > 100}
								<p class="mt-4 text-center text-sm text-gray-500">
									Showing top 100 of {walletRows.length} wallets
								</p>
							{/if}
						</div>
					{/if}
				</Card>
			{:else if availableMonths.length === 0}
				<Card>
					<p class="py-8 text-center text-gray-400">
						No snapshot data available yet. Run the cron job to generate snapshots.
					</p>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- Preview Tab -->
	{#if activeTab === 'preview'}
		<div class="space-y-6">
			<!-- Input Section -->
			<Card>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div class="flex-1">
						<label for="blockNumber" class="mb-2 block text-sm font-medium text-gray-300">
							Block Number
						</label>
						<input
							id="blockNumber"
							type="text"
							bind:value={blockNumber}
							placeholder="Enter block number (e.g., 23456789)"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							on:keydown={(e) => e.key === 'Enter' && generatePreview()}
						/>
					</div>
					<button
						on:click={generatePreview}
						disabled={previewLoading}
						class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{previewLoading ? 'Generating...' : 'Generate Preview'}
					</button>
				</div>
			</Card>

			{#if previewError}
				<div class="rounded-lg border border-red-900/40 bg-red-900/20 p-4 text-red-300">
					{previewError}
				</div>
			{/if}

			{#if previewLoading}
				<Card>
					<div class="flex items-center justify-center gap-3 py-12 text-gray-400">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						<span>Generating snapshot preview... This may take a minute.</span>
					</div>
				</Card>
			{/if}

			{#if previewResult && !previewLoading}
				<!-- Block Info -->
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Block Information</h2>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<p class="text-sm text-gray-400">Block Number</p>
							<p class="font-mono text-lg text-white">
								{previewResult.blockNumber.toLocaleString()}
							</p>
						</div>
						<div>
							<p class="text-sm text-gray-400">Timestamp</p>
							<p class="text-lg text-white">{previewResult.blockDate}</p>
						</div>
						<div>
							<p class="text-sm text-gray-400">Transfers Processed</p>
							<p class="text-lg text-white">
								{previewResult.transfersProcessed.toLocaleString()}
							</p>
						</div>
						<div>
							<p class="text-sm text-gray-400">Tokens</p>
							<p class="text-lg text-white">{previewResult.tokensProcessed}</p>
						</div>
					</div>
				</Card>

				<!-- Token Summary -->
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Token Summary</h2>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="border-b border-gray-700 text-gray-400">
								<tr>
									<th class="pb-3 pr-4">Token</th>
									<th class="pb-3 pr-4 text-right">Holders</th>
									<th class="pb-3 pr-4 text-right">Total Supply</th>
									<th class="pb-3 pr-4 text-right">Price</th>
									<th class="pb-3 text-right">Confidence</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-800">
								{#each previewResult.summary as token}
									<tr
										class="cursor-pointer transition-colors hover:bg-gray-800/50"
										class:bg-gray-800={selectedToken === token.token}
										on:click={() => (selectedToken = token.token)}
									>
										<td class="py-3 pr-4">
											<span class="font-medium text-[#e8be89]">{token.token}</span>
										</td>
										<td class="py-3 pr-4 text-right text-white">{token.holders}</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatNumber(token.totalSupply)}
										</td>
										<td class="py-3 pr-4 text-right text-white">
											{formatPrice(token.price)}
										</td>
										<td class="py-3 text-right text-gray-400">
											{token.priceConfidence !== null
												? '±$' + token.priceConfidence.toFixed(4)
												: '-'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-4 text-sm text-gray-500">Click a token to view holder details</p>
				</Card>

				<!-- Selected Token Details -->
				{#if selectedSnapshot}
					<Card>
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-lg font-semibold text-white">
								{selectedSnapshot.tokenSymbol} Holders
							</h2>
							<span class="text-sm text-gray-400">
								{sortedBalances.length} holders
								{#if selectedSnapshot.excludedWallets.length > 0}
									({selectedSnapshot.excludedWallets.length} excluded)
								{/if}
							</span>
						</div>

						<!-- Price Info -->
						{#if selectedSnapshot.price}
							<div class="mb-4 rounded-lg bg-gray-800/50 p-3">
								<div class="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
									<div>
										<span class="text-gray-400">Price:</span>
										<span class="ml-2 text-white"
											>{formatPrice(selectedSnapshot.price.price)}</span
										>
									</div>
									<div>
										<span class="text-gray-400">Confidence:</span>
										<span class="ml-2 text-white">
											±${selectedSnapshot.price.confidence?.toFixed(4) ?? 'N/A'}
										</span>
									</div>
									<div>
										<span class="text-gray-400">Feed ID:</span>
										<span class="ml-2 font-mono text-xs text-gray-300">
											{formatAddress(selectedSnapshot.price.priceFeedId)}
										</span>
									</div>
									<div>
										<span class="text-gray-400">Price Time:</span>
										<span class="ml-2 text-white">
											{selectedSnapshot.price.pricePublishTime
												? new Date(
														selectedSnapshot.price.pricePublishTime * 1000
													).toISOString()
												: 'N/A'}
										</span>
									</div>
								</div>
							</div>
						{/if}

						<!-- Holders Table -->
						<div class="max-h-96 overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead
									class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400"
								>
									<tr>
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Address</th>
										<th class="pb-3 pr-4 text-right">Balance</th>
										<th class="pb-3 text-right">Value</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each sortedBalances as [address, balance], i}
										{@const isExcluded = selectedSnapshot.excludedWallets.includes(
											address.toLowerCase()
										)}
										<tr
											class="hover:bg-gray-800/30 {isExcluded ? 'bg-yellow-900/10' : ''}"
										>
											<td class="py-2 pr-4 text-gray-500">{i + 1}</td>
											<td class="py-2 pr-4">
												<div class="flex items-center gap-2">
													<a
														href="https://basescan.org/address/{address}"
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-blue-400 hover:underline"
													>
														{formatAddress(address)}
													</a>
													{#if isExcluded}
														<span
															class="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400"
														>
															excluded
														</span>
													{/if}
												</div>
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatNumber(balance)}
											</td>
											<td class="py-2 text-right text-gray-300">
												{#if selectedSnapshot.price?.price}
													${(
														(parseFloat(balance) / 1e18) *
														selectedSnapshot.price.price
													).toLocaleString(undefined, {
														minimumFractionDigits: 2,
														maximumFractionDigits: 2
													})}
												{:else}
													-
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Card>
				{/if}

				<!-- Raw JSON -->
				<details class="mt-6">
					<summary class="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
						View Raw JSON Response
					</summary>
					<Card className="mt-2">
						<pre class="max-h-96 overflow-auto text-xs text-gray-300">{JSON.stringify(
								previewResult,
								null,
								2
							)}</pre>
					</Card>
				</details>
			{/if}
		</div>
	{/if}

	<!-- Excluded Wallets Tab -->
	{#if activeTab === 'excluded'}
		<div class="space-y-6">
			<!-- Add Wallet Form -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Add Excluded Wallet</h2>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div class="flex-1">
						<label for="newWallet" class="mb-2 block text-sm font-medium text-gray-300">
							Wallet Address
						</label>
						<input
							id="newWallet"
							type="text"
							bind:value={newWalletAddress}
							placeholder="0x..."
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 font-mono text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							on:keydown={(e) => e.key === 'Enter' && addExcludedWallet()}
						/>
					</div>
					<button
						on:click={addExcludedWallet}
						disabled={addingWallet}
						class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{addingWallet ? 'Adding...' : 'Add Wallet'}
					</button>
				</div>
				<p class="mt-2 text-sm text-gray-500">
					Excluded wallets will be marked but still included in snapshots. They can be hidden
					from TVL calculations using the toggle.
				</p>
			</Card>

			{#if excludedError}
				<div
					class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
				>
					{excludedError}
				</div>
			{/if}

			<!-- Excluded Wallets List -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Excluded Wallets</h2>
				{#if excludedLoading}
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading...
					</div>
				{:else if excludedWallets.length === 0}
					<p class="py-4 text-center text-gray-400">No excluded wallets configured</p>
				{:else}
					<div class="space-y-2">
						{#each excludedWallets as wallet}
							<div
								class="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3"
							>
								<a
									href="https://basescan.org/address/{wallet}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-mono text-blue-400 hover:underline"
								>
									{wallet}
								</a>
								<button
									on:click={() => removeExcludedWallet(wallet)}
									class="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30"
								>
									Remove
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>
	{/if}
</div>
