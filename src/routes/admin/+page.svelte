<script lang="ts" context="module">
	type PeriodPreset = '24h' | '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
	const VALID_PERIODS: PeriodPreset[] = ['24h', '7d', '30d', '90d', '1y', 'all'];
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import { networks } from '$lib/config/networks';
	import { TOKENS, getTokenByAnyAddress, getTokenAddressVariants } from '$lib/config/tokens';
	import { toDecimal } from '$lib/utils/tokenMath';
	import { truncateAddress } from '$lib/utils/format';

	// Chart.js types
	type ChartInstance = {
		destroy: () => void;
		update: (mode?: string) => void;
		data: { labels?: string[]; datasets?: Array<Record<string, unknown>> };
		options: Record<string, unknown>;
	} | null;

	type ChartConfigurationLike = {
		type: string;
		data?: Record<string, unknown>;
		options?: Record<string, unknown>;
	};

	type ChartConstructor = new (
		ctx: CanvasRenderingContext2D,
		config: ChartConfigurationLike
	) => ChartInstance;

	interface ChartJsWindow extends Window {
		Chart?: ChartConstructor;
	}

	// Chart.js state
	let ChartCtor: ChartConstructor | null = null;
	let tokenChartCanvas: HTMLCanvasElement | null = null;
	let tokenChart: ChartInstance = null;
	let codeChartCanvas: HTMLCanvasElement | null = null;
	let codeChart: ChartInstance = null;
	let walletChartCanvas: HTMLCanvasElement | null = null;
	let walletChart: ChartInstance = null;
	let chartLibLoaded = false;

	// TVL Chart.js state
	let tvlChartCanvas: HTMLCanvasElement | null = null;
	let tvlChart: ChartInstance = null;
	let tvlCodeChartCanvas: HTMLCanvasElement | null = null;
	let tvlCodeChart: ChartInstance = null;
	let tvlWalletChartCanvas: HTMLCanvasElement | null = null;
	let tvlWalletChart: ChartInstance = null;

	// Build set of valid token addresses (lowercase) from all address variants (wrapped, unwrapped, legacy)
	const validTokenAddresses = new Set(TOKENS.flatMap(getTokenAddressVariants));

	// Map any address variant → canonical wrapped symbol (for grouping trades under one token)
	const addressToCanonicalSymbol = new Map<string, string>(
		TOKENS.flatMap((t): [string, string][] =>
			getTokenAddressVariants(t).map((addr) => [addr, t.symbol])
		)
	);

	// Section types (top-level navigation)
	type Section = 'activity' | 'tvl' | 'swaps';
	let activeSection: Section = 'activity';

	// Tab types
	type Tab = 'tokens' | 'codes' | 'wallets' | 'transactions';
	let activeTab: Tab = 'tokens';

	// TVL Tab types
	type TvlTab = 'tokens' | 'codes' | 'wallets';
	let activeTvlTab: TvlTab = 'tokens';

	// Period selector (persisted in URL search params)
	function getInitialPeriod(): PeriodPreset {
		const param = $page.url.searchParams.get('period');
		if (
			param === 'custom' &&
			$page.url.searchParams.get('from') &&
			$page.url.searchParams.get('to')
		)
			return 'custom';
		if (param && (VALID_PERIODS as string[]).includes(param)) return param as PeriodPreset;
		return '30d';
	}
	let selectedPeriod: PeriodPreset = getInitialPeriod();
	let customStartDate = $page.url.searchParams.get('from') ?? '';
	let customEndDate = $page.url.searchParams.get('to') ?? '';

	const periodPresets: { value: PeriodPreset; label: string }[] = [
		{ value: '24h', label: '24H' },
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

		const DAY = 86400;
		const periodDays: Record<string, number> = {
			'24h': 1,
			'7d': 7,
			'30d': 30,
			'90d': 90,
			'1y': 365
		};
		const days = periodDays[selectedPeriod];
		return { start: days ? now - days * DAY : 0, end: now };
	}

	function updatePeriodUrl(period: PeriodPreset, from?: string, to?: string) {
		const url = new URL($page.url);
		url.searchParams.set('period', period);
		if (period === 'custom' && from && to) {
			url.searchParams.set('from', from);
			url.searchParams.set('to', to);
		} else {
			url.searchParams.delete('from');
			url.searchParams.delete('to');
		}
		replaceState(url, {});
	}

	function selectPeriod(period: PeriodPreset) {
		selectedPeriod = period;
		updatePeriodUrl(period);
		if (period !== 'custom') {
			loadAllData();
		}
	}

	function applyCustomRange() {
		if (customStartDate && customEndDate) {
			selectedPeriod = 'custom';
			updatePeriodUrl('custom', customStartDate, customEndDate);
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

	// Daily breakdown types for pivot tables
	interface DailyStats {
		tradeCount: number;
		usdcVolume: number;
	}

	// TVL data types (from snapshots)
	interface WalletTvlEntry {
		address: string;
		tvl: number;
		tokenBreakdown: Record<string, number>;
		accessCode: string | null;
	}

	interface CodeTvlEntry {
		code: string;
		tvl: number;
		walletCount: number;
	}

	interface DailyTvlEntry {
		date: string;
		timestamp: number;
		blockNumber: number;
		totalTvl: number; // All wallets
		eligibleTvl: number; // Excluding excluded wallets
		tvlExcludingTeam: number; // Excluding both excluded and team wallets
		tokenTvl: Record<string, number>;
		walletTvl: Record<string, number>;
		codeTvl: Record<string, number>;
	}

	interface TvlData {
		latest: {
			timestamp: number;
			blockNumber: number;
			totalTvl: number; // All wallets including excluded
			eligibleTvl: number; // Excluding excluded wallets
			tvlExcludingTeam: number; // Excluding both excluded wallets AND team wallets
			tokenTvl: Record<string, number>;
			walletTvl: WalletTvlEntry[];
			codeTvl: CodeTvlEntry[];
			walletCount: number;
			excludedWalletCount: number;
			teamWalletCount: number;
		} | null;
		daily: DailyTvlEntry[];
	}

	// State
	let loading = true;
	let error = '';
	let lastUpdated: Date | null = null;

	// Data
	let totalTransactions = 0;
	let totalUsdcVolume = 0;
	let walletStats: WalletStats[] = [];
	let accessCodes: AccessCode[] = [];
	let walletToCode: Map<string, string> = new Map();

	// Enhanced analytics data
	let transactions: TransactionEntry[] = [];
	let meanTxSize = 0;
	let medianTxSize = 0;

	// TVL data (from snapshots)
	let tvlLoading = false;
	let tvlError = '';
	let tvlData: TvlData = { latest: null, daily: [] };
	let tvlLastUpdated: Date | null = null;

	// Swap snapshot data
	interface SwapOrderEntry {
		legacySymbol: string;
		wrappedSymbol: string;
		orderHash: string;
		orderActive: boolean;
		inputVault: { tokenSymbol: string; balance: string; balanceFormatted: string } | null;
		outputVault: { tokenSymbol: string; balance: string; balanceFormatted: string } | null;
		legacyOutstanding: string;
		legacyOutstandingFormatted: string;
		teamLegacy: string;
		teamLegacyFormatted: string;
	}
	interface LegacyHolder {
		address: string;
		balance: string;
		balanceFormatted: string;
	}
	interface LegacyBalanceEntry {
		legacySymbol: string;
		legacyAddress: string;
		wrappedSymbol: string;
		totalSupply: string;
		totalSupplyFormatted: string;
		holderCount: number;
		holders: LegacyHolder[];
	}
	let swapLoading = false;
	let swapError = '';
	let swapData: { swapOrders: SwapOrderEntry[]; legacyBalances: LegacyBalanceEntry[] } | null =
		null;
	let expandedLegacyTokens: Set<string> = new Set();

	// Leaderboard month filter
	let leaderboardMonth: string = 'latest'; // 'latest' or 'YYYY-MM'
	let leaderboardMonthDropdownOpen = false;

	// Daily breakdown data for pivot tables
	let dailyTokenStats: Map<string, Map<string, DailyStats>> = new Map(); // date -> token -> stats
	let dailyWalletStats: Map<string, Map<string, DailyStats>> = new Map(); // date -> wallet -> stats
	let dailyCodeStats: Map<string, Map<string, DailyStats>> = new Map(); // date -> code -> stats
	let allDates: string[] = [];
	let allTokenSymbols: string[] = [];
	let allWalletAddresses: string[] = [];
	let allAccessCodes: string[] = [];

	// Token chart controls
	let selectedTokens: Set<string> = new Set();
	let tokenChartMetric: 'count' | 'usdc' = 'count';
	let tokenDropdownOpen = false;

	// Initialize selected tokens when allTokenSymbols changes
	$: if (allTokenSymbols.length > 0 && selectedTokens.size === 0) {
		selectedTokens = new Set(allTokenSymbols);
	}

	/** Toggle a value in a Set and return the Set (for Svelte reactivity reassignment) */
	function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
		if (set.has(item)) set.delete(item);
		else set.add(item);
		return set;
	}

	function toggleToken(symbol: string) {
		selectedTokens = toggleSetItem(selectedTokens, symbol);
	}

	function selectAllTokens() {
		selectedTokens = new Set(allTokenSymbols);
	}

	function clearAllTokens() {
		selectedTokens = new Set();
	}

	function closeDropdownOnClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const close = (selector: string, setter: () => void) => {
			if (!target.closest(selector)) setter();
		};
		close('.token-dropdown', () => (tokenDropdownOpen = false));
		close('.code-dropdown', () => (codeDropdownOpen = false));
		close('.wallet-dropdown', () => (walletDropdownOpen = false));
		close('.tvl-filter-dropdown', () => (tvlFilterDropdownOpen = false));
		close('.tvl-code-dropdown', () => (tvlCodeDropdownOpen = false));
		close('.tvl-wallet-dropdown', () => (tvlWalletDropdownOpen = false));
		close('.leaderboard-month-dropdown', () => (leaderboardMonthDropdownOpen = false));
	}

	// Access code chart controls
	let selectedCode: string | null = null;
	let codeChartMetric: 'count' | 'usdc' = 'count';
	let codeDropdownOpen = false;

	// Initialize selected code when allAccessCodes changes
	$: if (allAccessCodes.length > 0 && selectedCode === null) {
		selectedCode = allAccessCodes[0];
	}

	// Get chart data for selected access code
	$: codeChartData = allDates.map((date) => {
		const dayData = dailyCodeStats.get(date);
		const stats = selectedCode ? dayData?.get(selectedCode) : null;
		const value = codeChartMetric === 'count' ? stats?.tradeCount || 0 : stats?.usdcVolume || 0;
		return { date, value };
	});

	// Wallet chart controls
	let selectedWallets: Set<string> = new Set();
	let walletChartMetric: 'count' | 'usdc' = 'count';
	let walletDropdownOpen = false;

	// Initialize selected wallets when allWalletAddresses changes
	$: if (allWalletAddresses.length > 0 && selectedWallets.size === 0) {
		selectedWallets = new Set(allWalletAddresses.slice(0, 5)); // Default to first 5
	}

	function toggleWallet(wallet: string) {
		selectedWallets = toggleSetItem(selectedWallets, wallet);
	}

	function selectAllWallets() {
		selectedWallets = new Set(allWalletAddresses);
	}

	function clearAllWallets() {
		selectedWallets = new Set();
	}

	// Get chart data for selected wallets
	$: walletChartData = allDates.map((date) => {
		const dayData = dailyWalletStats.get(date);
		let total = 0;
		for (const wallet of allWalletAddresses) {
			if (selectedWallets.has(wallet)) {
				const stats = dayData?.get(wallet);
				total += walletChartMetric === 'count' ? stats?.tradeCount || 0 : stats?.usdcVolume || 0;
			}
		}
		return { date, total };
	});

	// Get chart data for selected tokens
	$: tokenChartData = allDates.map((date) => {
		const dayData = dailyTokenStats.get(date);
		const tokenValues: Record<string, number> = {};
		let total = 0;

		for (const symbol of allTokenSymbols) {
			if (selectedTokens.has(symbol)) {
				const stats = dayData?.get(symbol);
				const value =
					tokenChartMetric === 'count' ? stats?.tradeCount || 0 : stats?.usdcVolume || 0;
				tokenValues[symbol] = value;
				total += value;
			}
		}

		return { date, tokenValues, total };
	});

	// TVL chart filter controls
	type TvlFilterOption = 'all' | 'non-liquidity' | 'non-team';
	let tvlFilter: TvlFilterOption = 'non-team';
	let tvlFilterDropdownOpen = false;

	const tvlFilterOptions: { value: TvlFilterOption; label: string; description: string }[] = [
		{ value: 'all', label: 'All Wallets', description: 'Total TVL including all wallets' },
		{
			value: 'non-liquidity',
			label: 'Non-Liquidity',
			description: 'Excludes liquidity/excluded wallets'
		},
		{
			value: 'non-team',
			label: 'Non-Team',
			description: 'Excludes liquidity and team wallets'
		}
	];

	// TVL chart data based on selected filter
	$: tvlChartData = tvlData.daily.map((entry) => {
		let value: number;
		switch (tvlFilter) {
			case 'all':
				value = entry.totalTvl;
				break;
			case 'non-liquidity':
				value = entry.eligibleTvl;
				break;
			case 'non-team':
				value = entry.tvlExcludingTeam;
				break;
		}
		return { date: entry.date, value };
	});

	// TVL Code chart controls
	let tvlSelectedCode: string | null = null;
	let tvlCodeDropdownOpen = false;

	// Get available codes from TVL data
	$: tvlCodes = tvlData.latest ? tvlData.latest.codeTvl.map((c) => c.code).sort() : [];

	// Initialize selected code when tvlCodes changes
	$: if (tvlCodes.length > 0 && tvlSelectedCode === null) {
		tvlSelectedCode = tvlCodes[0];
	}

	// TVL chart data for selected code
	$: tvlCodeChartData = tvlData.daily.map((entry) => ({
		date: entry.date,
		value: tvlSelectedCode ? entry.codeTvl[tvlSelectedCode] || 0 : 0
	}));

	// TVL Wallet chart controls
	let tvlSelectedWallets: Set<string> = new Set();
	let tvlWalletDropdownOpen = false;

	// Get available wallets from TVL data (top 20 by TVL)
	$: tvlWalletAddresses = tvlData.latest
		? tvlData.latest.walletTvl.slice(0, 20).map((w) => w.address)
		: [];

	// Initialize selected wallets when tvlWalletAddresses changes
	$: if (tvlWalletAddresses.length > 0 && tvlSelectedWallets.size === 0) {
		tvlSelectedWallets = new Set(tvlWalletAddresses.slice(0, 5));
	}

	function toggleTvlWallet(wallet: string) {
		tvlSelectedWallets = toggleSetItem(tvlSelectedWallets, wallet);
	}

	function selectAllTvlWallets() {
		tvlSelectedWallets = new Set(tvlWalletAddresses);
	}

	function clearAllTvlWallets() {
		tvlSelectedWallets = new Set();
	}

	// TVL chart data for selected wallets
	$: tvlWalletChartData = tvlData.daily.map((entry) => {
		let total = 0;
		for (const wallet of tvlWalletAddresses) {
			if (tvlSelectedWallets.has(wallet)) {
				total += entry.walletTvl[wallet] || 0;
			}
		}
		return { date: entry.date, total };
	});

	// Leaderboard month options: extract unique months from daily data
	$: leaderboardMonthOptions = (() => {
		const months = new Set<string>();
		for (const entry of tvlData.daily) {
			// entry.date is YYYY-MM-DD format
			const month = entry.date.slice(0, 7); // YYYY-MM
			months.add(month);
		}
		// Sort descending (most recent first)
		return Array.from(months).sort((a, b) => b.localeCompare(a));
	})();

	// Leaderboard data filtered by selected month
	$: leaderboardCodeTvl = (() => {
		if (leaderboardMonth === 'latest' && tvlData.latest) {
			return tvlData.latest.codeTvl;
		}

		// Find the last day of the selected month in daily data
		const monthDays = tvlData.daily
			.filter((entry) => entry.date.startsWith(leaderboardMonth))
			.sort((a, b) => b.date.localeCompare(a.date)); // Sort descending

		if (monthDays.length === 0) {
			return [];
		}

		// Use the last day of the month as the snapshot
		const lastDayEntry = monthDays[0];
		const codeTvlRecord = lastDayEntry.codeTvl;

		// Convert Record<string, number> to CodeTvlEntry[] format
		// Note: we don't have walletCount in daily data, so we'll show 0 or N/A
		const entries: CodeTvlEntry[] = Object.entries(codeTvlRecord)
			.map(([code, tvl]) => ({
				code,
				tvl,
				walletCount: 0 // Not available in daily snapshots
			}))
			.sort((a, b) => b.tvl - a.tvl);

		return entries;
	})();

	// Total TVL for the selected month (for percentage calculation)
	$: leaderboardTotalTvl = (() => {
		if (leaderboardMonth === 'latest' && tvlData.latest) {
			return tvlData.latest.totalTvl;
		}

		// Sum from leaderboard data
		return leaderboardCodeTvl.reduce((sum, entry) => sum + entry.tvl, 0);
	})();

	// Script loading helper
	const scriptPromises = new Map<string, Promise<void>>();

	function loadScript(src: string): Promise<void> {
		if (!browser) return Promise.resolve();

		if (scriptPromises.has(src)) {
			return scriptPromises.get(src)!;
		}

		const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
		if (existing?.dataset.loaded === 'true') {
			return Promise.resolve();
		}

		if (existing && existing.dataset.loading === 'true') {
			return new Promise<void>((resolve, reject) => {
				existing.addEventListener('load', () => resolve(), { once: true });
				existing.addEventListener(
					'error',
					() => reject(new Error(`Failed to load script: ${src}`)),
					{ once: true }
				);
			});
		}

		const promise = new Promise<void>((resolve, reject) => {
			const script = document.createElement('script');
			script.src = src;
			script.async = true;
			script.dataset.loading = 'true';
			script.addEventListener(
				'load',
				() => {
					script.dataset.loading = 'false';
					script.dataset.loaded = 'true';
					resolve();
				},
				{ once: true }
			);
			script.addEventListener(
				'error',
				() => {
					script.dataset.loading = 'false';
					reject(new Error(`Failed to load script: ${src}`));
				},
				{ once: true }
			);
			document.head.appendChild(script);
		});

		promise.catch(() => {
			scriptPromises.delete(src);
		});

		scriptPromises.set(src, promise);
		return promise;
	}

	async function ensureChartLib(): Promise<ChartConstructor | null> {
		if (!browser) return null;
		if (ChartCtor) return ChartCtor;

		if (typeof window !== 'undefined' && (window as ChartJsWindow).Chart) {
			ChartCtor = (window as ChartJsWindow).Chart ?? null;
			chartLibLoaded = true;
			return ChartCtor;
		}

		try {
			await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js');
			const chartGlobal = (window as ChartJsWindow).Chart ?? null;
			if (!chartGlobal) {
				throw new Error('Chart.js global not found');
			}
			ChartCtor = chartGlobal;
			chartLibLoaded = true;
			return ChartCtor;
		} catch (err) {
			console.error('[admin] Failed to load Chart.js', err);
			return null;
		}
	}

	/**
	 * Factory for creating bar charts with consistent styling.
	 * Destroys the previous chart instance and returns the new one.
	 */
	function createBarChart(
		canvas: HTMLCanvasElement | null,
		prev: ChartInstance,
		config: {
			label: string;
			labels: string[];
			data: number[];
			format: 'usd' | 'usd-large' | 'count';
		}
	): ChartInstance {
		if (!ChartCtor || !canvas) return prev;
		const ctx = canvas.getContext('2d');
		if (!ctx) return prev;

		if (prev) {
			prev.destroy();
		}

		const formatTooltip = (value: number): string => {
			if (config.format === 'count') return `${value} transactions`;
			return formatUsd(value);
		};

		const formatYAxis = (value: string | number): string | number => {
			const num = Number(value);
			if (config.format === 'count') return num;
			if (config.format === 'usd-large') {
				if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
			}
			if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
			return `$${num.toFixed(0)}`;
		};

		return new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: config.labels,
				datasets: [
					{
						label: config.label,
						data: config.data,
						backgroundColor: '#e8be89',
						borderColor: '#d4a976',
						borderWidth: 1,
						borderRadius: 4
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						borderColor: 'rgba(75, 85, 99, 0.3)',
						borderWidth: 1,
						padding: 12,
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => formatTooltip(context.parsed?.y || 0)
						}
					}
				},
				scales: {
					x: {
						ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 0 },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					},
					y: {
						beginAtZero: true,
						ticks: { color: '#9ca3af', callback: formatYAxis },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
		});
	}

	function updateTokenChart() {
		tokenChart = createBarChart(tokenChartCanvas, tokenChart, {
			label: tokenChartMetric === 'count' ? 'Total Transactions' : 'Total USDC Volume',
			labels: tokenChartData.map((d) => d.date),
			data: tokenChartData.map((d) => d.total),
			format: tokenChartMetric === 'count' ? 'count' : 'usd'
		});
	}

	// Reactively update chart when data or selections change
	$: if (browser && chartLibLoaded && tokenChartCanvas && activeTab === 'tokens') {
		void tokenChartData;
		void selectedTokens;
		void tokenChartMetric;
		setTimeout(() => updateTokenChart(), 0);
	}

	function updateCodeChart() {
		codeChart = createBarChart(codeChartCanvas, codeChart, {
			label: codeChartMetric === 'count' ? 'Transactions' : 'USDC Volume',
			labels: codeChartData.map((d) => d.date),
			data: codeChartData.map((d) => d.value),
			format: codeChartMetric === 'count' ? 'count' : 'usd'
		});
	}

	$: if (browser && chartLibLoaded && codeChartCanvas && activeTab === 'codes') {
		void codeChartData;
		void selectedCode;
		void codeChartMetric;
		setTimeout(() => updateCodeChart(), 0);
	}

	function updateWalletChart() {
		walletChart = createBarChart(walletChartCanvas, walletChart, {
			label: walletChartMetric === 'count' ? 'Total Transactions' : 'Total USDC Volume',
			labels: walletChartData.map((d) => d.date),
			data: walletChartData.map((d) => d.total),
			format: walletChartMetric === 'count' ? 'count' : 'usd'
		});
	}

	$: if (browser && chartLibLoaded && walletChartCanvas && activeTab === 'wallets') {
		void walletChartData;
		void selectedWallets;
		void walletChartMetric;
		setTimeout(() => updateWalletChart(), 0);
	}

	function updateTvlChart() {
		const filterLabel = tvlFilterOptions.find((o) => o.value === tvlFilter)?.label || 'TVL';
		tvlChart = createBarChart(tvlChartCanvas, tvlChart, {
			label: `${filterLabel} (USD)`,
			labels: tvlChartData.map((d) => d.date),
			data: tvlChartData.map((d) => d.value),
			format: 'usd-large'
		});
	}

	$: if (
		browser &&
		chartLibLoaded &&
		tvlChartCanvas &&
		activeSection === 'tvl' &&
		activeTvlTab === 'tokens'
	) {
		void tvlChartData;
		void tvlFilter;
		setTimeout(() => updateTvlChart(), 0);
	}

	function updateTvlCodeChart() {
		tvlCodeChart = createBarChart(tvlCodeChartCanvas, tvlCodeChart, {
			label: 'TVL (USD)',
			labels: tvlCodeChartData.map((d) => d.date),
			data: tvlCodeChartData.map((d) => d.value),
			format: 'usd-large'
		});
	}

	$: if (
		browser &&
		chartLibLoaded &&
		tvlCodeChartCanvas &&
		activeSection === 'tvl' &&
		activeTvlTab === 'codes'
	) {
		void tvlCodeChartData;
		void tvlSelectedCode;
		setTimeout(() => updateTvlCodeChart(), 0);
	}

	function updateTvlWalletChart() {
		tvlWalletChart = createBarChart(tvlWalletChartCanvas, tvlWalletChart, {
			label: 'TVL (USD)',
			labels: tvlWalletChartData.map((d) => d.date),
			data: tvlWalletChartData.map((d) => d.total),
			format: 'usd-large'
		});
	}

	$: if (
		browser &&
		chartLibLoaded &&
		tvlWalletChartCanvas &&
		activeSection === 'tvl' &&
		activeTvlTab === 'wallets'
	) {
		void tvlWalletChartData;
		void tvlSelectedWallets;
		setTimeout(() => updateTvlWalletChart(), 0);
	}

	// Network config
	const network = networks[0]; // Base mainnet
	const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();

	// Fetch TVL data from snapshots
	async function fetchTvlData(refresh = false) {
		tvlLoading = true;
		tvlError = '';

		try {
			const res = await fetch(`/api/admin/tvl?limit=90${refresh ? '&refresh=1' : ''}`);
			if (!res.ok) throw new Error('Failed to fetch TVL data');

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || 'Unknown error');
			}

			tvlData = {
				latest: data.latest,
				daily: data.daily
			};
			tvlLastUpdated = new Date();
		} catch (err) {
			tvlError = err instanceof Error ? err.message : 'Failed to load TVL data';
			console.error('Failed to load TVL data:', err);
		} finally {
			tvlLoading = false;
		}
	}

	async function fetchSwapData() {
		swapLoading = true;
		swapError = '';
		try {
			const res = await fetch('/api/admin/swap-snapshot');
			if (!res.ok) throw new Error('Failed to fetch swap data');
			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Unknown error');
			swapData = { swapOrders: data.swapOrders, legacyBalances: data.legacyBalances };
		} catch (err) {
			swapError = err instanceof Error ? err.message : 'Failed to load swap data';
			console.error('Failed to load swap data:', err);
		} finally {
			swapLoading = false;
		}
	}

	function toggleLegacyExpand(symbol: string) {
		expandedLegacyTokens = toggleSetItem(expandedLegacyTokens, symbol);
	}

	onMount(() => {
		// Set default custom dates
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		customEndDate = now.toISOString().split('T')[0];
		customStartDate = thirtyDaysAgo.toISOString().split('T')[0];

		loadAllData();
		fetchTvlData();
		fetchSwapData();

		// Load Chart.js library
		ensureChartLib();

		// Close dropdown on click outside
		document.addEventListener('click', closeDropdownOnClickOutside);
	});

	onDestroy(() => {
		for (const chart of [
			tokenChart,
			codeChart,
			walletChart,
			tvlChart,
			tvlCodeChart,
			tvlWalletChart
		]) {
			chart?.destroy();
		}
		tokenChart = codeChart = walletChart = tvlChart = tvlCodeChart = tvlWalletChart = null;

		if (browser) {
			document.removeEventListener('click', closeDropdownOnClickOutside);
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

		// Fetch wallets for all codes in parallel
		const walletResults = await Promise.all(
			(data.codes || []).map(async (code: { code: string }) => {
				const walletsRes = await fetch(`/api/admin/wallets?code=${code.code}`);
				if (walletsRes.ok) {
					const walletsData = await walletsRes.json();
					return walletsData.wallets || [];
				}
				return [];
			})
		);
		const wallets: RegisteredWallet[] = walletResults.flat();
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

		// Fetch paginated trades from a single subgraph URL
		async function fetchFromSubgraph(url: string): Promise<Trade[]> {
			const trades: Trade[] = [];
			let skip = 0;
			const first = 1000;
			let hasMore = true;

			while (hasMore) {
				try {
					const response = await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							query,
							variables: { skip, first, timestampGt, timestampLt }
						})
					});

					if (!response.ok) {
						console.warn(`[Trades] Subgraph returned ${response.status}: ${url}`);
						break;
					}

					const data = await response.json();
					if (data.errors) {
						console.warn(`[Trades] GraphQL error from ${url}:`, data.errors[0]?.message);
						break;
					}

					const batch = data.data?.trades || [];
					trades.push(...batch);

					hasMore = batch.length >= first;
					skip += first;
				} catch (err) {
					console.warn(`[Trades] Failed to fetch from ${url}:`, err);
					break;
				}
			}
			return trades;
		}

		// Query current + legacy orderbook subgraphs in parallel
		const subgraphUrls = [
			network.orderbook_subgraph_url,
			...network.orderbook_subgraph_urls_inactive
		];
		const results = await Promise.all(subgraphUrls.map(fetchFromSubgraph));

		// Merge and deduplicate by trade ID
		const seenIds = new Set<string>();
		const allTrades: Trade[] = [];
		for (const batch of results) {
			for (const trade of batch) {
				if (!seenIds.has(trade.id)) {
					seenIds.add(trade.id);
					allTrades.push(trade);
				}
			}
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
		totalUsdcVolume = 0;

		const tokenMap = new Map<string, TokenStats>();
		const walletMap = new Map<string, WalletStats>();
		const codeMap = new Map<string, AccessCodeStats>();
		const txList: TransactionEntry[] = [];
		const usdcAmounts: number[] = [];

		// Track unique transaction hashes to dedupe (solver fills multiple orders in one tx)
		const seenTxHashes = new Set<string>();

		// Daily breakdown maps for pivot tables
		const dailyTokenMap = new Map<string, Map<string, DailyStats>>(); // date -> token -> stats
		const dailyWalletMap = new Map<string, Map<string, DailyStats>>(); // date -> wallet -> stats
		const dailyCodeMap = new Map<string, Map<string, DailyStats>>(); // date -> code -> stats
		const tokenSymbolSet = new Set<string>();
		const walletAddressSet = new Set<string>();
		const codeSet = new Set<string>();
		const dateSet = new Set<string>();

		// Track unique txHashes per (date, key) to dedupe transaction counts
		const seenTokenTx = new Set<string>(); // "date|token|txHash"
		const seenWalletTx = new Set<string>(); // "date|wallet|txHash"
		const seenCodeTx = new Set<string>(); // "date|code|txHash"

		// Helper to add daily stats (only counts tx once per unique txHash per date/key)
		const addDailyStats = (
			map: Map<string, Map<string, DailyStats>>,
			seenSet: Set<string>,
			date: string,
			key: string,
			txHash: string,
			usdcAmount: number
		) => {
			if (!map.has(date)) {
				map.set(date, new Map());
			}
			const dayMap = map.get(date)!;
			if (!dayMap.has(key)) {
				dayMap.set(key, { tradeCount: 0, usdcVolume: 0 });
			}
			const stats = dayMap.get(key)!;

			// Only increment tradeCount once per unique txHash for this date/key
			const dedupeKey = `${date}|${key}|${txHash}`;
			if (!seenSet.has(dedupeKey)) {
				seenSet.add(dedupeKey);
				stats.tradeCount += 1;
			}
			// Always add volume (already deduped at global level)
			stats.usdcVolume += usdcAmount;
		};

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

		for (const trade of trades) {
			const input = trade.inputVaultBalanceChange;
			const output = trade.outputVaultBalanceChange;

			if (!input || !output) continue;

			const inputToken = input.vault?.token;
			const outputToken = output.vault?.token;

			if (!inputToken || !outputToken) continue;

			// Get both vault owner and sender
			const vaultOwner = (output.vault?.owner || input.vault?.owner || '').toLowerCase();
			const sender = trade.tradeEvent?.sender?.toLowerCase() || '';

			// Use toDecimal to properly parse Float hex amounts from Rain orderbook
			const inputAmount = toDecimal(input.amount, inputToken.decimals, { absolute: true }) ?? 0;
			const outputAmount = toDecimal(output.amount, outputToken.decimals, { absolute: true }) ?? 0;

			// Determine USDC amount for volume tracking
			let usdcAmount = 0;
			if (inputToken.address.toLowerCase() === USDC_ADDRESS) {
				usdcAmount = inputAmount;
			} else if (outputToken.address.toLowerCase() === USDC_ADDRESS) {
				usdcAmount = outputAmount;
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

			// Token stats - track from vault owner's perspective
			const assetToken =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputToken : outputToken;
			const assetAmount =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputAmount : outputAmount;
			const ownerIsBuying = outputToken.address.toLowerCase() === USDC_ADDRESS;
			const assetAddress = assetToken.address.toLowerCase();

			// Resolve canonical symbol (groups unwrapped/legacy trades under wrapped symbol)
			const canonicalSymbol = addressToCanonicalSymbol.get(assetAddress) ?? assetToken.symbol;

			if (assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)) {
				if (!tokenMap.has(canonicalSymbol)) {
					// Look up the parent token config for the canonical address
					const parentToken = getTokenByAnyAddress(assetAddress);
					tokenMap.set(canonicalSymbol, {
						symbol: canonicalSymbol,
						address: parentToken?.address ?? assetToken.address,
						bought: 0,
						sold: 0,
						net: 0,
						decimals: assetToken.decimals,
						tradeCount: 0,
						usdcVolume: 0
					});
				}
				const stats = tokenMap.get(canonicalSymbol)!;
				if (ownerIsBuying) {
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

			// Helper to add wallet stats
			const addWalletStats = (wallet: string) => {
				if (!wallet) return;
				const hasCode = walletToCode.has(wallet);
				// Only track wallets with access codes (excludes solvers)
				if (!hasCode) return;

				if (!walletMap.has(wallet)) {
					walletMap.set(wallet, {
						address: wallet,
						accessCode: walletToCode.get(wallet) || null,
						totalUsdcVolume: 0,
						netUsdcSpend: 0,
						tradeCount: 0
					});
				}
				const wStats = walletMap.get(wallet)!;
				wStats.totalUsdcVolume += usdcAmount;
				wStats.tradeCount += 1;

				// Access code stats
				const accessCode = walletToCode.get(wallet);
				if (accessCode && codeMap.has(accessCode)) {
					const cStats = codeMap.get(accessCode)!;
					cStats.totalUsdcVolume += usdcAmount;
					cStats.tradeCount += 1;
				}
			};

			// Credit BOTH vault owner and sender if they have access codes
			// This captures both sides of the trade (maker and taker)
			// Solvers without access codes are automatically excluded
			addWalletStats(vaultOwner);
			if (sender !== vaultOwner) {
				addWalletStats(sender);
			}

			// For transactions list, show the primary actor (prefer registered user)
			const senderHasCode = walletToCode.has(sender);
			const vaultOwnerHasCode = walletToCode.has(vaultOwner);
			const primaryWallet = senderHasCode
				? sender
				: vaultOwnerHasCode
					? vaultOwner
					: sender || vaultOwner;
			const isBuying = senderHasCode && sender !== vaultOwner ? !ownerIsBuying : ownerIsBuying;

			txList.push({
				id: trade.id,
				timestamp,
				txHash,
				wallet: primaryWallet,
				accessCode: walletToCode.get(primaryWallet) || null,
				tokenSymbol: canonicalSymbol,
				direction: isBuying ? 'buy' : 'sell',
				tokenAmount: assetAmount,
				usdcAmount
			});

			// Daily breakdown
			const dateKey = timestamp.toISOString().split('T')[0];
			dateSet.add(dateKey);

			// Daily breakdown by token (deduped by txHash, grouped by canonical symbol)
			if (assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)) {
				tokenSymbolSet.add(canonicalSymbol);
				addDailyStats(dailyTokenMap, seenTokenTx, dateKey, canonicalSymbol, txHash, usdcAmount);
			}

			// Daily breakdown by wallet and code (for registered users only, deduped by txHash)
			const addDailyWalletAndCode = (wallet: string) => {
				if (!wallet || !walletToCode.has(wallet)) return;
				walletAddressSet.add(wallet);
				addDailyStats(dailyWalletMap, seenWalletTx, dateKey, wallet, txHash, usdcAmount);

				const code = walletToCode.get(wallet);
				if (code) {
					codeSet.add(code);
					addDailyStats(dailyCodeMap, seenCodeTx, dateKey, code, txHash, usdcAmount);
				}
			};

			addDailyWalletAndCode(vaultOwner);
			if (sender !== vaultOwner) {
				addDailyWalletAndCode(sender);
			}
		}

		// Total unique transactions (deduped by txHash)
		totalTransactions = seenTxHashes.size;

		// Calculate mean and median
		if (usdcAmounts.length > 0) {
			meanTxSize = usdcAmounts.reduce((a, b) => a + b, 0) / usdcAmounts.length;
			const sorted = [...usdcAmounts].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			medianTxSize = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
		} else {
			meanTxSize = 0;
			medianTxSize = 0;
		}

		// Sort transactions by timestamp descending (newest first)
		transactions = txList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		walletStats = Array.from(walletMap.values()).sort(
			(a, b) => b.totalUsdcVolume - a.totalUsdcVolume
		);

		// Populate daily breakdown data for pivot tables
		dailyTokenStats = dailyTokenMap;
		dailyWalletStats = dailyWalletMap;
		dailyCodeStats = dailyCodeMap;
		allDates = Array.from(dateSet).sort();
		allTokenSymbols = Array.from(tokenSymbolSet).sort();
		allWalletAddresses = Array.from(walletAddressSet);
		allAccessCodes = Array.from(codeSet).sort();
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

	function getPeriodLabel(): string {
		switch (selectedPeriod) {
			case '24h':
				return 'Last 24 hours';
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
	<!-- Section Selector -->
	<div class="mb-6 flex items-center gap-6 border-b border-gray-700">
		<button
			on:click={() => (activeSection = 'activity')}
			class="border-b-2 pb-3 text-lg font-semibold transition-colors {activeSection === 'activity'
				? 'border-[#e8be89] text-[#e8be89]'
				: 'border-transparent text-gray-400 hover:text-gray-300'}"
		>
			Trading Vol
		</button>
		<button
			on:click={() => (activeSection = 'tvl')}
			class="border-b-2 pb-3 text-lg font-semibold transition-colors {activeSection === 'tvl'
				? 'border-[#e8be89] text-[#e8be89]'
				: 'border-transparent text-gray-400 hover:text-gray-300'}"
		>
			TVL
		</button>
		<button
			on:click={() => (activeSection = 'swaps')}
			class="border-b-2 pb-3 text-lg font-semibold transition-colors {activeSection === 'swaps'
				? 'border-[#e8be89] text-[#e8be89]'
				: 'border-transparent text-gray-400 hover:text-gray-300'}"
		>
			Swap Snapshot
		</button>
		<div class="ml-auto flex items-center gap-3 pb-3">
			{#if lastUpdated}
				<span class="text-xs text-gray-500">
					Last updated: {formatTime(lastUpdated)}
				</span>
			{/if}
			<button
				on:click={() => {
					if (activeSection === 'swaps') fetchSwapData();
					else if (activeSection === 'tvl') fetchTvlData(true);
					else loadAllData();
				}}
				disabled={loading || swapLoading}
				class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-gray-500 hover:bg-gray-700 disabled:opacity-50"
			>
				<svg
					class="h-4 w-4 {loading || swapLoading ? 'animate-spin' : ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				Refresh
			</button>
		</div>
	</div>

	{#if activeSection === 'activity'}
		<!-- Trading Vol Section -->

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
						<p class="text-3xl font-bold text-[#e8be89]">{walletStats.length}</p>
						<p class="mt-1 text-sm text-gray-400">Active Wallets</p>
					</div>
				</Card>
			</div>

			<!-- Extended Stats -->
			<div class="mb-8 grid gap-6 sm:grid-cols-2">
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
						class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTab ===
						'transactions'
							? 'border-[#e8be89] text-[#e8be89]'
							: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
					>
						Transactions
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
				<!-- Token Stats - Bar Chart -->
				<Card>
					{#if allDates.length === 0 || allTokenSymbols.length === 0}
						<p class="py-4 text-center text-gray-400">No token activity found</p>
					{:else}
						<!-- Controls Row -->
						<div class="mb-6 flex flex-wrap items-center gap-4">
							<h3 class="text-lg font-medium text-white">
								Daily {tokenChartMetric === 'count' ? 'Transaction Count' : 'USDC Volume'}
							</h3>

							<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
								<!-- Token Dropdown -->
								<div class="token-dropdown relative">
									<button
										on:click={() => (tokenDropdownOpen = !tokenDropdownOpen)}
										class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
									>
										<span>
											{#if selectedTokens.size === allTokenSymbols.length}
												All Tokens
											{:else if selectedTokens.size === 0}
												No Tokens
											{:else}
												{selectedTokens.size} Token{selectedTokens.size > 1 ? 's' : ''}
											{/if}
										</span>
										<svg
											class="h-4 w-4 transition-transform {tokenDropdownOpen ? 'rotate-180' : ''}"
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

									{#if tokenDropdownOpen}
										<div
											class="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
										>
											<div class="border-b border-gray-700 px-3 py-2">
												<div class="flex gap-2">
													<button
														on:click={selectAllTokens}
														class="text-xs text-[#e8be89] hover:underline"
													>
														Select All
													</button>
													<span class="text-gray-600">|</span>
													<button
														on:click={clearAllTokens}
														class="text-xs text-gray-400 hover:underline"
													>
														Clear
													</button>
												</div>
											</div>
											{#each allTokenSymbols as symbol}
												<button
													on:click={() => toggleToken(symbol)}
													class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700"
												>
													<span
														class="flex h-4 w-4 items-center justify-center rounded border {selectedTokens.has(
															symbol
														)
															? 'border-[#e8be89] bg-[#e8be89]'
															: 'border-gray-500'}"
													>
														{#if selectedTokens.has(symbol)}
															<svg
																class="h-3 w-3 text-gray-900"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="3"
																	d="M5 13l4 4L19 7"
																/>
															</svg>
														{/if}
													</span>
													<span class="text-white">{symbol}</span>
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<!-- Metric Toggle -->
								<div class="flex rounded-lg bg-gray-800 p-1">
									<button
										on:click={() => (tokenChartMetric = 'count')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {tokenChartMetric ===
										'count'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										# of Tx
									</button>
									<button
										on:click={() => (tokenChartMetric = 'usdc')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {tokenChartMetric ===
										'usdc'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										USDC Value
									</button>
								</div>
							</div>
						</div>

						<!-- Chart.js Bar Chart -->
						{#if selectedTokens.size > 0}
							<div class="relative h-80">
								{#if !chartLibLoaded}
									<div class="absolute inset-0 flex items-center justify-center">
										<div class="text-gray-400">Loading chart...</div>
									</div>
								{/if}
								<canvas bind:this={tokenChartCanvas} class="h-full w-full"></canvas>
							</div>
						{:else}
							<p class="py-8 text-center text-gray-400">
								Select at least one token to view the chart
							</p>
						{/if}
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
												{tx.timestamp.toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric'
												})}
												<span class="text-gray-500"
													>{tx.timestamp.toLocaleTimeString('en-US', {
														hour: '2-digit',
														minute: '2-digit'
													})}</span
												>
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
													<code
														class="rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-[#e8be89]"
													>
														{tx.accessCode}
													</code>
												{:else}
													<span class="text-gray-500">-</span>
												{/if}
											</td>
											<td class="py-3 font-medium text-white">{tx.tokenSymbol}</td>
											<td class="py-3 text-center">
												<span
													class="rounded px-2 py-0.5 text-xs font-medium {tx.direction === 'buy'
														? 'bg-green-900/40 text-green-400'
														: 'bg-red-900/40 text-red-400'}"
												>
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
			{:else if activeTab === 'codes'}
				<!-- Access Code Stats - Bar Chart -->
				<Card>
					{#if allDates.length === 0 || allAccessCodes.length === 0}
						<p class="py-4 text-center text-gray-400">No access code activity found</p>
					{:else}
						<!-- Controls Row -->
						<div class="mb-6 flex flex-wrap items-center gap-4">
							<h3 class="text-lg font-medium text-white">
								Daily {codeChartMetric === 'count' ? 'Transaction Count' : 'USDC Volume'}
							</h3>

							<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
								<!-- Code Dropdown (Single Select) -->
								<div class="code-dropdown relative">
									<button
										on:click={() => (codeDropdownOpen = !codeDropdownOpen)}
										class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
									>
										<span>{selectedCode || 'Select Code'}</span>
										<svg
											class="h-4 w-4 transition-transform {codeDropdownOpen ? 'rotate-180' : ''}"
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

									{#if codeDropdownOpen}
										<div
											class="absolute left-0 top-full z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
										>
											{#each allAccessCodes as code}
												<button
													on:click={() => {
														selectedCode = code;
														codeDropdownOpen = false;
													}}
													class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700 {selectedCode ===
													code
														? 'bg-gray-700 text-[#e8be89]'
														: 'text-white'}"
												>
													{code}
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<!-- Metric Toggle -->
								<div class="flex rounded-lg bg-gray-800 p-1">
									<button
										on:click={() => (codeChartMetric = 'count')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {codeChartMetric ===
										'count'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										# of Tx
									</button>
									<button
										on:click={() => (codeChartMetric = 'usdc')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {codeChartMetric ===
										'usdc'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										USDC Value
									</button>
								</div>
							</div>
						</div>

						<!-- Chart -->
						{#if selectedCode}
							<div class="relative h-80">
								{#if !chartLibLoaded}
									<div class="absolute inset-0 flex items-center justify-center">
										<div class="text-gray-400">Loading chart...</div>
									</div>
								{/if}
								<canvas bind:this={codeChartCanvas} class="h-full w-full"></canvas>
							</div>
						{:else}
							<p class="py-8 text-center text-gray-400">Select an access code to view the chart</p>
						{/if}
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
				<!-- Wallet Stats - Bar Chart -->
				<Card>
					{#if allDates.length === 0 || allWalletAddresses.length === 0}
						<p class="py-4 text-center text-gray-400">No wallet activity found</p>
					{:else}
						<!-- Controls Row -->
						<div class="mb-6 flex flex-wrap items-center gap-4">
							<h3 class="text-lg font-medium text-white">
								Daily {walletChartMetric === 'count' ? 'Transaction Count' : 'USDC Volume'}
							</h3>

							<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
								<!-- Wallet Dropdown -->
								<div class="wallet-dropdown relative">
									<button
										on:click={() => (walletDropdownOpen = !walletDropdownOpen)}
										class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
									>
										<span>
											{#if selectedWallets.size === allWalletAddresses.length}
												All Wallets
											{:else if selectedWallets.size === 0}
												No Wallets
											{:else}
												{selectedWallets.size} Wallet{selectedWallets.size > 1 ? 's' : ''}
											{/if}
										</span>
										<svg
											class="h-4 w-4 transition-transform {walletDropdownOpen ? 'rotate-180' : ''}"
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

									{#if walletDropdownOpen}
										<div
											class="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
										>
											<div class="border-b border-gray-700 px-3 py-2">
												<div class="flex gap-2">
													<button
														on:click={selectAllWallets}
														class="text-xs text-[#e8be89] hover:underline"
													>
														Select All
													</button>
													<span class="text-gray-600">|</span>
													<button
														on:click={clearAllWallets}
														class="text-xs text-gray-400 hover:underline"
													>
														Clear
													</button>
												</div>
											</div>
											{#each allWalletAddresses as wallet}
												<button
													on:click={() => toggleWallet(wallet)}
													class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700"
												>
													<span
														class="flex h-4 w-4 items-center justify-center rounded border {selectedWallets.has(
															wallet
														)
															? 'border-[#e8be89] bg-[#e8be89]'
															: 'border-gray-500'}"
													>
														{#if selectedWallets.has(wallet)}
															<svg
																class="h-3 w-3 text-gray-900"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="3"
																	d="M5 13l4 4L19 7"
																/>
															</svg>
														{/if}
													</span>
													<span class="font-mono text-white">{truncateAddress(wallet)}</span>
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<!-- Metric Toggle -->
								<div class="flex rounded-lg bg-gray-800 p-1">
									<button
										on:click={() => (walletChartMetric = 'count')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {walletChartMetric ===
										'count'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										# of Tx
									</button>
									<button
										on:click={() => (walletChartMetric = 'usdc')}
										class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {walletChartMetric ===
										'usdc'
											? 'bg-[#e8be89] text-gray-900'
											: 'text-gray-400 hover:text-white'}"
									>
										USDC Value
									</button>
								</div>
							</div>
						</div>

						<!-- Chart -->
						{#if selectedWallets.size > 0}
							<div class="relative h-80">
								{#if !chartLibLoaded}
									<div class="absolute inset-0 flex items-center justify-center">
										<div class="text-gray-400">Loading chart...</div>
									</div>
								{/if}
								<canvas bind:this={walletChartCanvas} class="h-full w-full"></canvas>
							</div>
						{:else}
							<p class="py-8 text-center text-gray-400">
								Select at least one wallet to view the chart
							</p>
						{/if}
					{/if}
				</Card>
			{/if}
		{/if}
	{:else if activeSection === 'tvl'}
		<!-- TVL Section (Snapshot-based) -->

		{#if tvlError}
			<div class="mb-6 rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
				{tvlError}
			</div>
		{/if}

		{#if tvlLoading && !tvlLastUpdated}
			<div class="flex items-center gap-3 text-gray-400">
				<div
					class="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#e8be89]"
				></div>
				Loading TVL data from snapshots...
			</div>
		{:else if !tvlData.latest}
			<div class="py-8 text-center text-gray-400">
				<p>No TVL data available</p>
				<p class="mt-2 text-sm">Snapshots have not been generated yet.</p>
			</div>
		{:else}
			<!-- Latest TVL Headline -->
			<div class="mb-8">
				<Card>
					<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<p class="text-4xl font-bold text-[#e8be89]">{formatUsd(tvlData.latest.totalTvl)}</p>
							<p class="mt-1 text-sm text-gray-400">Total Value Locked (All ST0x Tokens)</p>
							<div class="mt-3 border-t border-gray-700 pt-3">
								<p class="text-2xl font-semibold text-white">
									{formatUsd(tvlData.latest.eligibleTvl)}
								</p>
								<p class="text-xs text-gray-400">
									Eligible TVL (excluding {tvlData.latest.excludedWalletCount} excluded wallet{tvlData
										.latest.excludedWalletCount !== 1
										? 's'
										: ''})
								</p>
							</div>
							<div class="mt-3 border-t border-gray-700 pt-3">
								<p class="text-2xl font-semibold text-green-400">
									{formatUsd(tvlData.latest.tvlExcludingTeam)}
								</p>
								<p class="text-xs text-gray-400">
									TVL Excluding Team (excluding {tvlData.latest.excludedWalletCount} excluded + {tvlData
										.latest.teamWalletCount} team wallet{tvlData.latest.teamWalletCount !== 1
										? 's'
										: ''})
								</p>
							</div>
						</div>
						<div class="text-right">
							<p class="text-sm text-gray-400">
								Snapshot: {new Date(tvlData.latest.timestamp * 1000).toLocaleString()}
							</p>
							<p class="text-xs text-gray-500">
								Block #{tvlData.latest.blockNumber.toLocaleString()} · {tvlData.latest.walletCount} eligible
								wallets
							</p>
							<p class="mt-1 text-xs italic text-gray-500">Approx. end of day balances</p>
						</div>
					</div>
				</Card>
			</div>

			<!-- TVL by Token Breakdown -->
			<div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each Object.entries(tvlData.latest.tokenTvl).sort((a, b) => b[1] - a[1]) as [symbol, tvl]}
					<Card>
						<div class="text-center">
							<p class="text-xl font-bold text-white">{formatUsd(tvl)}</p>
							<p class="mt-1 text-sm text-gray-400">{symbol}</p>
							<p class="text-xs text-gray-500">
								{tvlData.latest.totalTvl > 0
									? ((tvl / tvlData.latest.totalTvl) * 100).toFixed(1)
									: 0}%
							</p>
						</div>
					</Card>
				{/each}
			</div>

			<!-- TVL Tab Navigation -->
			<div class="mb-6 border-b border-gray-700">
				<nav class="-mb-px flex flex-wrap gap-6">
					<button
						on:click={() => (activeTvlTab = 'tokens')}
						class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTvlTab === 'tokens'
							? 'border-[#e8be89] text-[#e8be89]'
							: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
					>
						By Token
					</button>
					<button
						on:click={() => (activeTvlTab = 'codes')}
						class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTvlTab === 'codes'
							? 'border-[#e8be89] text-[#e8be89]'
							: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
					>
						By Access Code
					</button>
					<button
						on:click={() => (activeTvlTab = 'wallets')}
						class="border-b-2 pb-3 text-sm font-medium transition-colors {activeTvlTab === 'wallets'
							? 'border-[#e8be89] text-[#e8be89]'
							: 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'}"
					>
						By Wallet
					</button>
				</nav>
			</div>

			<!-- TVL Tab Content -->
			{#if activeTvlTab === 'tokens'}
				<!-- Daily TVL Chart -->
				<Card>
					<div class="mb-6 flex flex-wrap items-center gap-4">
						<h3 class="text-lg font-medium text-white">Daily TVL</h3>

						<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
							<!-- Wallet Filter Dropdown -->
							<div class="tvl-filter-dropdown relative">
								<button
									on:click={() => (tvlFilterDropdownOpen = !tvlFilterDropdownOpen)}
									class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
								>
									<span>
										{tvlFilterOptions.find((o) => o.value === tvlFilter)?.label || 'Select Filter'}
									</span>
									<svg
										class="h-4 w-4 transition-transform {tvlFilterDropdownOpen ? 'rotate-180' : ''}"
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

								{#if tvlFilterDropdownOpen}
									<div
										class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
									>
										{#each tvlFilterOptions as option}
											<button
												on:click={() => {
													tvlFilter = option.value;
													tvlFilterDropdownOpen = false;
												}}
												class="flex w-full flex-col px-3 py-2 text-left hover:bg-gray-700 {tvlFilter ===
												option.value
													? 'bg-gray-700'
													: ''}"
											>
												<span class="text-sm font-medium text-white">{option.label}</span>
												<span class="text-xs text-gray-400">{option.description}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Chart -->
					{#if tvlChartData.length > 0}
						<div class="relative h-80">
							{#if !chartLibLoaded}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-gray-400">Loading chart...</div>
								</div>
							{/if}
							<canvas bind:this={tvlChartCanvas} class="h-full w-full"></canvas>
						</div>
					{:else}
						<p class="py-8 text-center text-gray-400">No historical TVL data available</p>
					{/if}
				</Card>
			{:else if activeTvlTab === 'codes'}
				<!-- TVL by Access Code -->
				<Card>
					<div class="mb-6 flex flex-wrap items-center gap-4">
						<h3 class="text-lg font-medium text-white">Daily TVL by Access Code</h3>

						<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
							<!-- Code Dropdown -->
							<div class="tvl-code-dropdown relative">
								<button
									on:click={() => (tvlCodeDropdownOpen = !tvlCodeDropdownOpen)}
									class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
								>
									<span>
										{#if tvlSelectedCode}
											{tvlSelectedCode}
										{:else}
											Select Code
										{/if}
									</span>
									<svg
										class="h-4 w-4 transition-transform {tvlCodeDropdownOpen ? 'rotate-180' : ''}"
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

								{#if tvlCodeDropdownOpen}
									<div
										class="absolute left-0 top-full z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
									>
										{#each tvlCodes as code}
											<button
												on:click={() => {
													tvlSelectedCode = code;
													tvlCodeDropdownOpen = false;
												}}
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700 {tvlSelectedCode ===
												code
													? 'bg-gray-700'
													: ''}"
											>
												<span class="text-white">{code}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Current Code TVL Stats -->
					{#if tvlSelectedCode && tvlData.latest}
						{@const codeEntry = tvlData.latest.codeTvl.find((c) => c.code === tvlSelectedCode)}
						{#if codeEntry}
							<div class="mb-6 grid gap-4 sm:grid-cols-3">
								<div class="rounded-lg bg-gray-800/50 p-4 text-center">
									<p class="text-2xl font-bold text-[#e8be89]">{formatUsd(codeEntry.tvl)}</p>
									<p class="mt-1 text-sm text-gray-400">Current TVL</p>
								</div>
								<div class="rounded-lg bg-gray-800/50 p-4 text-center">
									<p class="text-2xl font-bold text-white">{codeEntry.walletCount}</p>
									<p class="mt-1 text-sm text-gray-400">Wallets</p>
								</div>
								<div class="rounded-lg bg-gray-800/50 p-4 text-center">
									<p class="text-2xl font-bold text-white">
										{tvlData.latest.totalTvl > 0
											? ((codeEntry.tvl / tvlData.latest.totalTvl) * 100).toFixed(1)
											: 0}%
									</p>
									<p class="mt-1 text-sm text-gray-400">Share of Total</p>
								</div>
							</div>
						{/if}
					{/if}

					<!-- Chart -->
					{#if tvlSelectedCode && tvlCodeChartData.length > 0}
						<div class="relative h-80">
							{#if !chartLibLoaded}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-gray-400">Loading chart...</div>
								</div>
							{/if}
							<canvas bind:this={tvlCodeChartCanvas} class="h-full w-full"></canvas>
						</div>
					{:else if tvlCodes.length === 0}
						<p class="py-8 text-center text-gray-400">No access codes with TVL found</p>
					{:else}
						<p class="py-8 text-center text-gray-400">Select an access code to view TVL history</p>
					{/if}
				</Card>

				<!-- Code TVL Leaderboard -->
				{#if leaderboardCodeTvl.length > 0 || (tvlData.latest && tvlData.latest.codeTvl.length > 0)}
					<Card>
						<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
							<h3 class="text-lg font-medium text-white">Access Code TVL Leaderboard</h3>

							<!-- Month Filter Dropdown -->
							<div class="leaderboard-month-dropdown relative">
								<button
									on:click={() => (leaderboardMonthDropdownOpen = !leaderboardMonthDropdownOpen)}
									class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
								>
									<span>
										{#if leaderboardMonth === 'latest'}
											Latest
										{:else}
											{new Date(leaderboardMonth + '-01').toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short'
											})}
										{/if}
									</span>
									<svg
										class="h-4 w-4 transition-transform {leaderboardMonthDropdownOpen
											? 'rotate-180'
											: ''}"
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

								{#if leaderboardMonthDropdownOpen}
									<div
										class="absolute right-0 top-full z-20 mt-1 max-h-64 w-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
									>
										<button
											on:click={() => {
												leaderboardMonth = 'latest';
												leaderboardMonthDropdownOpen = false;
											}}
											class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-700 {leaderboardMonth ===
											'latest'
												? 'bg-gray-700 text-[#e8be89]'
												: 'text-white'}"
										>
											Latest
										</button>
										{#each leaderboardMonthOptions as month}
											<button
												on:click={() => {
													leaderboardMonth = month;
													leaderboardMonthDropdownOpen = false;
												}}
												class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-700 {leaderboardMonth ===
												month
													? 'bg-gray-700 text-[#e8be89]'
													: 'text-white'}"
											>
												{new Date(month + '-01').toLocaleDateString('en-US', {
													year: 'numeric',
													month: 'short'
												})}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						{#if leaderboardCodeTvl.length > 0}
							<div class="overflow-x-auto">
								<table class="w-full text-left text-sm">
									<thead>
										<tr class="border-b border-gray-700 text-gray-400">
											<th class="pb-3 pr-4">Rank</th>
											<th class="pb-3 pr-4">Access Code</th>
											<th class="pb-3 pr-4 text-right">TVL</th>
											{#if leaderboardMonth === 'latest'}
												<th class="pb-3 pr-4 text-right">Wallets</th>
											{/if}
											<th class="pb-3 text-right">Share</th>
										</tr>
									</thead>
									<tbody>
										{#each leaderboardCodeTvl.slice(0, 20) as entry, i}
											<tr class="border-b border-gray-800 hover:bg-gray-800/50">
												<td class="py-3 pr-4 text-gray-400">{i + 1}</td>
												<td class="py-3 pr-4 font-mono text-white">{entry.code}</td>
												<td class="py-3 pr-4 text-right font-medium text-[#e8be89]"
													>{formatUsd(entry.tvl)}</td
												>
												{#if leaderboardMonth === 'latest'}
													<td class="py-3 pr-4 text-right text-gray-300">{entry.walletCount}</td>
												{/if}
												<td class="py-3 text-right text-gray-400">
													{leaderboardTotalTvl > 0
														? ((entry.tvl / leaderboardTotalTvl) * 100).toFixed(1)
														: 0}%
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if leaderboardMonth !== 'latest'}
								<p class="mt-3 text-xs text-gray-500">
									Showing end-of-month snapshot. Wallet count not available for historical data.
								</p>
							{/if}
						{:else}
							<p class="py-4 text-center text-gray-400">No data available for this month</p>
						{/if}
					</Card>
				{/if}
			{:else if activeTvlTab === 'wallets'}
				<!-- TVL by Wallet -->
				<Card>
					<div class="mb-6 flex flex-wrap items-center gap-4">
						<h3 class="text-lg font-medium text-white">Daily TVL by Wallet</h3>

						<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
							<!-- Wallet Dropdown -->
							<div class="tvl-wallet-dropdown relative">
								<button
									on:click={() => (tvlWalletDropdownOpen = !tvlWalletDropdownOpen)}
									class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
								>
									<span>
										{#if tvlSelectedWallets.size === tvlWalletAddresses.length}
											All Wallets (Top 20)
										{:else if tvlSelectedWallets.size === 0}
											No Wallets
										{:else}
											{tvlSelectedWallets.size} Wallet{tvlSelectedWallets.size > 1 ? 's' : ''}
										{/if}
									</span>
									<svg
										class="h-4 w-4 transition-transform {tvlWalletDropdownOpen ? 'rotate-180' : ''}"
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

								{#if tvlWalletDropdownOpen}
									<div
										class="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
									>
										<div class="border-b border-gray-700 px-3 py-2">
											<div class="flex gap-2">
												<button
													on:click={selectAllTvlWallets}
													class="text-xs text-[#e8be89] hover:underline"
												>
													Select All
												</button>
												<span class="text-gray-600">|</span>
												<button
													on:click={clearAllTvlWallets}
													class="text-xs text-gray-400 hover:underline"
												>
													Clear
												</button>
											</div>
										</div>
										{#each tvlWalletAddresses as wallet}
											<button
												on:click={() => toggleTvlWallet(wallet)}
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700"
											>
												<span
													class="flex h-4 w-4 items-center justify-center rounded border {tvlSelectedWallets.has(
														wallet
													)
														? 'border-[#e8be89] bg-[#e8be89]'
														: 'border-gray-500'}"
												>
													{#if tvlSelectedWallets.has(wallet)}
														<svg
															class="h-3 w-3 text-gray-900"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="3"
																d="M5 13l4 4L19 7"
															/>
														</svg>
													{/if}
												</span>
												<span class="font-mono text-xs text-white">{truncateAddress(wallet)}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Chart -->
					{#if tvlSelectedWallets.size > 0 && tvlWalletChartData.length > 0}
						<div class="relative h-80">
							{#if !chartLibLoaded}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-gray-400">Loading chart...</div>
								</div>
							{/if}
							<canvas bind:this={tvlWalletChartCanvas} class="h-full w-full"></canvas>
						</div>
					{:else if tvlWalletAddresses.length === 0}
						<p class="py-8 text-center text-gray-400">No wallets with TVL found</p>
					{:else}
						<p class="py-8 text-center text-gray-400">
							Select at least one wallet to view the chart
						</p>
					{/if}
				</Card>

				<!-- Wallet TVL Leaderboard -->
				{#if tvlData.latest && tvlData.latest.walletTvl.length > 0}
					<Card>
						<h3 class="mb-4 text-lg font-medium text-white">Wallet TVL Leaderboard</h3>
						<div class="overflow-x-auto">
							<table class="w-full text-left text-sm">
								<thead>
									<tr class="border-b border-gray-700 text-gray-400">
										<th class="pb-3 pr-4">Rank</th>
										<th class="pb-3 pr-4">Wallet</th>
										<th class="pb-3 pr-4">Access Code</th>
										<th class="pb-3 pr-4 text-right">TVL</th>
										<th class="pb-3 text-right">Share</th>
									</tr>
								</thead>
								<tbody>
									{#each tvlData.latest.walletTvl.slice(0, 20) as entry, i}
										<tr class="border-b border-gray-800 hover:bg-gray-800/50">
											<td class="py-3 pr-4 text-gray-400">{i + 1}</td>
											<td class="py-3 pr-4 font-mono text-xs text-white">
												{truncateAddress(entry.address)}
											</td>
											<td class="py-3 pr-4 text-gray-300">{entry.accessCode || '-'}</td>
											<td class="py-3 pr-4 text-right font-medium text-[#e8be89]"
												>{formatUsd(entry.tvl)}</td
											>
											<td class="py-3 text-right text-gray-400">
												{tvlData.latest.totalTvl > 0
													? ((entry.tvl / tvlData.latest.totalTvl) * 100).toFixed(1)
													: 0}%
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Card>
				{/if}
			{/if}
		{/if}
	{:else if activeSection === 'swaps'}
		<!-- Swap Snapshot Section -->
		{#if swapLoading}
			<Card>
				<div class="flex items-center justify-center py-12">
					<div class="text-gray-400">Loading swap snapshot data...</div>
				</div>
			</Card>
		{:else if swapError}
			<Card>
				<div class="py-8 text-center text-red-400">{swapError}</div>
			</Card>
		{:else if swapData}
			<!-- Swap Order Vaults -->
			<Card>
				<h3 class="mb-4 text-lg font-medium text-white">Swap Order Vaults</h3>
				<p class="mb-4 text-sm text-gray-400">
					Input vault = legacy tokens received from users. Output vault = wrapped tokens given to
					users.
				</p>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-gray-700 text-gray-400">
								<th class="pb-3 pr-4">Token</th>
								<th class="pb-3 pr-4">Status</th>
								<th class="pb-3 pr-4 text-right">Input (Legacy Received)</th>
								<th class="pb-3 pr-4 text-right">Output (Wrapped Remaining)</th>
								<th class="pb-3 pr-4 text-right">Legacy Outstanding</th>
								<th class="pb-3 pr-4 text-right">Team Legacy</th>
								<th class="pb-3 pr-4">Order Hash</th>
							</tr>
						</thead>
						<tbody>
							{#each swapData.swapOrders as order}
								<tr class="border-b border-gray-800 hover:bg-gray-800/50">
									<td class="py-3 pr-4">
										<span class="font-medium text-white">{order.legacySymbol}</span>
										<span class="text-gray-500"> → </span>
										<span class="text-[#e8be89]">{order.wrappedSymbol}</span>
									</td>
									<td class="py-3 pr-4">
										{#if order.inputVault === null && order.outputVault === null}
											<span class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400"
												>Not Found</span
											>
										{:else if order.orderActive}
											<span class="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400"
												>Active</span
											>
										{:else}
											<span class="rounded bg-red-900/50 px-2 py-0.5 text-xs text-red-400"
												>Inactive</span
											>
										{/if}
									</td>
									<td class="py-3 pr-4 text-right">
										{#if order.inputVault}
											<span class="font-mono text-white"
												>{Number(order.inputVault.balanceFormatted).toFixed(4)}</span
											>
											<span class="ml-1 text-xs text-gray-400">{order.inputVault.tokenSymbol}</span>
										{:else}
											<span class="text-gray-500">—</span>
										{/if}
									</td>
									<td class="py-3 pr-4 text-right">
										{#if order.outputVault}
											<span class="font-mono text-white"
												>{Number(order.outputVault.balanceFormatted).toFixed(4)}</span
											>
											<span class="ml-1 text-xs text-gray-400">{order.outputVault.tokenSymbol}</span
											>
										{:else}
											<span class="text-gray-500">—</span>
										{/if}
									</td>
									<td class="py-3 pr-4 text-right">
										<span class="font-mono text-white"
											>{Number(order.legacyOutstandingFormatted).toFixed(4)}</span
										>
									</td>
									<td class="py-3 pr-4 text-right">
										<span class="font-mono text-white"
											>{Number(order.teamLegacyFormatted).toFixed(4)}</span
										>
									</td>
									<td class="py-3 pr-4">
										<span class="font-mono text-xs text-gray-400" title={order.orderHash}>
											{order.orderHash.slice(0, 10)}...
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>

			<!-- Legacy Token Balances -->
			<Card>
				<h3 class="mb-4 text-lg font-medium text-white">Remaining Legacy Token Balances</h3>
				<p class="mb-4 text-sm text-gray-400">
					Holders still on old (pre-migration) tokens. Click a row to see individual holders.
				</p>
				{#if swapData.legacyBalances.length === 0}
					<p class="py-8 text-center text-gray-400">No legacy token data found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b border-gray-700 text-gray-400">
									<th class="pb-3 pr-4">Legacy Token</th>
									<th class="pb-3 pr-4">Wrapped Token</th>
									<th class="pb-3 pr-4 text-right">Total Supply</th>
									<th class="pb-3 pr-4 text-right">Holders</th>
									<th class="pb-3 pr-4">Legacy Address</th>
								</tr>
							</thead>
							<tbody>
								{#each swapData.legacyBalances as entry}
									<tr
										class="cursor-pointer border-b border-gray-800 hover:bg-gray-800/50"
										on:click={() => toggleLegacyExpand(entry.legacySymbol)}
									>
										<td class="py-3 pr-4 font-medium text-white">{entry.legacySymbol}</td>
										<td class="py-3 pr-4 text-[#e8be89]">{entry.wrappedSymbol}</td>
										<td class="py-3 pr-4 text-right font-mono text-white">
											{Number(entry.totalSupplyFormatted).toFixed(4)}
										</td>
										<td class="py-3 pr-4 text-right text-gray-300">{entry.holderCount}</td>
										<td class="py-3 pr-4 font-mono text-xs text-gray-400">
											{truncateAddress(entry.legacyAddress)}
										</td>
									</tr>
									{#if expandedLegacyTokens.has(entry.legacySymbol) && entry.holders.length > 0}
										<tr>
											<td colspan="5" class="bg-gray-900/50 px-4 py-3">
												<table class="w-full text-left text-xs">
													<thead>
														<tr class="text-gray-500">
															<th class="pb-2 pr-4">Holder Address</th>
															<th class="pb-2 text-right">Balance</th>
														</tr>
													</thead>
													<tbody>
														{#each entry.holders as holder}
															<tr class="border-b border-gray-800/50">
																<td class="py-2 pr-4 font-mono text-gray-300">
																	<a
																		href="https://basescan.org/address/{holder.address}"
																		target="_blank"
																		rel="noopener noreferrer"
																		class="hover:text-[#e8be89] hover:underline"
																	>
																		{truncateAddress(holder.address)}
																	</a>
																</td>
																<td class="py-2 text-right font-mono text-white">
																	{Number(holder.balanceFormatted).toFixed(4)}
																</td>
															</tr>
														{/each}
													</tbody>
												</table>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
		{/if}
	{/if}
</div>
