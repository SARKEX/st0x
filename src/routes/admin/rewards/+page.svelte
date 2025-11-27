<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { BlockSnapshot } from '$lib/server/snapshots/types';
	import { TOKENS } from '$lib/config/tokens';

	// Tab management
	type Tab = 'points' | 'snapshots' | 'preview' | 'excluded' | 'pool';
	let activeTab: Tab = 'points';

	// Hide excluded wallets toggle (hidden by default)
	let hideExcluded = true;

	// ===== Points Tab State =====
	let pointsLoading = false;
	let pointsError = '';
	let availableMonths: string[] = [];
	let selectedMonth = '';
	let monthlyData: {
		month: string;
		snapshotCount: number;
		blockNumbers: number[];
		walletCount: number;
		wallets: Array<{
			address: string;
			totalPoints: number;
			tokenCount: number;
		}>;
		updatedAt: string;
	} | null = null;

	// Excluded wallets from the monthly data
	let excludedWalletsInData: Set<string> = new Set();

	// ===== Snapshots Tab State =====
	interface SnapshotBlockRecord {
		blockNumber: number;
		timestamp: number;
		date: string;
		generatedAt: string;
	}
	let snapshotsLoading = false;
	let snapshotsError = '';
	let canonicalBlocks: SnapshotBlockRecord[] = [];
	let selectedCanonicalBlock: number | null = null;
	let selectedSnapshotToken: string = '';
	let snapshotData: BlockSnapshot | null = null;
	let snapshotDataLoading = false;

	// Manual trigger state
	let manualTriggerDate = '';
	let manualTriggerLoading = false;
	let manualTriggerError = '';
	let manualTriggerResult: {
		success: boolean;
		date: string;
		blocks: SnapshotBlockRecord[];
		blobsStored: number;
	} | null = null;
	let showTriggerConfirmModal = false;
	let triggerConfirmText = '';

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
		walletCount: number;
		excludedCount: number;
		wallets: Array<{
			address: string;
			totalValue: number;
			totalPoints: number;
			tokens: Array<{
				symbol: string;
				address: string;
				balance: string;
				value: number;
				points: number;
			}>;
			isExcluded: boolean;
		}>;
		tokenSummary: Array<{
			token: string;
			tokenAddress: string;
			holders: number;
			totalSupply: string;
			price: number | null;
			priceConfidence: number | null;
		}>;
		snapshots: BlockSnapshot[];
	} | null = null;
	let selectedWallet: string | null = null;
	let selectedTokenFilter: string = ''; // token symbol (defaults to first token)

	// ===== Excluded Wallets Tab State =====
	let excludedLoading = false;
	let excludedError = '';
	let excludedWallets: string[] = [];
	let newWalletAddress = '';
	let addingWallet = false;

	// ===== Rewards Pool Tab State =====
	interface RewardsPoolConfig {
		month: string;
		poolAmount: number;
		kickerAmount: number;
		kickerTvlTarget: number;
		kickerHit: boolean;
		notes: string;
		updatedAt: string;
	}
	let poolLoading = false;
	let poolError = '';
	let poolConfigs: RewardsPoolConfig[] = [];
	let editingPool: RewardsPoolConfig | null = null;
	let savingPool = false;

	// Form state for new/edit pool
	let poolFormMonth = '';
	let poolFormAmount = 0;
	let poolFormKickerAmount = 0;
	let poolFormKickerTarget = 0;
	let poolFormKickerHit = false;
	let poolFormNotes = '';

	// Token list for snapshots tab
	const tokenSymbols = TOKENS.map((t) => t.symbol);

	onMount(() => {
		loadAvailableMonths();
		loadExcludedWallets();
		loadCanonicalBlocks();
		loadPoolConfigs();
	});

	// ===== Points Functions =====
	async function loadAvailableMonths() {
		try {
			const res = await fetch('/api/snapshots/points');
			const data = await res.json();
			if (data.availableMonths) {
				availableMonths = data.availableMonths;
				if (availableMonths.length > 0 && !selectedMonth) {
					selectedMonth = availableMonths[availableMonths.length - 1]; // Most recent month
					await loadMonthlyData();
				}
			}
		} catch (err) {
			console.error('Failed to load available months:', err);
		}
	}

	async function loadMonthlyData() {
		if (!selectedMonth) return;

		pointsLoading = true;
		pointsError = '';

		try {
			const res = await fetch(`/api/snapshots/points?month=${selectedMonth}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load monthly data');
			}

			monthlyData = data;

			// Update excluded wallets set
			excludedWalletsInData = new Set(excludedWallets.map((w) => w.toLowerCase()));
		} catch (err) {
			pointsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			pointsLoading = false;
		}
	}

	function getWalletRows() {
		if (!monthlyData?.wallets) return [];

		const rows = monthlyData.wallets.map((wallet) => {
			const isExcluded = excludedWalletsInData.has(wallet.address.toLowerCase());
			return {
				...wallet,
				isExcluded
			};
		});

		// Filter if hiding excluded
		const filtered = hideExcluded ? rows.filter((r) => !r.isExcluded) : rows;

		// Already sorted by API (by totalPoints descending)
		return filtered;
	}

	function getTotalPoints() {
		const rows = getWalletRows();
		return rows.reduce((sum, r) => sum + r.totalPoints, 0);
	}

	// ===== Snapshots Functions =====
	async function loadCanonicalBlocks() {
		snapshotsLoading = true;
		snapshotsError = '';

		try {
			const res = await fetch('/api/snapshots/blocks?limit=200');
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to load snapshot blocks');
			}

			canonicalBlocks = data.blocks || [];

			// Default to first block and first token
			if (canonicalBlocks.length > 0 && !selectedCanonicalBlock) {
				selectedCanonicalBlock = canonicalBlocks[0].blockNumber;
			}
			if (tokenSymbols.length > 0 && !selectedSnapshotToken) {
				selectedSnapshotToken = tokenSymbols[0];
			}

			// Load snapshot data for default selection
			if (selectedCanonicalBlock && selectedSnapshotToken) {
				await loadSnapshotData();
			}
		} catch (err) {
			snapshotsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			snapshotsLoading = false;
		}
	}

	async function loadSnapshotData() {
		if (!selectedCanonicalBlock || !selectedSnapshotToken) return;

		snapshotDataLoading = true;
		snapshotData = null;

		try {
			const res = await fetch(
				`/api/snapshots/get?block=${selectedCanonicalBlock}&token=${selectedSnapshotToken}`
			);
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Snapshot not found');
			}

			snapshotData = data.snapshot;
		} catch (err) {
			snapshotsError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			snapshotDataLoading = false;
		}
	}

	function selectCanonicalBlock(block: number) {
		selectedCanonicalBlock = block;
		loadSnapshotData();
	}

	// Open confirmation modal for manual trigger
	function openTriggerConfirmModal() {
		if (!manualTriggerDate) {
			manualTriggerError = 'Please select a date';
			return;
		}
		manualTriggerError = '';
		triggerConfirmText = '';
		showTriggerConfirmModal = true;
	}

	// Close confirmation modal
	function closeTriggerConfirmModal() {
		showTriggerConfirmModal = false;
		triggerConfirmText = '';
	}

	// Execute manual trigger after confirmation
	async function executeManualTrigger() {
		if (triggerConfirmText !== 'CONFIRM') {
			manualTriggerError = 'Please type CONFIRM to proceed';
			return;
		}

		closeTriggerConfirmModal();
		manualTriggerLoading = true;
		manualTriggerError = '';
		manualTriggerResult = null;

		try {
			const res = await fetch('/api/admin/snapshots/trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: manualTriggerDate,
					confirmText: triggerConfirmText
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to trigger snapshot');
			}

			manualTriggerResult = data;
			// Reload the canonical blocks list
			await loadCanonicalBlocks();
		} catch (err) {
			manualTriggerError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			manualTriggerLoading = false;
		}
	}

	// Group canonical blocks by date
	$: blocksByDate = (() => {
		const grouped: Record<string, SnapshotBlockRecord[]> = {};
		for (const block of canonicalBlocks) {
			if (!grouped[block.date]) {
				grouped[block.date] = [];
			}
			grouped[block.date].push(block);
		}
		return grouped;
	})();

	// ===== Preview Functions =====
	async function generatePreview() {
		if (!blockNumber.trim()) {
			previewError = 'Please enter a block number';
			return;
		}

		previewLoading = true;
		previewError = '';
		previewResult = null;
		selectedWallet = null;
		selectedTokenFilter = '';

		try {
			const res = await fetch(`/api/snapshots/preview?block=${blockNumber.trim()}`);
			const data = await res.json();

			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to generate preview');
			}

			previewResult = data;
			// Default to first token
			if (data.tokenSummary?.length > 0) {
				selectedTokenFilter = data.tokenSummary[0].token;
			}
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			previewLoading = false;
		}
	}

	// Get filtered preview wallets for selected token (respecting hideExcluded toggle)
	$: previewWallets = (() => {
		if (!previewResult?.wallets || !selectedTokenFilter) return [];

		// Filter to only wallets holding the selected token
		let wallets = previewResult.wallets
			.map((w) => {
				const tokenData = w.tokens.find((t) => t.symbol === selectedTokenFilter);
				if (!tokenData) return null;
				return {
					...w,
					tokens: [tokenData],
					totalValue: tokenData.value,
					totalPoints: tokenData.points
				};
			})
			.filter((w): w is NonNullable<typeof w> => w !== null);

		// Filter excluded if toggle is on
		if (hideExcluded) {
			wallets = wallets.filter((w) => !w.isExcluded);
		}

		// Sort by value
		return wallets.sort((a, b) => b.totalValue - a.totalValue);
	})();

	// Get selected wallet details
	$: selectedWalletData = previewWallets.find((w) => w.address === selectedWallet) || null;

	// Get the actual BlockSnapshot for the selected token (what would be stored to blob)
	$: selectedTokenSnapshot =
		previewResult?.snapshots.find((s) => s.tokenSymbol === selectedTokenFilter) || null;

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

	// ===== Rewards Pool Functions =====
	async function loadPoolConfigs() {
		poolLoading = true;
		poolError = '';

		try {
			const res = await fetch('/api/admin/rewards-pool');
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load pool configs');
			}

			poolConfigs = data.pools || [];
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			poolLoading = false;
		}
	}

	function startNewPool() {
		// Default to current month
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

		poolFormMonth = currentMonth;
		poolFormAmount = 0;
		poolFormKickerAmount = 0;
		poolFormKickerTarget = 0;
		poolFormKickerHit = false;
		poolFormNotes = '';
		editingPool = null;
	}

	function editPool(config: RewardsPoolConfig) {
		poolFormMonth = config.month;
		poolFormAmount = config.poolAmount;
		poolFormKickerAmount = config.kickerAmount;
		poolFormKickerTarget = config.kickerTvlTarget;
		poolFormKickerHit = config.kickerHit;
		poolFormNotes = config.notes;
		editingPool = config;
	}

	function cancelPoolEdit() {
		editingPool = null;
		poolFormMonth = '';
	}

	async function savePool() {
		if (!poolFormMonth) {
			poolError = 'Month is required';
			return;
		}

		savingPool = true;
		poolError = '';

		try {
			const res = await fetch('/api/admin/rewards-pool', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					month: poolFormMonth,
					poolAmount: poolFormAmount,
					kickerAmount: poolFormKickerAmount,
					kickerTvlTarget: poolFormKickerTarget,
					kickerHit: poolFormKickerHit,
					notes: poolFormNotes
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to save pool config');
			}

			// Reload configs
			await loadPoolConfigs();

			// Clear form
			editingPool = null;
			poolFormMonth = '';
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			savingPool = false;
		}
	}

	async function deletePool(month: string) {
		if (!confirm(`Delete rewards pool config for ${month}?`)) return;

		try {
			const res = await fetch(`/api/admin/rewards-pool?month=${month}`, {
				method: 'DELETE'
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to delete pool config');
			}

			// Reload configs
			await loadPoolConfigs();
		} catch (err) {
			poolError = err instanceof Error ? err.message : 'Unknown error';
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
	$: totalPoints = getTotalPoints();
</script>

<svelte:head>
	<title>Rewards | Admin</title>
</svelte:head>

<div class="py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Rewards</h1>
		<p class="mt-1 text-sm text-gray-400">
			Manage snapshots, points tracking, and excluded wallets
		</p>
	</div>

	<!-- Tab Navigation -->
	<div class="mb-6 border-b border-gray-700">
		<nav class="-mb-px flex gap-6">
			<button
				on:click={() => (activeTab = 'points')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'points'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Monthly Points
			</button>
			<button
				on:click={() => (activeTab = 'snapshots')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'snapshots'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Snapshots
			</button>
			<button
				on:click={() => (activeTab = 'preview')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'preview'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Snapshot Tester
			</button>
			<button
				on:click={() => (activeTab = 'excluded')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'excluded'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Excluded Wallets
			</button>
			<button
				on:click={() => (activeTab = 'pool')}
				class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'pool'
					? 'border-[#e8be89] text-[#e8be89]'
					: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
			>
				Rewards Pool
			</button>
		</nav>
	</div>

	<!-- Hide Excluded Toggle (shown on Points and Preview tabs) -->
	{#if activeTab === 'points' || activeTab === 'preview'}
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

	<!-- Points Tab -->
	{#if activeTab === 'points'}
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

			{#if pointsError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{pointsError}
				</div>
			{/if}

			{#if pointsLoading}
				<Card>
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading monthly data...
					</div>
				</Card>
			{:else if monthlyData}
				<!-- Points Summary -->
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					<Card>
						<div class="text-center">
							<p class="text-3xl font-bold text-[#e8be89]">{totalPoints.toLocaleString()}</p>
							<p class="mt-1 text-sm text-gray-400">
								Total Points {hideExcluded ? '(excl. excluded)' : '(all wallets)'}
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

				<!-- Wallet Points Table -->
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Wallet Points Rankings</h2>
					<p class="mb-4 text-sm text-gray-400">
						Points = 100 per $1 USD of holdings at each snapshot
					</p>
					{#if walletRows.length === 0}
						<p class="py-4 text-center text-gray-400">No wallet data available</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400">
									<tr>
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4 text-right">Points</th>
										<th class="pb-3 text-right">Tokens</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each walletRows.slice(0, 100) as row, i}
										<tr class="hover:bg-gray-800/30 {row.isExcluded ? 'bg-yellow-900/10' : ''}">
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
												{row.totalPoints.toLocaleString()}
											</td>
											<td class="py-2 text-right text-gray-400">
												{row.tokenCount}
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

	<!-- Snapshots Tab -->
	{#if activeTab === 'snapshots'}
		<div class="flex gap-6">
			<!-- Left Panel: Block List -->
			<div class="w-80 flex-shrink-0">
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">Canonical Blocks</h2>
					<p class="mb-4 text-xs text-gray-400">
						Blocks selected by the daily cron job for rewards calculation
					</p>

					{#if snapshotsLoading}
						<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							Loading...
						</div>
					{:else if canonicalBlocks.length === 0}
						<p class="py-4 text-center text-sm text-gray-400">
							No canonical blocks yet. Run the cron job to generate snapshots.
						</p>
					{:else}
						<div class="max-h-[500px] space-y-4 overflow-y-auto">
							{#each Object.entries(blocksByDate).slice(0, 30) as [date, blocks]}
								<div>
									<h3 class="mb-2 text-xs font-medium text-gray-400">{date}</h3>
									<div class="space-y-1">
										{#each blocks as block}
											<button
												on:click={() => selectCanonicalBlock(block.blockNumber)}
												class="w-full rounded px-3 py-2 text-left text-sm transition-colors {selectedCanonicalBlock ===
												block.blockNumber
													? 'bg-[#e8be89] text-black'
													: 'bg-gray-800 text-white hover:bg-gray-700'}"
											>
												<div class="font-mono">{block.blockNumber.toLocaleString()}</div>
												<div class="text-xs opacity-70">
													{new Date(block.timestamp * 1000).toLocaleTimeString()}
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card>

				<!-- Manual Trigger Section -->
				<Card className="mt-4">
					<h2 class="mb-2 text-lg font-semibold text-white">Manual Trigger</h2>
					<p class="mb-4 text-xs text-gray-400">
						Generate snapshots for a specific date. This will overwrite any existing data.
					</p>

					<div class="space-y-3">
						<div>
							<label for="triggerDate" class="mb-1 block text-sm text-gray-400">Date</label>
							<input
								type="date"
								id="triggerDate"
								bind:value={manualTriggerDate}
								max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
								class="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[#e8be89] focus:outline-none"
							/>
						</div>

						<button
							on:click={openTriggerConfirmModal}
							disabled={manualTriggerLoading || !manualTriggerDate}
							class="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if manualTriggerLoading}
								<span class="flex items-center justify-center gap-2">
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
									></div>
									Generating...
								</span>
							{:else}
								Trigger Snapshot
							{/if}
						</button>

						{#if manualTriggerError}
							<p class="text-sm text-red-400">{manualTriggerError}</p>
						{/if}

						{#if manualTriggerResult}
							<div class="rounded-md bg-green-900/30 p-3 text-sm">
								<p class="font-medium text-green-400">Snapshots generated successfully!</p>
								<p class="mt-1 text-gray-300">
									Date: {manualTriggerResult.date}<br />
									Blocks: {manualTriggerResult.blocks.map((b) => b.blockNumber).join(', ')}<br />
									Files stored: {manualTriggerResult.blobsStored}
								</p>
							</div>
						{/if}
					</div>
				</Card>
			</div>

			<!-- Right Panel: Snapshot Data -->
			<div class="flex-1">
				<Card>
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Snapshot Data</h2>
						<div class="flex items-center gap-2">
							<label for="snapshotToken" class="text-sm text-gray-400">Token:</label>
							<select
								id="snapshotToken"
								bind:value={selectedSnapshotToken}
								on:change={() => loadSnapshotData()}
								class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
							>
								{#each tokenSymbols as token}
									<option value={token}>{token}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if snapshotsError}
						<div
							class="mb-4 rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300"
						>
							{snapshotsError}
						</div>
					{/if}

					{#if !selectedCanonicalBlock}
						<p class="py-8 text-center text-gray-400">Select a block to view its snapshot data</p>
					{:else if snapshotDataLoading}
						<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
							></div>
							Loading snapshot...
						</div>
					{:else if snapshotData}
						<!-- Snapshot Summary -->
						<div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{Object.keys(snapshotData.balances).length}
								</p>
								<p class="text-xs text-gray-400">Holders</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{snapshotData.price?.price ? '$' + snapshotData.price.price.toFixed(2) : 'N/A'}
								</p>
								<p class="text-xs text-gray-400">Price</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="text-lg font-bold text-[#e8be89]">
									{snapshotData.excludedWallets.length}
								</p>
								<p class="text-xs text-gray-400">Excluded</p>
							</div>
							<div class="rounded-lg bg-gray-800/50 p-3 text-center">
								<p class="font-mono text-sm text-[#e8be89]">
									{snapshotData.priceTimestamp
										? new Date(snapshotData.priceTimestamp * 1000).toLocaleString()
										: 'N/A'}
								</p>
								<p class="text-xs text-gray-400">Price Timestamp</p>
							</div>
						</div>

						<!-- Raw JSON -->
						<details>
							<summary class="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
								View Raw JSON
							</summary>
							<pre
								class="mt-2 max-h-96 overflow-auto rounded-lg bg-gray-800/50 p-4 text-xs text-gray-300">{JSON.stringify(
									snapshotData,
									null,
									2
								)}</pre>
						</details>
					{:else}
						<p class="py-8 text-center text-gray-400">
							Snapshot not found for {selectedSnapshotToken} at block {selectedCanonicalBlock}
						</p>
					{/if}
				</Card>
			</div>
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
				<!-- Summary Stats -->
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{previewResult.blockNumber.toLocaleString()}
							</p>
							<p class="mt-1 text-sm text-gray-400">Block Number</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">{previewWallets.length}</p>
							<p class="mt-1 text-sm text-gray-400">
								Wallets {hideExcluded ? `(${previewResult.excludedCount} excluded)` : ''}
							</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{formatUsd(previewWallets.reduce((sum, w) => sum + w.totalValue, 0))}
							</p>
							<p class="mt-1 text-sm text-gray-400">Total Value</p>
						</div>
					</Card>
					<Card>
						<div class="text-center">
							<p class="text-2xl font-bold text-[#e8be89]">
								{Math.round(
									previewWallets.reduce((sum, w) => sum + w.totalPoints, 0)
								).toLocaleString()}
							</p>
							<p class="mt-1 text-sm text-gray-400">Points (this snapshot)</p>
						</div>
					</Card>
				</div>

				<!-- Wallet Rankings (Main View) -->
				<Card>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
						<h2 class="text-lg font-semibold text-white">Wallet Rankings</h2>
						<div class="flex items-center gap-4">
							<div class="flex items-center gap-2">
								<label for="tokenFilter" class="text-sm text-gray-400">Token:</label>
								<select
									id="tokenFilter"
									bind:value={selectedTokenFilter}
									on:change={() => (selectedWallet = null)}
									class="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-[#e8be89] focus:outline-none"
								>
									{#each previewResult.tokenSummary as token}
										<option value={token.token}>{token.token}</option>
									{/each}
								</select>
							</div>
							<span class="text-sm text-gray-400">{previewResult.blockDate}</span>
						</div>
					</div>
					<p class="mb-4 text-sm text-gray-400">
						Wallets ranked by {selectedTokenFilter} holdings at block {previewResult.blockNumber.toLocaleString()}
					</p>
					{#if previewWallets.length === 0}
						<p class="py-4 text-center text-gray-400">No wallet data available</p>
					{:else}
						<div class="max-h-[500px] overflow-y-auto">
							<table class="w-full text-left text-sm">
								<thead class="sticky top-0 border-b border-gray-700 bg-gray-900 text-gray-400">
									<tr>
										<th class="pb-3 pr-4">#</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4 text-right">Balance</th>
										<th class="pb-3 pr-4 text-right">Value</th>
										<th class="pb-3 text-right">Points</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-800">
									{#each previewWallets.slice(0, 100) as wallet, i}
										<tr
											class="cursor-pointer transition-colors hover:bg-gray-800/30 {wallet.isExcluded
												? 'bg-yellow-900/10'
												: ''} {selectedWallet === wallet.address ? 'bg-gray-800' : ''}"
											on:click={() =>
												(selectedWallet =
													selectedWallet === wallet.address ? null : wallet.address)}
										>
											<td class="py-2 pr-4 text-gray-500">{i + 1}</td>
											<td class="py-2 pr-4">
												<div class="flex items-center gap-2">
													<a
														href="https://basescan.org/address/{wallet.address}"
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono text-blue-400 hover:underline"
														on:click|stopPropagation
													>
														{formatAddress(wallet.address)}
													</a>
													{#if wallet.isExcluded}
														<span
															class="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400"
														>
															excluded
														</span>
													{/if}
												</div>
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatNumber(wallet.tokens[0]?.balance ?? '0')}
											</td>
											<td class="py-2 pr-4 text-right font-mono text-white">
												{formatUsd(wallet.totalValue)}
											</td>
											<td class="py-2 text-right font-mono text-gray-300">
												{Math.round(wallet.totalPoints).toLocaleString()}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if previewWallets.length > 100}
								<p class="mt-4 text-center text-sm text-gray-500">
									Showing top 100 of {previewWallets.length} wallets
								</p>
							{/if}
						</div>
					{/if}
				</Card>

				<!-- Selected Wallet Details -->
				{#if selectedWalletData}
					<Card>
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-lg font-semibold text-white">Wallet Details</h2>
							<button
								on:click={() => (selectedWallet = null)}
								class="text-sm text-gray-400 hover:text-white"
							>
								Close
							</button>
						</div>
						<div class="rounded-lg bg-gray-800/50 p-4">
							<a
								href="https://basescan.org/address/{selectedWalletData.address}"
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono text-sm text-blue-400 hover:underline"
							>
								{selectedWalletData.address}
							</a>
							<div class="mt-3 grid gap-4 sm:grid-cols-4">
								<div>
									<p class="text-sm text-gray-400">Token</p>
									<p class="font-medium text-[#e8be89]">{selectedTokenFilter}</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Balance</p>
									<p class="font-mono text-white">
										{formatNumber(selectedWalletData.tokens[0]?.balance ?? '0')}
									</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Value</p>
									<p class="font-mono text-white">{formatUsd(selectedWalletData.totalValue)}</p>
								</div>
								<div>
									<p class="text-sm text-gray-400">Points</p>
									<p class="font-mono text-white">
										{Math.round(selectedWalletData.totalPoints).toLocaleString()}
									</p>
								</div>
							</div>
						</div>
					</Card>
				{/if}

				<!-- Tools Section (Collapsible) -->
				<details class="mt-6">
					<summary class="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
						Tools: Token Summary & Raw Data
					</summary>
					<div class="mt-4 space-y-4">
						<!-- Token Summary -->
						<Card>
							<h3 class="mb-4 text-lg font-semibold text-white">Token Summary</h3>
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
										{#each previewResult.tokenSummary as token}
											<tr>
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
						</Card>

						<!-- Raw Snapshot JSON (what would be stored) -->
						<Card>
							<h3 class="mb-4 text-lg font-semibold text-white">
								Raw Snapshot: {selectedTokenFilter}
							</h3>
							<p class="mb-2 text-sm text-gray-400">
								This is the exact JSON that would be stored at: <code class="text-[#e8be89]"
									>snapshots/{selectedTokenFilter}/{previewResult.blockNumber}.json</code
								>
							</p>
							<pre class="max-h-96 overflow-auto text-xs text-gray-300">{JSON.stringify(
									selectedTokenSnapshot,
									null,
									2
								)}</pre>
						</Card>
					</div>
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
					Excluded wallets will be marked but still included in snapshots. They can be hidden from
					TVL calculations using the toggle.
				</p>
			</Card>

			{#if excludedError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
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
							<div class="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
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

	<!-- Rewards Pool Tab -->
	{#if activeTab === 'pool'}
		<div class="space-y-6">
			{#if poolError}
				<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
					{poolError}
				</div>
			{/if}

			<!-- Add/Edit Form -->
			{#if poolFormMonth || editingPool}
				<Card>
					<h2 class="mb-4 text-lg font-semibold text-white">
						{editingPool ? 'Edit Pool Config' : 'New Pool Config'}
					</h2>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<div>
							<label for="poolMonth" class="mb-2 block text-sm font-medium text-gray-300">
								Month (YYYY-MM)
							</label>
							<input
								id="poolMonth"
								type="text"
								bind:value={poolFormMonth}
								placeholder="2024-01"
								disabled={!!editingPool}
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89] disabled:opacity-50"
							/>
						</div>
						<div>
							<label for="poolAmount" class="mb-2 block text-sm font-medium text-gray-300">
								Pool Amount (USD)
							</label>
							<input
								id="poolAmount"
								type="number"
								bind:value={poolFormAmount}
								min="0"
								step="100"
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							/>
						</div>
						<div>
							<label for="kickerAmount" class="mb-2 block text-sm font-medium text-gray-300">
								Kicker Amount (USD)
							</label>
							<input
								id="kickerAmount"
								type="number"
								bind:value={poolFormKickerAmount}
								min="0"
								step="100"
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							/>
						</div>
						<div>
							<label for="kickerTarget" class="mb-2 block text-sm font-medium text-gray-300">
								Kicker TVL Target (USD)
							</label>
							<input
								id="kickerTarget"
								type="number"
								bind:value={poolFormKickerTarget}
								min="0"
								step="1000"
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							/>
						</div>
						<div class="flex items-end">
							<label class="flex items-center gap-2 text-sm text-gray-300">
								<input
									type="checkbox"
									bind:checked={poolFormKickerHit}
									class="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#e8be89] focus:ring-[#e8be89]"
								/>
								Kicker Hit
							</label>
						</div>
						<div class="sm:col-span-2 lg:col-span-3">
							<label for="poolNotes" class="mb-2 block text-sm font-medium text-gray-300">
								Notes
							</label>
							<textarea
								id="poolNotes"
								bind:value={poolFormNotes}
								rows="2"
								placeholder="Optional notes..."
								class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-[#e8be89] focus:outline-none focus:ring-1 focus:ring-[#e8be89]"
							></textarea>
						</div>
					</div>
					<div class="mt-4 flex gap-3">
						<button
							on:click={savePool}
							disabled={savingPool}
							class="rounded-lg bg-[#e8be89] px-6 py-2.5 font-medium text-black transition-colors hover:bg-[#d4a875] disabled:cursor-not-allowed disabled:opacity-50"
						>
							{savingPool ? 'Saving...' : 'Save'}
						</button>
						<button
							on:click={cancelPoolEdit}
							class="rounded-lg border border-gray-600 px-6 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-800"
						>
							Cancel
						</button>
					</div>
				</Card>
			{:else}
				<Card>
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Rewards Pool Configuration</h2>
						<button
							on:click={startNewPool}
							class="rounded-lg bg-[#e8be89] px-4 py-2 font-medium text-black transition-colors hover:bg-[#d4a875]"
						>
							Add New Month
						</button>
					</div>
				</Card>
			{/if}

			<!-- Pool Configs List -->
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-white">Monthly Pool Configs</h2>
				{#if poolLoading}
					<div class="flex items-center justify-center gap-3 py-8 text-gray-400">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
						></div>
						Loading...
					</div>
				{:else if poolConfigs.length === 0}
					<p class="py-4 text-center text-gray-400">
						No pool configs yet. Add a new month to get started.
					</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="border-b border-gray-700 text-gray-400">
								<tr>
									<th class="pb-3 pr-4">Month</th>
									<th class="pb-3 pr-4 text-right">Pool Amount</th>
									<th class="pb-3 pr-4 text-right">Kicker Amount</th>
									<th class="pb-3 pr-4 text-right">TVL Target</th>
									<th class="pb-3 pr-4 text-center">Kicker Hit</th>
									<th class="pb-3 pr-4">Notes</th>
									<th class="pb-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-800">
								{#each poolConfigs as config}
									<tr class="hover:bg-gray-800/30">
										<td class="py-3 pr-4 font-medium text-[#e8be89]">{config.month}</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(config.poolAmount)}
										</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(config.kickerAmount)}
										</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{formatUsd(config.kickerTvlTarget)}
										</td>
										<td class="py-3 pr-4 text-center">
											{#if config.kickerHit}
												<span class="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
													Yes
												</span>
											{:else}
												<span class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
													No
												</span>
											{/if}
										</td>
										<td class="max-w-[200px] truncate py-3 pr-4 text-gray-400" title={config.notes}>
											{config.notes || '-'}
										</td>
										<td class="py-3 text-right">
											<div class="flex justify-end gap-2">
												<button
													on:click={() => editPool(config)}
													class="rounded px-2 py-1 text-sm text-blue-400 transition-colors hover:bg-blue-900/30"
												>
													Edit
												</button>
												<button
													on:click={() => deletePool(config.month)}
													class="rounded px-2 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30"
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>

			<!-- Info Card -->
			<Card>
				<h3 class="mb-2 text-sm font-medium text-gray-300">How Rewards Work</h3>
				<ul class="space-y-1 text-sm text-gray-400">
					<li>
						• <strong>Pool Amount:</strong> Base reward pool distributed pro-rata based on points
					</li>
					<li>• <strong>Kicker Amount:</strong> Additional bonus if TVL target is met</li>
					<li>• <strong>TVL Target:</strong> Target TVL threshold to trigger kicker</li>
					<li>• <strong>Kicker Hit:</strong> Manually mark if the TVL target was achieved</li>
				</ul>
			</Card>
		</div>
	{/if}
</div>

<!-- Confirmation Modal for Manual Trigger -->
{#if showTriggerConfirmModal}
	<div
		class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		on:click={closeTriggerConfirmModal}
		on:keydown={(e) => e.key === 'Escape' && closeTriggerConfirmModal()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<h2 id="confirm-title" class="mb-2 text-xl font-semibold text-white">
				Confirm Snapshot Generation
			</h2>
			<p class="mb-4 text-sm text-gray-400">
				You are about to generate snapshots for <strong class="text-white"
					>{manualTriggerDate}</strong
				>. This will overwrite any existing snapshot data for this date.
			</p>

			<div class="mb-4 rounded-md bg-orange-900/30 p-3">
				<p class="text-sm text-orange-300">This action will:</p>
				<ul class="mt-2 space-y-1 text-sm text-orange-200/80">
					<li>• Select 2 random blocks from that day</li>
					<li>• Generate token snapshots for all configured tokens</li>
					<li>• Update monthly points calculations</li>
					<li>• Overwrite any existing data for this date</li>
				</ul>
			</div>

			<div class="mb-4">
				<label for="confirmInput" class="mb-1 block text-sm text-gray-400">
					Type <strong class="text-white">CONFIRM</strong> to proceed
				</label>
				<input
					type="text"
					id="confirmInput"
					bind:value={triggerConfirmText}
					placeholder="Type CONFIRM"
					class="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
					on:keydown={(e) => e.key === 'Enter' && executeManualTrigger()}
				/>
			</div>

			<div class="flex gap-3">
				<button
					on:click={closeTriggerConfirmModal}
					class="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					on:click={executeManualTrigger}
					disabled={triggerConfirmText !== 'CONFIRM'}
					class="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Generate Snapshots
				</button>
			</div>
		</div>
	</div>
{/if}
