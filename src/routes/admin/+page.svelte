<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { networks } from '$lib/config/networks';
	import { TOKENS } from '$lib/config/tokens';
	import { toDecimal } from '$lib/utils/tokenMath';

	// Build set of valid token addresses (lowercase) from the token list (asset tokens only, not USDC)
	const validTokenAddresses = new Set(TOKENS.map((t) => t.address.toLowerCase()));

	// Tab types
	type Tab = 'tokens' | 'codes' | 'wallets' | 'transactions' | 'timeseries';
	let activeTab: Tab = 'tokens';

	// Period selector
	type PeriodPreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
	let selectedPeriod: PeriodPreset = '30d';
	let customStartDate = '';
	let customEndDate = '';

	const periodPresets: { value: PeriodPreset; label: string }[] = [
		{ value: '7d', label: '7D' },
		{ value: '30d', label: '30D' },
		{ value: '90d', label: '90D' },
		{ value: '1y', label: '1Y' },
		{ value: 'all', label: 'All' }
	];

	// Calculate timestamps from period
	function getTimestampRange(): { start: number; end: number } {
		const now = Math.floor(Date.now() / 1000);

		if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
			return {
				start: Math.floor(new Date(customStartDate).getTime() / 1000),
				end: Math.floor(new Date(customEndDate + 'T23:59:59').getTime() / 1000)
			};
		}

		const dayInSeconds = 24 * 60 * 60;
		switch (selectedPeriod) {
			case '7d':
				return { start: now - 7 * dayInSeconds, end: now };
			case '30d':
				return { start: now - 30 * dayInSeconds, end: now };
			case '90d':
				return { start: now - 90 * dayInSeconds, end: now };
			case '1y':
				return { start: now - 365 * dayInSeconds, end: now };
			case 'all':
				return { start: 0, end: now };
			default:
				return { start: now - 30 * dayInSeconds, end: now };
		}
	}

	function selectPeriod(period: PeriodPreset) {
		selectedPeriod = period;
		if (period !== 'custom') {
			loadAllData();
		}
	}

	function applyCustomRange() {
		if (customStartDate && customEndDate) {
			selectedPeriod = 'custom';
			loadAllData();
		}
	}

	// Types
	interface AccessCode {
		code: string;
		maxUses: number | null;
		currentUses: number;
		walletCount: number;
	}

	interface RegisteredWallet {
		address: string;
		accessCode: string;
		registeredAt: string;
	}

	interface VaultToken {
		address: string;
		symbol: string;
		decimals: number;
	}

	interface VaultBalanceChange {
		amount: string;
		vault: {
			token: VaultToken;
			owner: string;
		};
	}

	interface Trade {
		id: string;
		timestamp: string;
		tradeEvent: {
			sender: string;
			transaction: {
				id: string;
				from: string;
			};
		};
		inputVaultBalanceChange: VaultBalanceChange;
		outputVaultBalanceChange: VaultBalanceChange;
	}

	interface TokenStats {
		symbol: string;
		address: string;
		bought: number;
		sold: number;
		net: number;
		decimals: number;
		tradeCount: number;
		usdcVolume: number;
	}

	interface TimeSeriesEntry {
		date: string;
		walletCount: number;
		tradeCount: number;
		usdcVolume: number;
	}

	interface TransactionEntry {
		id: string;
		timestamp: Date;
		txHash: string;
		wallet: string;
		accessCode: string | null;
		tokenSymbol: string;
		direction: 'buy' | 'sell';
		tokenAmount: number;
		usdcAmount: number;
	}

	interface WalletStats {
		address: string;
		accessCode: string | null;
		totalUsdcVolume: number;
		netUsdcSpend: number;
		tradeCount: number;
	}

	interface AccessCodeStats {
		code: string;
		walletCount: number;
		totalUsdcVolume: number;
		netUsdcSpend: number;
		tradeCount: number;
	}

	// State
	let loading = true;
	let error = '';
	let lastUpdated: Date | null = null;
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	// Data
	let totalTransactions = 0;
	let totalUsdcVolume = 0;
	let tokenStats: TokenStats[] = [];
	let walletStats: WalletStats[] = [];
	let accessCodeStats: AccessCodeStats[] = [];
	let accessCodes: AccessCode[] = [];
	let walletToCode: Map<string, string> = new Map();

	// Enhanced analytics data
	let transactions: TransactionEntry[] = [];
	let timeSeries: TimeSeriesEntry[] = [];
	let meanTxSize = 0;
	let medianTxSize = 0;
	let cumulativeNetVolume = 0; // LP net USDC flow (positive = LP received USDC from user buys)

	// Network config
	const network = networks[0]; // Base mainnet
	const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase();
	// LP wallet that provides liquidity - used to calculate net platform inflow/outflow
	const LP_WALLET = '0x71b94911fd1ce621fc40970450004c544e5287a8'.toLowerCase();

	onMount(() => {
		// Set default custom dates
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		customEndDate = now.toISOString().split('T')[0];
		customStartDate = thirtyDaysAgo.toISOString().split('T')[0];

		loadAllData();
		// Auto-refresh every 30 seconds
		refreshInterval = setInterval(loadAllData, 30000);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function loadAllData() {
		loading = true;
		error = '';

		try {
			// Fetch access codes, wallets, and trades in parallel
			const [codesData, walletsData, tradesData] = await Promise.all([
				fetchAccessCodes(),
				fetchAllWallets(),
				fetchAllTrades()
			]);

			accessCodes = codesData;

			// Build wallet -> access code mapping
			walletToCode = new Map();
			for (const wallet of walletsData) {
				walletToCode.set(wallet.address.toLowerCase(), wallet.accessCode);
			}

			// Process trades
			processTradeData(tradesData);

			lastUpdated = new Date();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load data';
			console.error('Failed to load analytics:', err);
		} finally {
			loading = false;
		}
	}

	async function fetchAccessCodes(): Promise<AccessCode[]> {
		const res = await fetch('/api/admin/codes');
		if (!res.ok) throw new Error('Failed to fetch access codes');
		const data = await res.json();
		return data.codes || [];
	}

	async function fetchAllWallets(): Promise<RegisteredWallet[]> {
		// We need an endpoint to get all wallets - let's use the codes endpoint
		// and aggregate wallet data from there
		const res = await fetch('/api/admin/codes');
		if (!res.ok) throw new Error('Failed to fetch wallet data');
		const data = await res.json();

		// Fetch wallets for each code
		const wallets: RegisteredWallet[] = [];
		for (const code of data.codes || []) {
			const walletsRes = await fetch(`/api/admin/wallets?code=${code.code}`);
			if (walletsRes.ok) {
				const walletsData = await walletsRes.json();
				wallets.push(...(walletsData.wallets || []));
			}
		}
		return wallets;
	}

	async function fetchAllTrades(): Promise<Trade[]> {
		const { start: timestampGt, end: timestampLt } = getTimestampRange();

		// Note: We fetch vault.owner to properly attribute trades to order owners
		// tradeEvent.sender is the taker/solver, not the order owner
		// The vault owner IS the order owner whose order got filled
		const query = `query Trades($skip: Int = 0, $first: Int = 1000, $timestampGt: Int!, $timestampLt: Int!) {
			trades(
				skip: $skip
				first: $first
				where: {
					and: [
						{ timestamp_gt: $timestampGt },
						{ timestamp_lt: $timestampLt }
					]
				}
			){
				id
				timestamp
				tradeEvent{
					transaction{
						id
						from
					}
					sender
				}
				outputVaultBalanceChange {
					amount
					vault {
						owner
						token {
							address
							symbol
							decimals
						}
					}
				}
				inputVaultBalanceChange {
					amount
					vault {
						owner
						token {
							address
							symbol
							decimals
						}
					}
				}
			}
		}`;

		const allTrades: Trade[] = [];
		let skip = 0;
		const first = 1000;
		let hasMore = true;

		while (hasMore) {
			const response = await fetch(network.orderbook_subgraph_url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					variables: { skip, first, timestampGt, timestampLt }
				})
			});

			if (!response.ok) throw new Error('Failed to fetch trades from subgraph');

			const data = await response.json();
			if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');

			const trades = data.data?.trades || [];
			allTrades.push(...trades);

			if (trades.length < first) {
				hasMore = false;
			}
			skip += first;
		}

		// Filter to only trades involving our asset tokens paired with USDC
		// A valid trade must have one token as USDC and the other as one of our asset tokens
		return allTrades.filter((trade) => {
			const inputTokenAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
			const outputTokenAddr = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
			if (!inputTokenAddr || !outputTokenAddr) return false;

			const inputIsUsdc = inputTokenAddr === USDC_ADDRESS;
			const outputIsUsdc = outputTokenAddr === USDC_ADDRESS;
			const inputIsAsset = validTokenAddresses.has(inputTokenAddr);
			const outputIsAsset = validTokenAddresses.has(outputTokenAddr);

			// Valid: USDC paired with one of our asset tokens
			return (inputIsUsdc && outputIsAsset) || (outputIsUsdc && inputIsAsset);
		});
	}

	function processTradeData(trades: Trade[]) {
		totalTransactions = trades.length;
		totalUsdcVolume = 0;

		const tokenMap = new Map<string, TokenStats>();
		const walletMap = new Map<string, WalletStats>();
		const codeMap = new Map<string, AccessCodeStats>();
		const txList: TransactionEntry[] = [];
		const usdcAmounts: number[] = [];

		// Track unique transaction hashes to dedupe volume (solver fills multiple orders in one tx)
		const seenTxHashes = new Set<string>();

		// Time series aggregation - group by day
		const timeSeriesMap = new Map<string, { wallets: Set<string>; tradeCount: number; usdcVolume: number }>();

		// Initialize code stats from access codes
		for (const code of accessCodes) {
			codeMap.set(code.code, {
				code: code.code,
				walletCount: code.walletCount,
				totalUsdcVolume: 0,
				netUsdcSpend: 0,
				tradeCount: 0
			});
		}

		// Track LP wallet net flow (buys vs sells from LP perspective)
		// Positive = LP received USDC (users bought from LP)
		// Negative = LP spent USDC (users sold to LP)
		let lpNetUsdc = 0;

		for (const trade of trades) {
			const input = trade.inputVaultBalanceChange;
			const output = trade.outputVaultBalanceChange;

			if (!input || !output) continue;

			const inputToken = input.vault?.token;
			const outputToken = output.vault?.token;

			if (!inputToken || !outputToken) continue;

			// Use vault owner (order owner) for attribution, not sender (taker/solver)
			// Both input and output vaults belong to the same order owner
			const orderOwner = (output.vault?.owner || input.vault?.owner || '').toLowerCase();
			// Fallback to sender for legacy/direct market orders where vault owner might not be set
			const attributeTo = orderOwner || trade.tradeEvent?.sender?.toLowerCase() || '';

			// Use toDecimal to properly parse Float hex amounts from Rain orderbook
			const inputAmount = toDecimal(input.amount, inputToken.decimals, { absolute: true }) ?? 0;
			const outputAmount = toDecimal(output.amount, outputToken.decimals, { absolute: true }) ?? 0;

			// Determine USDC volume and direction
			// From the order owner's perspective:
			//   inputVaultBalanceChange = what they RECEIVE (tokens coming into their vault)
			//   outputVaultBalanceChange = what they GIVE (tokens going out of their vault)
			let usdcAmount = 0;
			let usdcDirection = 0; // positive = spending USDC, negative = receiving USDC

			if (inputToken.address.toLowerCase() === USDC_ADDRESS) {
				// Order owner receives USDC (they sold asset for USDC)
				usdcAmount = inputAmount;
				usdcDirection = -inputAmount; // Receiving USDC = negative spend
			} else if (outputToken.address.toLowerCase() === USDC_ADDRESS) {
				// Order owner gives USDC (they bought asset with USDC)
				usdcAmount = outputAmount;
				usdcDirection = outputAmount; // Spending USDC = positive spend
			}

			// Only count volume once per unique transaction (dedupes solver multi-fills)
			const txHash = trade.tradeEvent?.transaction?.id?.toLowerCase() || trade.id.toLowerCase();
			if (!seenTxHashes.has(txHash)) {
				seenTxHashes.add(txHash);
				totalUsdcVolume += usdcAmount;
				if (usdcAmount > 0) {
					usdcAmounts.push(usdcAmount);
				}
			}

			// Track LP wallet net flow only (orders owned by LP)
			// From LP perspective: if they receive USDC (usdcDirection negative for owner),
			// that means users bought from LP, so LP gains USDC
			if (orderOwner === LP_WALLET) {
				lpNetUsdc -= usdcDirection; // Flip sign: owner receiving = LP gaining
			}

			// Token stats - track only tokens from our token list (non-USDC)
			const assetToken =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputToken : outputToken;
			const assetAmount =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputAmount : outputAmount;
			// Order owner is BUYING if they give USDC (outputToken is USDC)
			// Order owner is SELLING if they receive USDC (inputToken is USDC)
			const isBuying = outputToken.address.toLowerCase() === USDC_ADDRESS;
			const assetAddress = assetToken.address.toLowerCase();

			// Only track tokens that are in our token list
			if (assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)) {
				if (!tokenMap.has(assetAddress)) {
					tokenMap.set(assetAddress, {
						symbol: assetToken.symbol,
						address: assetToken.address,
						bought: 0,
						sold: 0,
						net: 0,
						decimals: assetToken.decimals,
						tradeCount: 0,
						usdcVolume: 0
					});
				}
				const stats = tokenMap.get(assetAddress)!;
				if (isBuying) {
					stats.bought += assetAmount;
				} else {
					stats.sold += assetAmount;
				}
				stats.net = stats.bought - stats.sold;
				stats.tradeCount += 1;
				stats.usdcVolume += usdcAmount;
			}

			// Build transaction entry
			const timestamp = new Date(parseInt(trade.timestamp) * 1000);

			txList.push({
				id: trade.id,
				timestamp,
				txHash,
				wallet: attributeTo,
				accessCode: walletToCode.get(attributeTo) || null,
				tokenSymbol: assetToken.symbol,
				direction: isBuying ? 'buy' : 'sell',
				tokenAmount: assetAmount,
				usdcAmount
			});

			// Time series aggregation
			const dateKey = timestamp.toISOString().split('T')[0];
			if (!timeSeriesMap.has(dateKey)) {
				timeSeriesMap.set(dateKey, { wallets: new Set(), tradeCount: 0, usdcVolume: 0 });
			}
			const dayStats = timeSeriesMap.get(dateKey)!;
			if (attributeTo) dayStats.wallets.add(attributeTo);
			dayStats.tradeCount += 1;
			dayStats.usdcVolume += usdcAmount;

			// Wallet stats
			if (attributeTo) {
				if (!walletMap.has(attributeTo)) {
					walletMap.set(attributeTo, {
						address: attributeTo,
						accessCode: walletToCode.get(attributeTo) || null,
						totalUsdcVolume: 0,
						netUsdcSpend: 0,
						tradeCount: 0
					});
				}
				const wStats = walletMap.get(attributeTo)!;
				wStats.totalUsdcVolume += usdcAmount;
				wStats.netUsdcSpend += usdcDirection;
				wStats.tradeCount += 1;

				// Access code stats
				const accessCode = walletToCode.get(attributeTo);
				if (accessCode && codeMap.has(accessCode)) {
					const cStats = codeMap.get(accessCode)!;
					cStats.totalUsdcVolume += usdcAmount;
					cStats.netUsdcSpend += usdcDirection;
					cStats.tradeCount += 1;
				}
			}
		}

		// Calculate mean and median
		if (usdcAmounts.length > 0) {
			meanTxSize = usdcAmounts.reduce((a, b) => a + b, 0) / usdcAmounts.length;
			const sorted = [...usdcAmounts].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			medianTxSize = sorted.length % 2 === 0
				? (sorted[mid - 1] + sorted[mid]) / 2
				: sorted[mid];
		} else {
			meanTxSize = 0;
			medianTxSize = 0;
		}

		cumulativeNetVolume = lpNetUsdc;

		// Build time series array sorted by date
		timeSeries = Array.from(timeSeriesMap.entries())
			.map(([date, data]) => ({
				date,
				walletCount: data.wallets.size,
				tradeCount: data.tradeCount,
				usdcVolume: data.usdcVolume
			}))
			.sort((a, b) => a.date.localeCompare(b.date));

		// Sort transactions by timestamp descending (newest first)
		transactions = txList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		tokenStats = Array.from(tokenMap.values()).sort(
			(a, b) => b.bought + b.sold - (a.bought + a.sold)
		);
		walletStats = Array.from(walletMap.values()).sort(
			(a, b) => b.totalUsdcVolume - a.totalUsdcVolume
		);
		accessCodeStats = Array.from(codeMap.values()).sort(
			(a, b) => b.totalUsdcVolume - a.totalUsdcVolume
		);
	}

	function formatTime(date: Date | null): string {
		if (!date) return '';
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatUsd(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatNumber(amount: number, decimals = 2): string {
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		}).format(amount);
	}

	function truncateAddress(addr: string): string {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}

	function getPeriodLabel(): string {
		switch (selectedPeriod) {
			case '7d':
				return 'Last 7 days';
			case '30d':
				return 'Last 30 days';
			case '90d':
				return 'Last 90 days';
			case '1y':
				return 'Last year';
			case 'all':
				return 'All time';
			case 'custom':
				return `${customStartDate} to ${customEndDate}`;
			default:
				return '';
		}
	}
</script>

<div class="py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">On-chain Market</h1>
		{#if lastUpdated}
			<span class="text-xs text-gray-500">
				Auto-refreshes every 30s &middot; Last updated: {formatTime(lastUpdated)}
			</span>
		{/if}
	</div>

	<!-- Period Selector -->
	<div class="mb-6">
		<Card>
			<div class="flex flex-wrap items-center gap-4">
				<span class="text-sm font-medium text-gray-400">Period:</span>
				<div class="flex flex-wrap gap-2">
					{#each periodPresets as preset}
						<button
							on:click={() => selectPeriod(preset.value)}
							class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {selectedPeriod ===
							preset.value
								? 'bg-[#e8be89] text-gray-900'
								: 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
						>
							{preset.label}
						</button>
					{/each}
				</div>
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-500">|</span>
					<input
						type="date"
						bind:value={customStartDate}
						class="rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white focus:border-[#e8be89] focus:outline-none"
					/>
					<span class="text-sm text-gray-400">to</span>
					<input
						type="date"
						bind:value={customEndDate}
						class="rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white focus:border-[#e8be89] focus:outline-none"
					/>
					<button
						on:click={applyCustomRange}
						class="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
					>
						Apply
					</button>
				</div>
			</div>
			{#if selectedPeriod === 'custom'}
				<p class="mt-2 text-xs text-gray-500">Showing data for: {getPeriodLabel()}</p>
			{/if}
		</Card>
	</div>

	{#if error}
		<div class="mb-6 rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
			{error}
		</div>
	{/if}

	{#if loading && !lastUpdated}
		<div class="flex items-center gap-3 text-gray-400">
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
			></div>
			Loading analytics...
		</div>
	{:else}
		<!-- Overview Stats -->
		<div class="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
			<Card>
				<div class="text-center">
					<p class="text-3xl font-bold text-[#e8be89]">{totalTransactions}</p>
					<p class="mt-1 text-sm text-gray-400">Total Transactions</p>
				</div>
			</Card>
			<Card>
				<div class="text-center">
					<p class="text-3xl font-bold text-[#e8be89]">{formatUsd(totalUsdcVolume)}</p>
					<p class="mt-1 text-sm text-gray-400">Total USDC Volume</p>
				</div>
			</Card>
			<Card>
				<div class="text-center">
					<p class="text-3xl font-bold text-[#e8be89]">{accessCodes.length}</p>
					<p class="mt-1 text-sm text-gray-400">Access Codes</p>
				</div>
			</Card>
			<Card>
				<div class="text-center">
					<p class="text-3xl font-bold text-[#e8be89]">{walletStats.length}</p>
					<p class="mt-1 text-sm text-gray-400">Active Wallets</p>
				</div>
			</Card>
		</div>

		<!-- Extended Stats -->
		<div class="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			<Card>
				<div class="text-center">
					<p class="text-2xl font-bold text-white">{formatUsd(meanTxSize)}</p>
					<p class="mt-1 text-sm text-gray-400">Mean Tx Size</p>
				</div>
			</Card>
			<Card>
				<div class="text-center">
					<p class="text-2xl font-bold text-white">{formatUsd(medianTxSize)}</p>
					<p class="mt-1 text-sm text-gray-400">Median Tx Size</p>
				</div>
			</Card>
			<Card>
				<div class="text-center">
					<p class="text-2xl font-bold {cumulativeNetVolume >= 0 ? 'text-green-400' : 'text-red-400'}">
						{cumulativeNetVolume >= 0 ? '+' : ''}{formatUsd(cumulativeNetVolume)}
					</p>
					<p class="mt-1 text-sm text-gray-400">LP Net USDC Flow</p>
				</div>
			</Card>
		</div>

		<!-- Tab Navigation -->
		<div class="mb-6 border-b border-gray-700">
			<nav class="-mb-px flex flex-wrap gap-6">
				<button
					on:click={() => (activeTab = 'tokens')}
					class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'tokens'
						? 'border-[#e8be89] text-[#e8be89]'
						: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
				>
					By Token
				</button>
				<button
					on:click={() => (activeTab = 'transactions')}
					class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'transactions'
						? 'border-[#e8be89] text-[#e8be89]'
						: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
				>
					Transactions
				</button>
				<button
					on:click={() => (activeTab = 'timeseries')}
					class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'timeseries'
						? 'border-[#e8be89] text-[#e8be89]'
						: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
				>
					Activity Over Time
				</button>
				<button
					on:click={() => (activeTab = 'codes')}
					class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'codes'
						? 'border-[#e8be89] text-[#e8be89]'
						: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
				>
					By Access Code
				</button>
				<button
					on:click={() => (activeTab = 'wallets')}
					class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'wallets'
						? 'border-[#e8be89] text-[#e8be89]'
						: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
				>
					By Wallet
				</button>
			</nav>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'tokens'}
			<!-- Token Stats -->
			<Card>
				{#if tokenStats.length === 0}
					<p class="py-4 text-center text-gray-400">No token activity found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-left text-gray-400">
									<th class="pb-3 font-medium">Token</th>
									<th class="pb-3 text-right font-medium">Trades</th>
									<th class="pb-3 text-right font-medium">USDC Volume</th>
									<th class="pb-3 text-right font-medium">Bought</th>
									<th class="pb-3 text-right font-medium">Sold</th>
									<th class="pb-3 text-right font-medium">Net</th>
								</tr>
							</thead>
							<tbody>
								{#each tokenStats as token}
									<tr class="border-b border-gray-800">
										<td class="py-3">
											<span class="font-medium text-white">{token.symbol}</span>
										</td>
										<td class="py-3 text-right text-white">{token.tradeCount}</td>
										<td class="py-3 text-right text-white">{formatUsd(token.usdcVolume)}</td>
										<td class="py-3 text-right text-green-400">
											+{formatNumber(token.bought)}
										</td>
										<td class="py-3 text-right text-red-400">
											-{formatNumber(token.sold)}
										</td>
										<td
											class="py-3 text-right {token.net >= 0 ? 'text-green-400' : 'text-red-400'}"
										>
											{token.net >= 0 ? '+' : ''}{formatNumber(token.net)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
		{:else if activeTab === 'transactions'}
			<!-- Transactions List -->
			<Card>
				{#if transactions.length === 0}
					<p class="py-4 text-center text-gray-400">No transactions found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-left text-gray-400">
									<th class="pb-3 font-medium">Time</th>
									<th class="pb-3 font-medium">Wallet</th>
									<th class="pb-3 font-medium">Code</th>
									<th class="pb-3 font-medium">Token</th>
									<th class="pb-3 text-center font-medium">Direction</th>
									<th class="pb-3 text-right font-medium">Amount</th>
									<th class="pb-3 text-right font-medium">USDC</th>
									<th class="pb-3 font-medium">Tx</th>
								</tr>
							</thead>
							<tbody>
								{#each transactions.slice(0, 100) as tx}
									<tr class="border-b border-gray-800">
										<td class="py-3 text-gray-300">
											{tx.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
											<span class="text-gray-500">{tx.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
										</td>
										<td class="py-3">
											<a
												href="https://basescan.org/address/{tx.wallet}"
												target="_blank"
												rel="noopener noreferrer"
												class="font-mono text-blue-400 hover:underline"
											>
												{truncateAddress(tx.wallet)}
											</a>
										</td>
										<td class="py-3">
											{#if tx.accessCode}
												<code class="rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-[#e8be89]">
													{tx.accessCode}
												</code>
											{:else}
												<span class="text-gray-500">-</span>
											{/if}
										</td>
										<td class="py-3 font-medium text-white">{tx.tokenSymbol}</td>
										<td class="py-3 text-center">
											<span class="rounded px-2 py-0.5 text-xs font-medium {tx.direction === 'buy' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}">
												{tx.direction.toUpperCase()}
											</span>
										</td>
										<td class="py-3 text-right text-white">{formatNumber(tx.tokenAmount, 4)}</td>
										<td class="py-3 text-right text-white">{formatUsd(tx.usdcAmount)}</td>
										<td class="py-3">
											<a
												href="https://basescan.org/tx/{tx.txHash}"
												target="_blank"
												rel="noopener noreferrer"
												class="text-blue-400 hover:underline"
											>
												View
											</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if transactions.length > 100}
							<p class="mt-4 text-center text-sm text-gray-500">
								Showing latest 100 of {transactions.length} transactions
							</p>
						{/if}
					</div>
				{/if}
			</Card>
		{:else if activeTab === 'timeseries'}
			<!-- Time Series / Activity Over Time -->
			<Card>
				{#if timeSeries.length === 0}
					<p class="py-4 text-center text-gray-400">No activity data available</p>
				{:else}
					<div class="mb-6">
						<h3 class="mb-4 text-lg font-medium text-white">Daily Activity</h3>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-gray-700 text-left text-gray-400">
										<th class="pb-3 font-medium">Date</th>
										<th class="pb-3 text-right font-medium">Active Wallets</th>
										<th class="pb-3 text-right font-medium">Transactions</th>
										<th class="pb-3 text-right font-medium">USDC Volume</th>
									</tr>
								</thead>
								<tbody>
									{#each timeSeries as day}
										<tr class="border-b border-gray-800">
											<td class="py-3 text-white">{day.date}</td>
											<td class="py-3 text-right text-white">{day.walletCount}</td>
											<td class="py-3 text-right text-white">{day.tradeCount}</td>
											<td class="py-3 text-right text-white">{formatUsd(day.usdcVolume)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<!-- Simple bar chart visualization for wallet activity -->
					<div class="mt-6">
						<h3 class="mb-4 text-lg font-medium text-white">Wallets Over Time</h3>
						<div class="flex h-40 items-end gap-1">
							{#each timeSeries as day}
								{@const maxWallets = Math.max(...timeSeries.map(d => d.walletCount), 1)}
								<div class="group relative flex-1 min-w-[8px]">
									<div
										class="w-full bg-[#e8be89] rounded-t transition-all hover:bg-[#d4a976]"
										style="height: {(day.walletCount / maxWallets) * 100}%"
									></div>
									<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
										<div class="rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg whitespace-nowrap">
											{day.date}: {day.walletCount} wallets
										</div>
									</div>
								</div>
							{/each}
						</div>
						<div class="mt-2 flex justify-between text-xs text-gray-500">
							<span>{timeSeries[0]?.date}</span>
							<span>{timeSeries[timeSeries.length - 1]?.date}</span>
						</div>
					</div>

					<!-- Volume chart -->
					<div class="mt-8">
						<h3 class="mb-4 text-lg font-medium text-white">Volume Over Time</h3>
						<div class="flex h-40 items-end gap-1">
							{#each timeSeries as day}
								{@const maxVolume = Math.max(...timeSeries.map(d => d.usdcVolume), 1)}
								<div class="group relative flex-1 min-w-[8px]">
									<div
										class="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-400"
										style="height: {(day.usdcVolume / maxVolume) * 100}%"
									></div>
									<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
										<div class="rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg whitespace-nowrap">
											{day.date}: {formatUsd(day.usdcVolume)}
										</div>
									</div>
								</div>
							{/each}
						</div>
						<div class="mt-2 flex justify-between text-xs text-gray-500">
							<span>{timeSeries[0]?.date}</span>
							<span>{timeSeries[timeSeries.length - 1]?.date}</span>
						</div>
					</div>
				{/if}
			</Card>
		{:else if activeTab === 'codes'}
			<!-- Access Code Stats -->
			<Card>
				{#if accessCodeStats.length === 0}
					<p class="py-4 text-center text-gray-400">No access codes found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-left text-gray-400">
									<th class="pb-3 font-medium">Code</th>
									<th class="pb-3 text-right font-medium">Wallets</th>
									<th class="pb-3 text-right font-medium">Trades</th>
									<th class="pb-3 text-right font-medium">USDC Volume</th>
									<th class="pb-3 text-right font-medium">Net USDC Spend</th>
								</tr>
							</thead>
							<tbody>
								{#each accessCodeStats as code}
									<tr class="border-b border-gray-800">
										<td class="py-3">
											<code class="rounded bg-gray-800 px-2 py-0.5 font-mono text-[#e8be89]">
												{code.code}
											</code>
										</td>
										<td class="py-3 text-right text-white">{code.walletCount}</td>
										<td class="py-3 text-right text-white">{code.tradeCount}</td>
										<td class="py-3 text-right text-white">{formatUsd(code.totalUsdcVolume)}</td>
										<td
											class="py-3 text-right {code.netUsdcSpend >= 0
												? 'text-red-400'
												: 'text-green-400'}"
										>
											{code.netUsdcSpend >= 0 ? '-' : '+'}{formatUsd(Math.abs(code.netUsdcSpend))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
			<div class="mt-4">
				<a
					href="/admin/codes"
					class="inline-block rounded-lg bg-[#e8be89] px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-[#d4a976]"
				>
					Manage Access Codes
				</a>
			</div>
		{:else if activeTab === 'wallets'}
			<!-- Wallet Stats -->
			<Card>
				{#if walletStats.length === 0}
					<p class="py-4 text-center text-gray-400">No wallet activity found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-left text-gray-400">
									<th class="pb-3 font-medium">Wallet</th>
									<th class="pb-3 font-medium">Access Code</th>
									<th class="pb-3 text-right font-medium">Trades</th>
									<th class="pb-3 text-right font-medium">USDC Volume</th>
									<th class="pb-3 text-right font-medium">Net USDC Spend</th>
								</tr>
							</thead>
							<tbody>
								{#each walletStats.slice(0, 50) as wallet}
									<tr class="border-b border-gray-800">
										<td class="py-3">
											<a
												href="https://basescan.org/address/{wallet.address}"
												target="_blank"
												rel="noopener noreferrer"
												class="font-mono text-blue-400 hover:underline"
											>
												{truncateAddress(wallet.address)}
											</a>
										</td>
										<td class="py-3">
											{#if wallet.accessCode}
												<code
													class="rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-[#e8be89]"
												>
													{wallet.accessCode}
												</code>
											{:else}
												<span class="text-gray-500">-</span>
											{/if}
										</td>
										<td class="py-3 text-right text-white">{wallet.tradeCount}</td>
										<td class="py-3 text-right text-white">{formatUsd(wallet.totalUsdcVolume)}</td>
										<td
											class="py-3 text-right {wallet.netUsdcSpend >= 0
												? 'text-red-400'
												: 'text-green-400'}"
										>
											{wallet.netUsdcSpend >= 0 ? '-' : '+'}{formatUsd(
												Math.abs(wallet.netUsdcSpend)
											)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if walletStats.length > 50}
							<p class="mt-4 text-center text-sm text-gray-500">
								Showing top 50 of {walletStats.length} wallets
							</p>
						{/if}
					</div>
				{/if}
			</Card>
		{/if}
	{/if}
</div>
