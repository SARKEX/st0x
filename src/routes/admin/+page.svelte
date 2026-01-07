<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Card from '$lib/components/ui/Card.svelte';
	import { networks } from '$lib/config/networks';
	import { TOKENS } from '$lib/config/tokens';
	import { toDecimal } from '$lib/utils/tokenMath';

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
	let tvlTokenChartCanvas: HTMLCanvasElement | null = null;
	let tvlTokenChart: ChartInstance = null;
	let tvlCodeChartCanvas: HTMLCanvasElement | null = null;
	let tvlCodeChart: ChartInstance = null;
	let tvlWalletChartCanvas: HTMLCanvasElement | null = null;
	let tvlWalletChart: ChartInstance = null;

	// Build set of valid token addresses (lowercase) from the token list (asset tokens only, not USDC)
	const validTokenAddresses = new Set(TOKENS.map((t) => t.address.toLowerCase()));

	// Section types (top-level navigation)
	type Section = 'activity' | 'tvl';
	let activeSection: Section = 'activity';

	// Tab types
	type Tab = 'tokens' | 'codes' | 'wallets' | 'transactions';
	let activeTab: Tab = 'tokens';

	// TVL Tab types
	type TvlTab = 'tokens' | 'codes' | 'wallets';
	let activeTvlTab: TvlTab = 'tokens';

	// Period selector
	type PeriodPreset = '24h' | '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
	let selectedPeriod: PeriodPreset = '30d';
	let customStartDate = '';
	let customEndDate = '';

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

		const dayInSeconds = 24 * 60 * 60;
		switch (selectedPeriod) {
			case '24h':
				return { start: now - dayInSeconds, end: now };
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
		totalTvl: number;
		tokenTvl: Record<string, number>;
		walletTvl: Record<string, number>;
		codeTvl: Record<string, number>;
	}

	interface TvlData {
		latest: {
			timestamp: number;
			blockNumber: number;
			totalTvl: number;
			tokenTvl: Record<string, number>;
			walletTvl: WalletTvlEntry[];
			codeTvl: CodeTvlEntry[];
			walletCount: number;
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
	let cumulativeNetVolume = 0; // LP net USDC flow (positive = LP received USDC from user buys)

	// TVL data (from snapshots)
	let tvlLoading = false;
	let tvlError = '';
	let tvlData: TvlData = { latest: null, daily: [] };
	let tvlLastUpdated: Date | null = null;

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

	function toggleToken(symbol: string) {
		if (selectedTokens.has(symbol)) {
			selectedTokens.delete(symbol);
		} else {
			selectedTokens.add(symbol);
		}
		selectedTokens = selectedTokens; // Trigger reactivity
	}

	function selectAllTokens() {
		selectedTokens = new Set(allTokenSymbols);
	}

	function clearAllTokens() {
		selectedTokens = new Set();
	}

	function closeDropdownOnClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.token-dropdown')) {
			tokenDropdownOpen = false;
		}
		if (!target.closest('.code-dropdown')) {
			codeDropdownOpen = false;
		}
		if (!target.closest('.wallet-dropdown')) {
			walletDropdownOpen = false;
		}
		// TVL dropdowns
		if (!target.closest('.tvl-token-dropdown')) {
			tvlTokenDropdownOpen = false;
		}
		if (!target.closest('.tvl-code-dropdown')) {
			tvlCodeDropdownOpen = false;
		}
		if (!target.closest('.tvl-wallet-dropdown')) {
			tvlWalletDropdownOpen = false;
		}
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
		if (selectedWallets.has(wallet)) {
			selectedWallets.delete(wallet);
		} else {
			selectedWallets.add(wallet);
		}
		selectedWallets = selectedWallets;
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

	// TVL Token chart controls (snapshot-based)
	let tvlSelectedTokens: Set<string> = new Set();
	let tvlTokenDropdownOpen = false;

	// Get available token symbols from TVL data
	$: tvlTokenSymbols = tvlData.latest ? Object.keys(tvlData.latest.tokenTvl).sort() : [];

	// Initialize selected tokens when tvlTokenSymbols changes
	$: if (tvlTokenSymbols.length > 0 && tvlSelectedTokens.size === 0) {
		tvlSelectedTokens = new Set(tvlTokenSymbols);
	}

	function toggleTvlToken(symbol: string) {
		if (tvlSelectedTokens.has(symbol)) {
			tvlSelectedTokens.delete(symbol);
		} else {
			tvlSelectedTokens.add(symbol);
		}
		tvlSelectedTokens = tvlSelectedTokens;
	}

	function selectAllTvlTokens() {
		tvlSelectedTokens = new Set(tvlTokenSymbols);
	}

	function clearAllTvlTokens() {
		tvlSelectedTokens = new Set();
	}

	// TVL chart data from snapshots - daily TVL by token
	$: tvlTokenChartData = tvlData.daily.map((entry) => {
		const tokenValues: Record<string, number> = {};
		let total = 0;

		for (const symbol of tvlTokenSymbols) {
			if (tvlSelectedTokens.has(symbol)) {
				const value = entry.tokenTvl[symbol] || 0;
				tokenValues[symbol] = value;
				total += value;
			}
		}

		return { date: entry.date, tokenValues, total };
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
		if (tvlSelectedWallets.has(wallet)) {
			tvlSelectedWallets.delete(wallet);
		} else {
			tvlSelectedWallets.add(wallet);
		}
		tvlSelectedWallets = tvlSelectedWallets;
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

	function updateTokenChart() {
		if (!ChartCtor || !tokenChartCanvas) return;
		const ctx = tokenChartCanvas.getContext('2d');
		if (!ctx) return;

		// Destroy existing chart
		if (tokenChart) {
			tokenChart.destroy();
			tokenChart = null;
		}

		// Single dataset showing total of selected tokens
		const chartLabel = tokenChartMetric === 'count' ? 'Total Transactions' : 'Total USDC Volume';

		tokenChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: tokenChartData.map((d) => d.date),
				datasets: [
					{
						label: chartLabel,
						data: tokenChartData.map((day) => day.total),
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
				interaction: {
					mode: 'index',
					intersect: false
				},
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						borderColor: 'rgba(75, 85, 99, 0.3)',
						borderWidth: 1,
						padding: 12,
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								if (tokenChartMetric === 'usdc') {
									return formatUsd(value);
								}
								return `${value} transactions`;
							}
						}
					}
				},
				scales: {
					x: {
						ticks: {
							color: '#9ca3af',
							maxRotation: 45,
							minRotation: 0
						},
						grid: {
							color: 'rgba(75, 85, 99, 0.2)'
						}
					},
					y: {
						beginAtZero: true,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (tokenChartMetric === 'usdc') {
									if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
									return `$${num.toFixed(0)}`;
								}
								return num;
							}
						},
						grid: {
							color: 'rgba(75, 85, 99, 0.2)'
						}
					}
				}
			}
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
		if (!ChartCtor || !codeChartCanvas) return;
		const ctx = codeChartCanvas.getContext('2d');
		if (!ctx) return;

		if (codeChart) {
			codeChart.destroy();
			codeChart = null;
		}

		const chartLabel = codeChartMetric === 'count' ? 'Transactions' : 'USDC Volume';

		codeChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: codeChartData.map((d) => d.date),
				datasets: [
					{
						label: chartLabel,
						data: codeChartData.map((d) => d.value),
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
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								return codeChartMetric === 'usdc' ? formatUsd(value) : `${value} transactions`;
							}
						}
					}
				},
				scales: {
					x: {
						ticks: { color: '#9ca3af', maxRotation: 45 },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					},
					y: {
						beginAtZero: true,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (codeChartMetric === 'usdc') {
									return num >= 1000 ? `$${(num / 1000).toFixed(0)}k` : `$${num.toFixed(0)}`;
								}
								return num;
							}
						},
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
		});
	}

	$: if (browser && chartLibLoaded && codeChartCanvas && activeTab === 'codes') {
		void codeChartData;
		void selectedCode;
		void codeChartMetric;
		setTimeout(() => updateCodeChart(), 0);
	}

	function updateWalletChart() {
		if (!ChartCtor || !walletChartCanvas) return;
		const ctx = walletChartCanvas.getContext('2d');
		if (!ctx) return;

		if (walletChart) {
			walletChart.destroy();
			walletChart = null;
		}

		const chartLabel = walletChartMetric === 'count' ? 'Total Transactions' : 'Total USDC Volume';

		walletChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: walletChartData.map((d) => d.date),
				datasets: [
					{
						label: chartLabel,
						data: walletChartData.map((d) => d.total),
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
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								return walletChartMetric === 'usdc' ? formatUsd(value) : `${value} transactions`;
							}
						}
					}
				},
				scales: {
					x: {
						ticks: { color: '#9ca3af', maxRotation: 45 },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					},
					y: {
						beginAtZero: true,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (walletChartMetric === 'usdc') {
									return num >= 1000 ? `$${(num / 1000).toFixed(0)}k` : `$${num.toFixed(0)}`;
								}
								return num;
							}
						},
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
		});
	}

	$: if (browser && chartLibLoaded && walletChartCanvas && activeTab === 'wallets') {
		void walletChartData;
		void selectedWallets;
		void walletChartMetric;
		setTimeout(() => updateWalletChart(), 0);
	}

	// TVL Chart update functions
	function updateTvlTokenChart() {
		if (!ChartCtor || !tvlTokenChartCanvas) return;
		const ctx = tvlTokenChartCanvas.getContext('2d');
		if (!ctx) return;

		if (tvlTokenChart) {
			tvlTokenChart.destroy();
			tvlTokenChart = null;
		}

		tvlTokenChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: tvlTokenChartData.map((d) => d.date),
				datasets: [
					{
						label: 'TVL (USD)',
						data: tvlTokenChartData.map((day) => day.total),
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
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								return formatUsd(value);
							}
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
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
								if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
								return `$${num.toFixed(0)}`;
							}
						},
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
		});
	}

	$: if (
		browser &&
		chartLibLoaded &&
		tvlTokenChartCanvas &&
		activeSection === 'tvl' &&
		activeTvlTab === 'tokens'
	) {
		void tvlTokenChartData;
		void tvlSelectedTokens;
		setTimeout(() => updateTvlTokenChart(), 0);
	}

	// TVL Code Chart update function
	function updateTvlCodeChart() {
		if (!ChartCtor || !tvlCodeChartCanvas) return;
		const ctx = tvlCodeChartCanvas.getContext('2d');
		if (!ctx) return;

		if (tvlCodeChart) {
			tvlCodeChart.destroy();
			tvlCodeChart = null;
		}

		tvlCodeChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: tvlCodeChartData.map((d) => d.date),
				datasets: [
					{
						label: 'TVL (USD)',
						data: tvlCodeChartData.map((d) => d.value),
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
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								return formatUsd(value);
							}
						}
					}
				},
				scales: {
					x: {
						ticks: { color: '#9ca3af', maxRotation: 45 },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					},
					y: {
						beginAtZero: true,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
								if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
								return `$${num.toFixed(0)}`;
							}
						},
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
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

	// TVL Wallet Chart update function
	function updateTvlWalletChart() {
		if (!ChartCtor || !tvlWalletChartCanvas) return;
		const ctx = tvlWalletChartCanvas.getContext('2d');
		if (!ctx) return;

		if (tvlWalletChart) {
			tvlWalletChart.destroy();
			tvlWalletChart = null;
		}

		tvlWalletChart = new ChartCtor(ctx, {
			type: 'bar',
			data: {
				labels: tvlWalletChartData.map((d) => d.date),
				datasets: [
					{
						label: 'TVL (USD)',
						data: tvlWalletChartData.map((d) => d.total),
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
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(17, 24, 39, 0.95)',
						titleColor: '#f3f4f6',
						bodyColor: '#d1d5db',
						callbacks: {
							label: (context: { parsed?: { y?: number } }) => {
								const value = context.parsed?.y || 0;
								return formatUsd(value);
							}
						}
					}
				},
				scales: {
					x: {
						ticks: { color: '#9ca3af', maxRotation: 45 },
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					},
					y: {
						beginAtZero: true,
						ticks: {
							color: '#9ca3af',
							callback: (value: string | number) => {
								const num = Number(value);
								if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
								if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
								return `$${num.toFixed(0)}`;
							}
						},
						grid: { color: 'rgba(75, 85, 99, 0.2)' }
					}
				}
			}
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
	const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase();
	// LP wallet that provides liquidity - used to calculate net platform inflow/outflow
	const LP_WALLET = '0x71b94911fd1ce621fc40970450004c544e5287a8'.toLowerCase();

	// Fetch TVL data from snapshots
	async function fetchTvlData() {
		tvlLoading = true;
		tvlError = '';

		try {
			const res = await fetch('/api/admin/tvl?limit=90');
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

	onMount(() => {
		// Set default custom dates
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		customEndDate = now.toISOString().split('T')[0];
		customStartDate = thirtyDaysAgo.toISOString().split('T')[0];

		loadAllData();
		fetchTvlData();

		// Load Chart.js library
		ensureChartLib();

		// Close dropdown on click outside
		document.addEventListener('click', closeDropdownOnClickOutside);
	});

	onDestroy(() => {
		// Destroy charts on unmount
		if (tokenChart) {
			tokenChart.destroy();
			tokenChart = null;
		}
		if (codeChart) {
			codeChart.destroy();
			codeChart = null;
		}
		if (walletChart) {
			walletChart.destroy();
			walletChart = null;
		}
		// Destroy TVL charts
		if (tvlTokenChart) {
			tvlTokenChart.destroy();
			tvlTokenChart = null;
		}
		if (tvlCodeChart) {
			tvlCodeChart.destroy();
			tvlCodeChart = null;
		}
		if (tvlWalletChart) {
			tvlWalletChart.destroy();
			tvlWalletChart = null;
		}
		// Remove event listener
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

			// Track LP wallet net flow only (orders owned by LP)
			// From vault owner's perspective: input = receive, output = give
			if (vaultOwner === LP_WALLET) {
				if (inputToken.address.toLowerCase() === USDC_ADDRESS) {
					// LP received USDC (users bought from LP)
					lpNetUsdc += inputAmount;
				} else if (outputToken.address.toLowerCase() === USDC_ADDRESS) {
					// LP gave USDC (users sold to LP)
					lpNetUsdc -= outputAmount;
				}
			}

			// Token stats - track from vault owner's perspective
			const assetToken =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputToken : outputToken;
			const assetAmount =
				inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputAmount : outputAmount;
			const ownerIsBuying = outputToken.address.toLowerCase() === USDC_ADDRESS;
			const assetAddress = assetToken.address.toLowerCase();

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
				tokenSymbol: assetToken.symbol,
				direction: isBuying ? 'buy' : 'sell',
				tokenAmount: assetAmount,
				usdcAmount
			});

			// Daily breakdown
			const dateKey = timestamp.toISOString().split('T')[0];
			dateSet.add(dateKey);

			// Daily breakdown by token (deduped by txHash)
			if (assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)) {
				tokenSymbolSet.add(assetToken.symbol);
				addDailyStats(dailyTokenMap, seenTokenTx, dateKey, assetToken.symbol, txHash, usdcAmount);
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

		cumulativeNetVolume = lpNetUsdc;

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

	function truncateAddress(addr: string): string {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
		<div class="ml-auto flex items-center gap-3 pb-3">
			{#if lastUpdated}
				<span class="text-xs text-gray-500">
					Last updated: {formatTime(lastUpdated)}
				</span>
			{/if}
			<button
				on:click={loadAllData}
				disabled={loading}
				class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-gray-500 hover:bg-gray-700 disabled:opacity-50"
			>
				<svg
					class="h-4 w-4 {loading ? 'animate-spin' : ''}"
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
							<p class="mt-1 text-sm text-gray-400">Total Value Locked (TVL)</p>
						</div>
						<div class="text-right">
							<p class="text-sm text-gray-400">
								Snapshot: {new Date(tvlData.latest.timestamp * 1000).toLocaleString()}
							</p>
							<p class="text-xs text-gray-500">
								Block #{tvlData.latest.blockNumber.toLocaleString()} · {tvlData.latest.walletCount} wallets
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
				<!-- Daily TVL by Token Chart -->
				<Card>
					<div class="mb-6 flex flex-wrap items-center gap-4">
						<h3 class="text-lg font-medium text-white">Daily TVL by Token</h3>

						<div class="flex flex-1 flex-wrap items-center justify-end gap-3">
							<!-- Token Dropdown -->
							<div class="tvl-token-dropdown relative">
								<button
									on:click={() => (tvlTokenDropdownOpen = !tvlTokenDropdownOpen)}
									class="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:border-gray-500"
								>
									<span>
										{#if tvlSelectedTokens.size === tvlTokenSymbols.length}
											All Tokens
										{:else if tvlSelectedTokens.size === 0}
											No Tokens
										{:else}
											{tvlSelectedTokens.size} Token{tvlSelectedTokens.size > 1 ? 's' : ''}
										{/if}
									</span>
									<svg
										class="h-4 w-4 transition-transform {tvlTokenDropdownOpen ? 'rotate-180' : ''}"
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

								{#if tvlTokenDropdownOpen}
									<div
										class="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
									>
										<div class="border-b border-gray-700 px-3 py-2">
											<div class="flex gap-2">
												<button
													on:click={selectAllTvlTokens}
													class="text-xs text-[#e8be89] hover:underline"
												>
													Select All
												</button>
												<span class="text-gray-600">|</span>
												<button
													on:click={clearAllTvlTokens}
													class="text-xs text-gray-400 hover:underline"
												>
													Clear
												</button>
											</div>
										</div>
										{#each tvlTokenSymbols as symbol}
											<button
												on:click={() => toggleTvlToken(symbol)}
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700"
											>
												<span
													class="flex h-4 w-4 items-center justify-center rounded border {tvlSelectedTokens.has(
														symbol
													)
														? 'border-[#e8be89] bg-[#e8be89]'
														: 'border-gray-500'}"
												>
													{#if tvlSelectedTokens.has(symbol)}
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
						</div>
					</div>

					<!-- Chart -->
					{#if tvlSelectedTokens.size > 0 && tvlTokenChartData.length > 0}
						<div class="relative h-80">
							{#if !chartLibLoaded}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-gray-400">Loading chart...</div>
								</div>
							{/if}
							<canvas bind:this={tvlTokenChartCanvas} class="h-full w-full"></canvas>
						</div>
					{:else if tvlTokenChartData.length === 0}
						<p class="py-8 text-center text-gray-400">No historical TVL data available</p>
					{:else}
						<p class="py-8 text-center text-gray-400">
							Select at least one token to view the chart
						</p>
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
				{#if tvlData.latest && tvlData.latest.codeTvl.length > 0}
					<Card>
						<h3 class="mb-4 text-lg font-medium text-white">Access Code TVL Leaderboard</h3>
						<div class="overflow-x-auto">
							<table class="w-full text-left text-sm">
								<thead>
									<tr class="border-b border-gray-700 text-gray-400">
										<th class="pb-3 pr-4">Rank</th>
										<th class="pb-3 pr-4">Access Code</th>
										<th class="pb-3 pr-4 text-right">TVL</th>
										<th class="pb-3 pr-4 text-right">Wallets</th>
										<th class="pb-3 text-right">Share</th>
									</tr>
								</thead>
								<tbody>
									{#each tvlData.latest.codeTvl.slice(0, 20) as entry, i}
										<tr class="border-b border-gray-800 hover:bg-gray-800/50">
											<td class="py-3 pr-4 text-gray-400">{i + 1}</td>
											<td class="py-3 pr-4 font-mono text-white">{entry.code}</td>
											<td class="py-3 pr-4 text-right font-medium text-[#e8be89]"
												>{formatUsd(entry.tvl)}</td
											>
											<td class="py-3 pr-4 text-right text-gray-300">{entry.walletCount}</td>
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
												<span class="font-mono text-xs text-white"
													>{wallet.slice(0, 6)}...{wallet.slice(-4)}</span
												>
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
												{entry.address.slice(0, 6)}...{entry.address.slice(-4)}
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
	{/if}
</div>
